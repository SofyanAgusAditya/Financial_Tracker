package com.personal.financialtracker;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class FinanceNotificationListenerService extends NotificationListenerService {

    public static final String PREFS_NAME = "FinanceNotifQueue";
    private static final String KEY_QUEUE = "pending_items";
    private static final String KEY_RECENT_IDS = "recent_ids";
    private static final int MAX_QUEUE_SIZE = 100;
    public static final Object QUEUE_LOCK = new Object();

    private static final Map<String, String> SUPPORTED_APPS = createSupportedApps();
    private static final Map<String, String> SUPPORTED_APPS_LOWER = createSupportedAppsLower(SUPPORTED_APPS);

    private static final Pattern AMOUNT_PATTERN =
        Pattern.compile("(?i)(?:rp\\.?|idr)\\s*[0-9][0-9.,]*");

    private static final Pattern TX_KEYWORD_PATTERN =
        Pattern.compile("(?i)\\b(transfer|masuk|keluar|terima|menerima|diterima|kirim|mengirim|terkirim|pembayaran|bayar|pembelian|beli|transaksi|top\\s*up|topup|qris|berhasil|debit|kredit|tarik|cashback|bunga|tagihan|setor|terpotong|potong)\\b");

    private static Map<String, String> createSupportedApps() {
        Map<String, String> map = new HashMap<>();
        // E-Wallets
        map.put("id.dana", "DANA");
        map.put("com.gojek.app", "GoPay");
        map.put("com.gopay.app", "GoPay");
        map.put("ovo.id", "OVO");
        map.put("com.shopee.id", "ShopeePay");
        map.put("com.telkom.mwallet", "LinkAja");

        // Digital & Major Indonesian Banks
        map.put("id.co.seabank.mobilebanking", "SeaBank");
        map.put("com.bca", "BCA");
        map.put("com.bca.mybca.omni.android", "myBCA");
        map.put("id.co.bri.brimo", "BRImo");
        map.put("id.bmri.livin", "Livin' Mandiri");
        map.put("src.com.bni", "BNI");
        map.put("id.bni.wondr", "wondr by BNI");
        map.put("com.bsm.activity2", "BSI Mobile");
        map.put("id.co.bankbsi.byond", "BYOND by BSI");
        map.put("com.jago.digitalBanking", "Bank Jago");
        map.put("com.bcadigital.blu", "blu by BCA");
        return map;
    }

    private static Map<String, String> createSupportedAppsLower(Map<String, String> source) {
        Map<String, String> lower = new HashMap<>();
        for (Map.Entry<String, String> entry : source.entrySet()) {
            lower.put(entry.getKey().toLowerCase(Locale.ROOT), entry.getValue());
        }
        return lower;
    }

    private static String resolveSupportedAppName(String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) {
            return null;
        }
        String exact = SUPPORTED_APPS.get(packageName);
        if (exact != null) {
            return exact;
        }
        String lower = packageName.toLowerCase(Locale.ROOT);
        String byLower = SUPPORTED_APPS_LOWER.get(lower);
        if (byLower != null) {
            return byLower;
        }
        if (lower.contains("jago")) {
            return "Bank Jago";
        }
        return null;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) {
            return;
        }

        String packageName = sbn.getPackageName();
        String appName = resolveSupportedAppName(packageName);
        if (appName == null) {
            return;
        }

        Notification notification = sbn.getNotification();
        if (notification == null) {
            return;
        }

        int flags = notification.flags;
        if ((flags & Notification.FLAG_GROUP_SUMMARY) != 0
            || (flags & Notification.FLAG_ONGOING_EVENT) != 0) {
            return;
        }

        Bundle extras = notification.extras;
        if (extras == null) {
            return;
        }

        String title = mergeUniqueText(
            readExtraString(extras, Notification.EXTRA_TITLE),
            readExtraString(extras, Notification.EXTRA_TITLE_BIG)
        );
        String bigText = readExtraString(extras, Notification.EXTRA_BIG_TEXT);
        String text = extractNotificationText(extras, bigText);
        if (title.isEmpty() && text.isEmpty()) {
            return;
        }

        String combined = mergeUniqueText(title, text);
        if (!AMOUNT_PATTERN.matcher(combined).find()
            || !TX_KEYWORD_PATTERN.matcher(combined).find()) {
            return;
        }

        long postTime = sbn.getPostTime();
        long minuteBucket = postTime / 60000L;
        String rawDedupeKey = packageName + "|" + title + "|" + text + "|" + minuteBucket;
        String dedupeId = sha256Hex(rawDedupeKey);

        JSONObject item = new JSONObject();
        try {
            item.put("id", dedupeId);
            item.put("packageName", packageName);
            item.put("appName", appName);
            item.put("title", title);
            item.put("text", text);
            if (!bigText.isEmpty()) {
                item.put("bigText", bigText);
            }
            item.put("timestamp", postTime);
        } catch (JSONException ignored) {
            return;
        }

        boolean added = enqueueItem(getApplicationContext(), dedupeId, item);
        if (added) {
            NotificationCapturePlugin.emitNotificationReceived(item);
        }
    }

    private static boolean enqueueItem(Context context, String dedupeId, JSONObject item) {
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray queue = parseJsonArray(prefs.getString(KEY_QUEUE, "[]"));
            JSONArray recentIds = parseJsonArray(prefs.getString(KEY_RECENT_IDS, "[]"));

            if (containsString(recentIds, dedupeId) || containsItemId(queue, dedupeId)) {
                return false;
            }

            queue.put(item);
            recentIds.put(dedupeId);

            JSONArray trimmedQueue = trimArray(queue, MAX_QUEUE_SIZE);
            JSONArray trimmedRecent = trimArray(recentIds, MAX_QUEUE_SIZE);

            prefs.edit()
                .putString(KEY_QUEUE, trimmedQueue.toString())
                .putString(KEY_RECENT_IDS, trimmedRecent.toString())
                .commit();
            return true;
        }
    }

    public static JSONArray drainQueue(Context context) {
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray queue = parseJsonArray(prefs.getString(KEY_QUEUE, "[]"));
            if (queue.length() > 0) {
                prefs.edit().putString(KEY_QUEUE, "[]").commit();
            }
            return queue;
        }
    }

    public static void removeFromQueue(Context context, java.util.Set<String> idsToRemove) {
        if (context == null || idsToRemove == null || idsToRemove.isEmpty()) {
            return;
        }
        synchronized (QUEUE_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONArray queue = parseJsonArray(prefs.getString(KEY_QUEUE, "[]"));
            if (queue.length() == 0) {
                return;
            }
            JSONArray remaining = new JSONArray();
            boolean changed = false;
            for (int i = 0; i < queue.length(); i++) {
                JSONObject obj = queue.optJSONObject(i);
                if (obj == null) {
                    changed = true;
                    continue;
                }
                String id = obj.optString("id", "");
                if (idsToRemove.contains(id)) {
                    changed = true;
                } else {
                    remaining.put(obj);
                }
            }
            if (changed) {
                prefs.edit().putString(KEY_QUEUE, remaining.toString()).commit();
            }
        }
    }

    private static String extractNotificationText(Bundle extras, String bigText) {
        String shortText = readExtraString(extras, Notification.EXTRA_TEXT);
        String merged = mergeUniqueText(shortText, bigText);

        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null && lines.length > 0) {
            StringBuilder sb = new StringBuilder();
            for (CharSequence line : lines) {
                if (line != null) {
                    String s = line.toString().replaceAll("\\s+", " ").trim();
                    if (!s.isEmpty()) {
                        if (sb.length() > 0) {
                            sb.append(' ');
                        }
                        sb.append(s);
                    }
                }
            }
            merged = mergeUniqueText(merged, sb.toString());
        }

        if (!merged.isEmpty()) {
            return merged;
        }

        return readExtraString(extras, Notification.EXTRA_SUB_TEXT);
    }

    private static String mergeUniqueText(String first, String second) {
        String a = first == null ? "" : first.trim();
        String b = second == null ? "" : second.trim();
        if (a.isEmpty()) {
            return b;
        }
        if (b.isEmpty()) {
            return a;
        }
        String aLower = a.toLowerCase(Locale.ROOT);
        String bLower = b.toLowerCase(Locale.ROOT);
        if (bLower.contains(aLower)) {
            return b;
        }
        if (aLower.contains(bLower)) {
            return a;
        }
        return a + " " + b;
    }

    private static String readExtraString(Bundle extras, String key) {
        CharSequence value = extras.getCharSequence(key);
        if (value == null) {
            return "";
        }
        return value.toString().replaceAll("\\s+", " ").trim();
    }

    private static JSONArray parseJsonArray(String raw) {
        if (raw == null || raw.isEmpty()) {
            return new JSONArray();
        }
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static boolean containsString(JSONArray array, String target) {
        for (int i = 0; i < array.length(); i++) {
            if (target.equals(array.optString(i, ""))) {
                return true;
            }
        }
        return false;
    }

    private static boolean containsItemId(JSONArray array, String targetId) {
        for (int i = 0; i < array.length(); i++) {
            JSONObject obj = array.optJSONObject(i);
            if (obj != null && targetId.equals(obj.optString("id", ""))) {
                return true;
            }
        }
        return false;
    }

    private static JSONArray trimArray(JSONArray array, int maxSize) {
        if (array.length() <= maxSize) {
            return array;
        }
        JSONArray result = new JSONArray();
        int start = array.length() - maxSize;
        for (int i = start; i < array.length(); i++) {
            result.put(array.opt(i));
        }
        return result;
    }

    private static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format(Locale.US, "%02x", b & 0xff));
            }
            return hex.toString();
        } catch (Exception ignored) {
            return input;
        }
    }
}
