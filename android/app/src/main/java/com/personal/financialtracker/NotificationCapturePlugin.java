package com.personal.financialtracker;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(name = "NotificationCapture")
public class NotificationCapturePlugin extends Plugin {

    private static volatile NotificationCapturePlugin activeInstance;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    public static void emitNotificationReceived(JSONObject itemJson) {
        NotificationCapturePlugin plugin = activeInstance;
        if (plugin == null || itemJson == null) {
            return;
        }

        Activity activity = plugin.getActivity();
        if (plugin.getBridge() == null || activity == null || activity.isFinishing()) {
            return;
        }

        if (!plugin.hasListeners("notificationReceived")) {
            return;
        }

        try {
            JSObject payload = JSObject.fromJSONObject(itemJson);
            plugin.notifyListeners("notificationReceived", payload);
        } catch (JSONException ignored) {
            // Ignore malformed event payload.
        }
    }

    @PluginMethod
    public void acknowledgeNotifications(PluginCall call) {
        JSArray ids = call.getArray("ids");
        if (ids == null || ids.length() == 0) {
            call.resolve();
            return;
        }

        java.util.Set<String> idSet = new java.util.HashSet<>();
        for (int i = 0; i < ids.length(); i++) {
            String id = ids.optString(i, "");
            if (!TextUtils.isEmpty(id)) {
                idSet.add(id);
            }
        }

        if (!idSet.isEmpty()) {
            FinanceNotificationListenerService.removeFromQueue(getContext(), idSet);
        }
        call.resolve();
    }

    @PluginMethod
    public void isPermissionGranted(PluginCall call) {
        boolean granted = hasNotificationListenerPermission(getContext());
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            Activity activity = getActivity();
            if (activity != null && !activity.isFinishing()) {
                activity.startActivity(intent);
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception ex) {
            call.reject("Unable to open notification listener settings", ex);
        }
    }

    @PluginMethod
    public void drainPendingNotifications(PluginCall call) {
        JSONArray drained = FinanceNotificationListenerService.drainQueue(getContext());
        JSArray items = new JSArray();
        for (int i = 0; i < drained.length(); i++) {
            JSONObject obj = drained.optJSONObject(i);
            if (obj == null) {
                continue;
            }
            try {
                items.put(JSObject.fromJSONObject(obj));
            } catch (JSONException ignored) {
                // Skip invalid entry.
            }
        }

        JSObject result = new JSObject();
        result.put("items", items);
        call.resolve(result);
    }

    private static boolean hasNotificationListenerPermission(Context context) {
        if (context == null) {
            return false;
        }
        String enabledListeners = Settings.Secure.getString(
            context.getContentResolver(),
            "enabled_notification_listeners"
        );
        if (TextUtils.isEmpty(enabledListeners)) {
            return false;
        }

        ComponentName expected = new ComponentName(context, FinanceNotificationListenerService.class);
        String expectedFlattened = expected.flattenToString();
        String expectedShort = expected.flattenToShortString();

        String[] entries = enabledListeners.split(":");
        for (String entry : entries) {
            if (TextUtils.isEmpty(entry)) {
                continue;
            }
            ComponentName parsed = ComponentName.unflattenFromString(entry);
            if (parsed != null && expected.equals(parsed)) {
                return true;
            }
            if (expectedFlattened.equals(entry) || expectedShort.equals(entry)) {
                return true;
            }
        }
        return false;
    }
}
