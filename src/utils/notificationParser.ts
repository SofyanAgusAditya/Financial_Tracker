import { INITIAL_CATEGORIES } from '../data/mockData';
import { Category } from '../types';
import { toDateOnlyString } from './finance';
import type { RawFinanceNotification } from './notificationBridge';

export interface ParsedBankNotification {
  id: string;
  appName: string;
  amount: number;
  type: 'income' | 'expense';
  description: string;
  categoryId: string;
  date: string; // YYYY-MM-DD (local date)
  notes: string;
}

export const SUPPORTED_NOTIFICATION_APPS = [
  'Bank Jago',
  'DANA',
  'GoPay',
  'OVO',
  'ShopeePay',
  'LinkAja',
  'SeaBank',
  'BCA',
  'myBCA',
  'BRImo',
  "Livin' Mandiri",
  'BNI',
  'wondr by BNI',
  'BSI Mobile',
  'BYOND by BSI',
  'blu by BCA',
] as const;

const PACKAGE_APP_NAMES: Record<string, string> = {
  'id.dana': 'DANA',
  'com.gojek.app': 'GoPay',
  'com.gopay.app': 'GoPay',
  'ovo.id': 'OVO',
  'com.shopee.id': 'ShopeePay',
  'com.telkom.mwallet': 'LinkAja',
  'id.co.seabank.mobilebanking': 'SeaBank',
  'com.bca': 'BCA',
  'com.bca.mybca.omni.android': 'myBCA',
  'id.co.bri.brimo': 'BRImo',
  'id.bmri.livin': "Livin' Mandiri",
  'src.com.bni': 'BNI',
  'id.bni.wondr': 'wondr by BNI',
  'com.bsm.activity2': 'BSI Mobile',
  'id.co.bankbsi.byond': 'BYOND by BSI',
  'com.jago.digitalbanking': 'Bank Jago',
  'com.bcadigital.blu': 'blu by BCA',
};

const PROCESSED_IDS_STORAGE_KEY = 'financial-tracker:notif-processed-ids:v1';
const MAX_PROCESSED_IDS = 300;
const MIN_TX_AMOUNT = 100;
const MAX_TX_AMOUNT = 1_000_000_000;

const EWALLET_PACKAGES = new Set([
  'id.dana',
  'com.gojek.app',
  'com.gopay.app',
  'ovo.id',
  'com.shopee.id',
  'com.telkom.mwallet',
]);

const HARD_PROMO_PATTERN =
  /\b(kode\s*promo|klaim\s*sekarang|hingga\s*(?:rp\.?|idr)|s\/d\s*(?:rp\.?|idr)|sampai\s*dengan\s*(?:rp\.?|idr)|minimal\s*transaksi|syarat\s*(?:&|dan)\s*ketentuan|buruan|yuk\s+)\b/i;

const SOFT_PROMO_PATTERN = /\b(promo|diskon|discount|voucher)\b/i;

const CONFIRMED_TX_PATTERN =
  /\b(kamu\s*mengirim|kamu\s*menerima|pembayaran\s*qris|tarik\s*tunai|berhasil\s*transfer|berhasil\s*menerima|transaksi\s*berhasil|pembayaran\s*berhasil|transfer\s*masuk|dana\s*masuk|uang\s*masuk|uang\s*keluar|dana\s*keluar|telah\s*diterima|masuk\s*sebesar|keluar\s*sebesar|berhasil\s*top\s*up|top\s*up\s*berhasil|topup\s*berhasil|cashback\s*(?:rp\.?|idr)|bunga(?:\s*kantong)?\s*(?:rp\.?|idr))\b/i;

const INCOME_PATTERN =
  /\b(kamu\s*menerima|menerima|transfer\s*masuk|dana\s*masuk|uang\s*masuk|saldo\s*masuk|top\s*up\s*berhasil|topup\s*berhasil|berhasil\s*top\s*up|kredit|cashback|bunga|masuk\s*sebesar|terima\s*(?:transfer|uang)|penerimaan\s*dana|setor\s*tunai)\b/i;

const EXPENSE_PATTERN =
  /\b(kamu\s*mengirim|mengirim|berhasil\s*transfer|transfer\s*ke|pembayaran|bayar|qris|transaksi|uang\s*keluar|dana\s*keluar|keluar\s*sebesar|debit|tarik\s*tunai|pembelian|beli|tagihan|berhasil\s*kirim|kirim\s*uang)\b/i;

const STRONG_INCOME_PATTERN =
  /\b(kamu\s*menerima|berhasil\s*menerima|menerima\s*(?:dana|uang|transfer|rp\.?|idr)|transfer\s*masuk|dana\s*masuk|uang\s*masuk|saldo\s*masuk|masuk\s*sebesar|terima\s*(?:transfer|uang)|penerimaan\s*dana|setor\s*tunai|cashback|bunga|top\s*up\s*berhasil|topup\s*berhasil|berhasil\s*top\s*up)\b/i;

const STRONG_EXPENSE_PATTERN =
  /\b(kamu\s*mengirim|mengirim|berhasil\s*transfer|transfer\s*ke|pembayaran|bayar|qris|uang\s*keluar|dana\s*keluar|keluar\s*sebesar|debit|tarik\s*tunai|pembelian|beli|tagihan|berhasil\s*kirim|kirim\s*uang|transaksi\s*keluar)\b/i;

interface CategoryMatchRule {
  defaultId: string;
  fallbackTerms: string[];
  pattern: RegExp;
}

const INCOME_CATEGORY_RULES: CategoryMatchRule[] = [
  {
    defaultId: 'cat-inc-1',
    fallbackTerms: ['salary', 'gaji'],
    pattern: /\b(gaji|salary|payroll)\b/i,
  },
  {
    defaultId: 'cat-inc-2',
    fallbackTerms: ['business', 'bisnis'],
    pattern: /\b(bisnis|business|penjualan|omzet)\b/i,
  },
  {
    defaultId: 'cat-inc-3',
    fallbackTerms: ['investment', 'investasi', 'dividen'],
    pattern: /\b(dividen|bunga|investasi|invest)\b/i,
  },
  {
    defaultId: 'cat-inc-4',
    fallbackTerms: ['freelance', 'konsultasi'],
    pattern: /\b(freelance|konsultasi|fee)\b/i,
  },
];

const EXPENSE_CATEGORY_RULES: CategoryMatchRule[] = [
  {
    defaultId: 'cat-exp-1',
    fallbackTerms: ['food', 'dining', 'makanan', 'minuman'],
    pattern:
      /\b(gofood|grabfood|shopeefood|makan|minum|kopi|coffee|resto|restoran|kafe|cafe|warung|warteg|starbucks|kopi\s*kenangan|janji\s*jiwa|fore|kfc|mcd|hokben|solaria|mixue|chatime|bakery|roti)\b/i,
  },
  {
    defaultId: 'cat-exp-2',
    fallbackTerms: ['transport', 'transportasi'],
    pattern:
      /\b(gojek|goride|gocar|grab|maxim|indrive|bluebird|taxi|taksi|spbu|pertamina|shell|bensin|bbm|parkir|parking|tol|e-?toll|kai|kereta|krl|mrt|lrt|transjakarta|tiket\s*pesawat|garuda|citilink|lion\s*air)\b/i,
  },
  {
    defaultId: 'cat-exp-5',
    fallbackTerms: ['bills', 'utilities', 'tagihan', 'utilitas'],
    pattern:
      /\b(pln|listrik|token|pdam|air|internet|wifi|indihome|biznet|first\s*media|myrepublic|telkom|pulsa|paket\s*data|telkomsel|indosat|xl|tri|smartfren|bpjs|pajak|pbb|samsat|tagihan|cicilan|angsuran)\b/i,
  },
  {
    defaultId: 'cat-exp-6',
    fallbackTerms: ['health', 'medical', 'kesehatan', 'medis'],
    pattern:
      /\b(apotek|apotik|kimia\s*farma|k-?24|klinik|rumah\s*sakit|rsud|hospital|dokter|halodoc|farmasi|medis)\b/i,
  },
  {
    defaultId: 'cat-exp-4',
    fallbackTerms: ['entertainment', 'fun', 'hiburan'],
    pattern:
      /\b(netflix|spotify|youtube|disney|bioskop|xxi|cgv|cinepolis|cinema|steam|game|hiburan|karaoke|gym|fitness)\b/i,
  },
  {
    defaultId: 'cat-exp-3',
    fallbackTerms: ['shopping', 'retail', 'belanja', 'ritel'],
    pattern:
      /\b(indomaret|alfamart|alfamidi|superindo|hypermart|transmart|minimarket|supermarket|tokopedia|shopee|lazada|blibli|tiktok\s*shop|belanja|qris|gramedia|uniqlo|ikea|ace\s*hardware|mr\.?\s*diy|guardian|watsons)\b/i,
  },
];

export function loadProcessedNotificationIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PROCESSED_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

export function hasProcessedNotificationId(id: string): boolean {
  if (!id) return false;
  return loadProcessedNotificationIds().includes(id);
}

export function markNotificationIdsProcessed(ids: string[]): void {
  if (typeof window === 'undefined' || ids.length === 0) return;
  try {
    const existing = loadProcessedNotificationIds();
    const seen = new Set(existing);
    const merged = [...existing];
    for (const id of ids) {
      if (id && !seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    const capped = merged.slice(-MAX_PROCESSED_IDS);
    window.localStorage.setItem(PROCESSED_IDS_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

function normalizeWhitespace(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function mergeDistinctText(first: string, second: string): string {
  const a = normalizeWhitespace(first);
  const b = normalizeWhitespace(second);
  if (!a) return b;
  if (!b) return a;
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (bLower.includes(aLower)) return b;
  if (aLower.includes(bLower)) return a;
  return `${a} ${b}`;
}

export function resolveAppName(item: RawFinanceNotification): string {
  const pkg = (item.packageName ?? '').trim().toLowerCase();
  if (pkg && PACKAGE_APP_NAMES[pkg]) {
    return PACKAGE_APP_NAMES[pkg];
  }
  const rawName = (item.appName ?? '').trim();
  if (pkg.includes('jago') || /^(?:bank\s+)?jago\b/i.test(rawName)) {
    return 'Bank Jago';
  }
  return rawName || 'Bank / E-Wallet';
}

function parseRupiahToken(rawToken: string): number | null {
  let token = rawToken.trim().replace(/(?:,-|\.-)$/, '');
  if (!token) return null;

  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}$/.test(token)) {
    token = token.replace(/[.,]\d{1,2}$/, '');
  } else if (/^\d{3,}[.,]\d{1,2}$/.test(token)) {
    token = token.replace(/[.,]\d{1,2}$/, '');
  }

  const digits = token.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  const value = Number(digits);
  if (!Number.isFinite(value) || value < MIN_TX_AMOUNT || value > MAX_TX_AMOUNT) {
    return null;
  }
  return Math.round(value);
}

function extractRupiahAmount(text: string): number | null {
  let sanitized = text
    // Strip account, pocket, virtual account, or reference numbers (4+ digits)
    .replace(
      /\b(?:no\.?\s*(?:rek(?:ening)?|kartu|va|ref(?:erensi)?)|rekening|kantong|va|ref(?:erensi)?)\s*[:#=\-]?\s*\d[\d\s-]{3,}/gi,
      ' '
    )
    // Strip explicit remaining-balance & admin-fee phrases
    .replace(
      /(?:sisa\s*saldo|saldo\s*(?:akhir|anda|tersedia|sekarang|saat\s*ini|terkini|kantong|utama|rekening)|available\s*balance|balance|biaya\s*(?:admin|transfer|layanan))\s*[:=\-]?\s*(?:rp\.?|idr)?\s*[0-9][0-9.,]*(?:\s*,-)?/gi,
      ' '
    );

  // Strip bare "saldo Rp..." unless preceded by top-up verbs (e.g. "top up saldo Rp100.000")
  sanitized = sanitized.replace(
    /(\b(?:top\s*up|topup|isi)\s+)?\bsaldo\s*[:=\-]?\s*(?:rp\.?|idr)?\s*[0-9][0-9.,]*(?:\s*,-)?/gi,
    (fullMatch, prefix: string | undefined) => (prefix ? fullMatch : ' ')
  );

  const amountPattern =
    /(?:Rp\.?|IDR)\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{3,9}(?:[.,]\d{1,2})?)(?:,-)?/gi;

  let match: RegExpExecArray | null;
  while ((match = amountPattern.exec(sanitized)) !== null) {
    const parsed = parseRupiahToken(match[1]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function classifyTransactionType(
  combined: string,
  packageName: string
): 'income' | 'expense' | null {
  const matchesIncome = INCOME_PATTERN.test(combined);
  const matchesExpense = EXPENSE_PATTERN.test(combined);

  if (matchesIncome && !matchesExpense) return 'income';
  if (matchesExpense && !matchesIncome) return 'expense';

  if (matchesIncome && matchesExpense) {
    const strongIncome = STRONG_INCOME_PATTERN.test(combined);
    const strongExpense = STRONG_EXPENSE_PATTERN.test(combined);
    if (strongIncome && !strongExpense) return 'income';
    if (strongExpense && !strongIncome) return 'expense';
    if (/\bkartu\s*kredit\b/i.test(combined) && /\b(pembayaran|bayar|tagihan)\b/i.test(combined)) {
      return 'expense';
    }
    if (
      /\b(cashback|bunga)\b/i.test(combined) &&
      !/\b(bayar|pembayaran|tagihan)\s+bunga\b/i.test(combined)
    ) {
      return 'income';
    }
    return null;
  }

  // Handle separated phrasing such as "Top up saldo Rp 100.000 berhasil" from E-Wallets
  if (
    EWALLET_PACKAGES.has(packageName.toLowerCase()) &&
    /\b(?:top\s*up|topup)\b.*\bberhasil\b/i.test(combined) &&
    !/\b(bayar|pembayaran|pembelian|transfer\s*ke)\b/i.test(combined)
  ) {
    return 'income';
  }

  return null;
}

interface CounterpartyMatch {
  prep: 'ke' | 'dari' | 'di';
  entity: string;
}

const COUNTERPARTY_STOP_LOOKAHEAD =
  '(?=\\s+(?:dari|ke|di|via|melalui|sebesar|senilai|dengan|pada|untuk|berhasil|sukses|selesai|telah|sudah|saldo|sisa|kantong|rekening|no\\.?\\s*rek|rp\\.?|idr|tgl|tanggal)\\b|[.,;|\\n!]|$)';

const COUNTERPARTY_REGEX = new RegExp(
  `\\b(ke|dari|di)\\s+(.+?)${COUNTERPARTY_STOP_LOOKAHEAD}`,
  'gi'
);

const IGNORED_COUNTERPARTY_PATTERN =
  /^(?:kantong\b|rekening\b|akun\b|dompet\b|saldo\b|bank\s+jago\b|jago\b|aplikasi\b|merchant\b|sini\b|atas\b|bawah\b)/i;

function cleanCounterpartyEntity(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\d{4,}[^)]*\)\s*$/g, '')
    .replace(/\s+\d{6,}\s*$/g, '')
    .replace(/^[\s\-:]+|[\s\-:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
}

function extractCounterparty(text: string): CounterpartyMatch | null {
  COUNTERPARTY_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COUNTERPARTY_REGEX.exec(text)) !== null) {
    const prep = match[1].toLowerCase() as 'ke' | 'dari' | 'di';
    const cleaned = cleanCounterpartyEntity(match[2]);
    if (cleaned.length < 2) continue;
    if (/^\d+$/.test(cleaned) || /^(?:rp\.?|idr)\b/i.test(cleaned)) continue;
    if (IGNORED_COUNTERPARTY_PATTERN.test(cleaned)) continue;
    return { prep, entity: cleaned };
  }
  return null;
}

function buildDescription(
  appName: string,
  combined: string,
  bodyText: string,
  type: 'income' | 'expense'
): string {
  const counterparty = extractCounterparty(bodyText || combined);

  if (type === 'income') {
    let base = 'Dana Masuk';
    if (
      /\b(kamu\s*menerima|menerima\s*(?:transfer|dana|uang)|transfer\s*masuk|terima\s*transfer)\b/i.test(
        combined
      )
    ) {
      base = counterparty?.prep === 'dari' ? 'Transfer' : 'Transfer Masuk';
    } else if (/\b(top\s*up|topup)\b/i.test(combined)) {
      base = 'Top Up';
    } else if (/\bcashback\b/i.test(combined)) {
      base = 'Cashback';
    } else if (/\bbunga\b/i.test(combined)) {
      base = 'Bunga';
    } else if (/\bsetor\s*tunai\b/i.test(combined)) {
      base = 'Setor Tunai';
    } else if (/\b(uang\s*masuk|dana\s*masuk|saldo\s*masuk|masuk\s*sebesar)\b/i.test(combined)) {
      base = 'Dana Masuk';
    }

    if (counterparty && counterparty.prep === 'dari') {
      return `${appName} · ${base} dari ${counterparty.entity}`;
    }
    return `${appName} · ${base}`;
  }

  if (/\bqris\b/i.test(combined)) {
    return counterparty
      ? `${appName} · QRIS ${counterparty.entity}`
      : `${appName} · Pembayaran QRIS`;
  }

  if (/\btarik\s*tunai\b/i.test(combined)) {
    return counterparty
      ? `${appName} · Tarik Tunai ${counterparty.prep} ${counterparty.entity}`
      : `${appName} · Tarik Tunai`;
  }

  if (
    /\b(kamu\s*mengirim|mengirim|berhasil\s*transfer|transfer\s*ke|kirim\s*uang|berhasil\s*kirim)\b/i.test(
      combined
    )
  ) {
    if (counterparty) {
      return `${appName} · Transfer ${counterparty.prep} ${counterparty.entity}`;
    }
    return `${appName} · Transfer Keluar`;
  }

  let base = 'Pengeluaran';
  if (/\btagihan\b/i.test(combined)) {
    base = 'Tagihan';
  } else if (/\b(pembelian|beli)\b/i.test(combined)) {
    base = 'Pembelian';
  } else if (/\b(pembayaran|bayar)\b/i.test(combined)) {
    base = 'Pembayaran';
  } else if (/\btransaksi\b/i.test(combined)) {
    base = 'Transaksi';
  }

  if (counterparty) {
    return `${appName} · ${base} ${counterparty.prep} ${counterparty.entity}`;
  }
  return `${appName} · ${base}`;
}

function resolveCategoryByRule(
  rule: CategoryMatchRule,
  pool: Category[]
): string | undefined {
  const byId = pool.find((c) => c.id === rule.defaultId);
  if (byId) return byId.id;

  const byName = pool.find((c) => {
    const lower = c.name.toLowerCase();
    return rule.fallbackTerms.some((term) => lower.includes(term));
  });
  return byName?.id;
}

function resolveCategoryId(
  combined: string,
  type: 'income' | 'expense',
  categories: Category[]
): string {
  const targetType = type === 'income' ? 'INCOME' : 'EXPENSE';
  const pool = categories.filter((c) => c.type === targetType);
  const rules = type === 'income' ? INCOME_CATEGORY_RULES : EXPENSE_CATEGORY_RULES;

  for (const rule of rules) {
    if (rule.pattern.test(combined)) {
      const matched = resolveCategoryByRule(rule, pool);
      if (matched) return matched;
    }
  }

  const fallbackId = type === 'income' ? 'cat-inc-5' : 'cat-exp-9';
  return (
    pool.find((c) => c.id === fallbackId)?.id ??
    pool[0]?.id ??
    (type === 'income' ? 'cat-inc-1' : 'cat-exp-9')
  );
}

/**
 * Generates realistic outgoing and incoming Bank Jago sample notifications
 * so users can test Auto-Record parsing and SQLite persistence directly in the app.
 */
export function createBankJagoTestNotifications(
  now: number = Date.now()
): RawFinanceNotification[] {
  return [
    {
      id: `test-jago-out-${now}`,
      packageName: 'com.jago.digitalBanking',
      appName: 'Bank Jago',
      title: 'Transaksi Bank Jago',
      text: 'Kamu mengirim Rp50.000 ke Budi dari Kantong Utama. Sisa saldo Rp1.450.000',
      bigText: 'Kamu mengirim Rp50.000 ke Budi dari Kantong Utama. Sisa saldo Rp1.450.000',
      timestamp: now,
    },
    {
      id: `test-jago-in-${now}`,
      packageName: 'com.jago.digitalBanking',
      appName: 'Bank Jago',
      title: 'Uang Masuk Bank Jago',
      text: 'Kamu menerima Rp125.000,00 dari Andi ke Kantong Utama. Saldo saat ini Rp1.575.000',
      bigText:
        'Kamu menerima Rp125.000,00 dari Andi ke Kantong Utama. Saldo saat ini Rp1.575.000',
      timestamp: now + 1000,
    },
  ];
}

/**
 * Parses a captured Android E-Wallet/Bank notification into a structured transaction.
 * Returns null if the notification is promotional, lacks a valid Rupiah amount,
 * or has an unclear transaction direction.
 */
export function parseBankNotification(
  item: RawFinanceNotification,
  categories: Category[] = INITIAL_CATEGORIES
): ParsedBankNotification | null {
  const title = normalizeWhitespace(item.title);
  const bodyText = mergeDistinctText(item.text, item.bigText ?? '');
  const combined = mergeDistinctText(title, bodyText);
  if (!combined) return null;

  if (HARD_PROMO_PATTERN.test(combined)) {
    return null;
  }
  if (SOFT_PROMO_PATTERN.test(combined) && !CONFIRMED_TX_PATTERN.test(combined)) {
    return null;
  }

  const amount = extractRupiahAmount(combined);
  if (amount === null) return null;

  const type = classifyTransactionType(combined, item.packageName ?? '');
  if (!type) return null;

  const appName = resolveAppName(item);
  const description = buildDescription(appName, combined, bodyText || title, type);
  const categoryList = categories.length > 0 ? categories : INITIAL_CATEGORIES;
  const categoryId = resolveCategoryId(combined, type, categoryList);

  const parsedDate =
    typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && item.timestamp > 0
      ? new Date(item.timestamp)
      : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const notesBody = bodyText || title;

  return {
    id: item.id,
    appName,
    amount,
    type,
    description,
    categoryId,
    date: toDateOnlyString(safeDate),
    notes: `Auto-Notifikasi (${appName}): ${notesBody}`,
  };
}
