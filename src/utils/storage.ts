import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import {
  Budget,
  CURRENCIES,
  Category,
  CurrencyCode,
  RecurringInterval,
  RecurringTransaction,
  Transaction,
} from '../types';
import { convertCurrency } from '../data/mockData';
import { toDateOnlyString } from './finance';

export interface AppStateSnapshot {
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurringList: RecurringTransaction[];
  currency: CurrencyCode;
}

export interface BackupFilePayload {
  app: 'financial-tracker';
  schemaVersion: 1;
  exportedAt: string;
  data: AppStateSnapshot;
}

export type ParseBackupResult =
  | { ok: true; snapshot: AppStateSnapshot }
  | { ok: false; error: string };

export interface ExportBackupOptions {
  title?: string;
  dialogTitle?: string;
}

export type ExportBackupResult = {
  status: 'downloaded' | 'shared' | 'cancelled';
  fileName: string;
};

const STORAGE_KEY = 'financial-tracker:state:v1';
const THEME_STORAGE_KEY = 'financial-tracker:theme:v1';
// CapacitorSQLite appends "SQLite.db" to database names on Android -> financial_trackerSQLite.db
const SQLITE_DB_NAME = 'financial_tracker';
const SQLITE_DB_VERSION = 1;
const SQLITE_SCHEMA_VERSION = 1;
const CREATE_APP_STATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);`;
const VALID_INTERVALS = new Set<RecurringInterval>(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

let sqliteConnection: SQLiteConnection | null = null;
let dbPromise: Promise<SQLiteDBConnection> | null = null;
let sqliteWriteQueue: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isValidCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

function isValidCategory(value: unknown): value is Category {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    (value.type === 'INCOME' || value.type === 'EXPENSE') &&
    typeof value.colorHex === 'string' &&
    typeof value.icon === 'string' &&
    (value.isSystem === undefined || typeof value.isSystem === 'boolean')
  );
}

function isValidTransaction(value: unknown): value is Transaction {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isOptionalString(value.categoryId) &&
    (value.type === 'INCOME' || value.type === 'EXPENSE') &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    isValidCurrency(value.currency) &&
    typeof value.description === 'string' &&
    isOptionalString(value.notes) &&
    isNonEmptyString(value.transactionDate) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    isNonEmptyString(value.idempotencyKey) &&
    (value.syncStatus === 'SYNCED' || value.syncStatus === 'PENDING') &&
    isNonEmptyString(value.createdAt)
  );
}

function isValidBudget(value: unknown): value is Budget {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.categoryId) &&
    typeof value.monthlyLimit === 'number' &&
    Number.isFinite(value.monthlyLimit) &&
    value.monthlyLimit >= 0 &&
    isValidCurrency(value.currency)
  );
}

function isValidRecurring(value: unknown): value is RecurringTransaction {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.id) &&
    isOptionalString(value.categoryId) &&
    (value.type === 'INCOME' || value.type === 'EXPENSE') &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    value.amount >= 0 &&
    isValidCurrency(value.currency) &&
    typeof value.description === 'string' &&
    typeof value.interval === 'string' &&
    VALID_INTERVALS.has(value.interval as RecurringInterval) &&
    isNonEmptyString(value.nextRunDate) &&
    isOptionalString(value.lastRunDate) &&
    typeof value.isActive === 'boolean'
  );
}

/** Validates that an unknown value satisfies the complete AppStateSnapshot schema. */
export function isAppStateSnapshot(value: unknown): value is AppStateSnapshot {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.categories) &&
    value.categories.every(isValidCategory) &&
    Array.isArray(value.transactions) &&
    value.transactions.every(isValidTransaction) &&
    Array.isArray(value.budgets) &&
    value.budgets.every(isValidBudget) &&
    Array.isArray(value.recurringList) &&
    value.recurringList.every(isValidRecurring) &&
    isValidCurrency(value.currency)
  );
}

function normalizeSnapshot(snapshot: AppStateSnapshot): AppStateSnapshot {
  return {
    ...snapshot,
    transactions: snapshot.transactions.map((tx) =>
      tx.syncStatus === 'SYNCED' ? tx : { ...tx, syncStatus: 'SYNCED' }
    ),
  };
}

function loadFromLocalStorage(): AppStateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isAppStateSnapshot(parsed) ? normalizeSnapshot(parsed) : null;
  } catch {
    return null;
  }
}

function saveToLocalStorage(snapshot: AppStateSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeSnapshot(snapshot);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage may be full or disabled in restricted WebViews.
  }
}

function removeFromLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore cleanup errors if storage is unavailable.
  }
}

function isNativeSqliteEnabled(): boolean {
  return Capacitor.isNativePlatform();
}

async function initSqliteDb(): Promise<SQLiteDBConnection> {
  if (!sqliteConnection) {
    sqliteConnection = new SQLiteConnection(CapacitorSQLite);
  }

  const consistency = (await sqliteConnection.checkConnectionsConsistency()).result ?? false;
  const isConn = (await sqliteConnection.isConnection(SQLITE_DB_NAME, false)).result ?? false;

  const db =
    consistency && isConn
      ? await sqliteConnection.retrieveConnection(SQLITE_DB_NAME, false)
      : await sqliteConnection.createConnection(
          SQLITE_DB_NAME,
          false,
          'no-encryption',
          SQLITE_DB_VERSION,
          false
        );

  const isOpen = (await db.isDBOpen()).result ?? false;
  if (!isOpen) {
    await db.open();
  }

  await db.execute(CREATE_APP_STATE_TABLE_SQL);
  return db;
}

function getSqliteDb(): Promise<SQLiteDBConnection> {
  if (!dbPromise) {
    dbPromise = initSqliteDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function readFromSqlite(): Promise<AppStateSnapshot | null> {
  const db = await getSqliteDb();
  const res = await db.query(
    'SELECT payload FROM app_state WHERE key = ? LIMIT 1;',
    [STORAGE_KEY]
  );
  const row = res.values?.[0] as { payload?: unknown } | undefined;
  if (typeof row?.payload !== 'string') return null;

  try {
    const parsed = JSON.parse(row.payload) as unknown;
    return isAppStateSnapshot(parsed) ? normalizeSnapshot(parsed) : null;
  } catch {
    return null;
  }
}

function writeToSqlite(snapshot: AppStateSnapshot): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);
  const serialized = JSON.stringify(normalized);
  const updatedAt = new Date().toISOString();

  const task = sqliteWriteQueue.then(async () => {
    const db = await getSqliteDb();
    await db.run(
      'INSERT OR REPLACE INTO app_state (key, payload, schema_version, updated_at) VALUES (?, ?, ?, ?);',
      [STORAGE_KEY, serialized, SQLITE_SCHEMA_VERSION, updatedAt]
    );
  });

  sqliteWriteQueue = task.catch(() => {
    // Keep the queue alive even if one write fails.
  });

  return task;
}

/**
 * Loads the persisted application state from SQLite on native platforms
 * (migrating legacy localStorage data if present) or localStorage on web.
 */
export async function loadAppState(): Promise<AppStateSnapshot | null> {
  if (!isNativeSqliteEnabled()) {
    return loadFromLocalStorage();
  }

  try {
    const fromDb = await readFromSqlite();
    if (fromDb) return fromDb;

    const legacy = loadFromLocalStorage();
    if (legacy) {
      await writeToSqlite(legacy);
      removeFromLocalStorage();
      return legacy;
    }

    return null;
  } catch (error) {
    console.error('[storage] SQLite load failed, falling back to localStorage:', error);
    return loadFromLocalStorage();
  }
}

/**
 * Persists the full application state snapshot to SQLite on native platforms
 * or localStorage on web browsers.
 */
export async function saveAppState(snapshot: AppStateSnapshot): Promise<void> {
  const normalized = normalizeSnapshot(snapshot);

  if (!isNativeSqliteEnabled()) {
    saveToLocalStorage(normalized);
    return;
  }

  try {
    await writeToSqlite(normalized);
  } catch (error) {
    console.error('[storage] SQLite save failed, falling back to localStorage:', error);
    saveToLocalStorage(normalized);
  }
}

/** Reads the saved dark/light theme preference, or null if not yet set. */
export function loadThemePreference(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark') return true;
    if (raw === 'light') return false;
    return null;
  } catch {
    return null;
  }
}

/** Persists the user's dark/light theme preference locally. */
export function saveThemePreference(isDark: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
  } catch {
    // Ignore storage quota or private mode restrictions.
  }
}

/** Wraps an AppStateSnapshot into a versioned backup payload. */
export function createBackupPayload(snapshot: AppStateSnapshot): BackupFilePayload {
  return {
    app: 'financial-tracker',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: normalizeSnapshot(snapshot),
  };
}

function isShareCancelledError(error: unknown): boolean {
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (isRecord(error)) {
    if (typeof error.message === 'string') {
      message = error.message;
    } else if (typeof error.errorMessage === 'string') {
      message = error.errorMessage;
    }
  }

  return /cancel|dismiss|abort/i.test(message);
}

export interface ExportCsvOptions {
  headers?: string[];
  typeLabels?: { INCOME: string; EXPENSE: string };
  resolveCategoryName?: (category: Category | undefined) => string;
  title?: string;
  dialogTitle?: string;
}

function escapeCsvCell(value: string | number): string {
  if (typeof value === 'number') {
    return String(value);
  }
  const normalized = value.replace(/\r?\n/g, ' ').replace(/"/g, '""');
  return `"${normalized}"`;
}

/** Builds a UTF-8 BOM CSV string summarizing all cash book transactions in IDR. */
export function buildCashBookCsvContent(
  transactions: Transaction[],
  categories: Category[],
  options?: ExportCsvOptions
): string {
  const headers = options?.headers ?? [
    'Tanggal',
    'Tipe',
    'Kategori',
    'Deskripsi',
    'Nominal IDR',
    'Tag',
    'Catatan',
  ];
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const sorted = [...transactions].sort((a, b) => {
    const timeA = new Date(a.transactionDate).getTime();
    const timeB = new Date(b.transactionDate).getTime();
    return (Number.isNaN(timeB) ? 0 : timeB) - (Number.isNaN(timeA) ? 0 : timeA);
  });

  const rows = sorted.map((tx) => {
    const parsedDate = new Date(tx.transactionDate);
    const dateStr = Number.isNaN(parsedDate.getTime())
      ? tx.transactionDate.slice(0, 10)
      : toDateOnlyString(parsedDate);
    const typeLabel =
      options?.typeLabels?.[tx.type] ??
      (tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran');
    const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
    const categoryLabel =
      options?.resolveCategoryName?.(category) ?? category?.name ?? '';
    const amountIdr = Math.round(convertCurrency(tx.amount, tx.currency, 'IDR'));
    const tags = tx.tags.join('; ');
    const notes = tx.notes ?? '';

    return [
      escapeCsvCell(dateStr),
      escapeCsvCell(typeLabel),
      escapeCsvCell(categoryLabel),
      escapeCsvCell(tx.description),
      escapeCsvCell(amountIdr),
      escapeCsvCell(tags),
      escapeCsvCell(notes),
    ].join(',');
  });

  return `\uFEFF${[headers.map((h) => escapeCsvCell(h)).join(','), ...rows].join('\r\n')}`;
}

async function shareOrDownloadTextFile({
  fileName,
  content,
  mimeType,
  title,
  dialogTitle,
}: {
  fileName: string;
  content: string;
  mimeType: string;
  title: string;
  dialogTitle: string;
}): Promise<ExportBackupResult> {
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({
      path: fileName,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    const uriResult = await Filesystem.getUri({
      path: fileName,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        url: uriResult.uri,
        title,
        dialogTitle,
      });
      return { status: 'shared', fileName };
    } catch (error) {
      if (isShareCancelledError(error)) {
        return { status: 'cancelled', fileName };
      }
      throw error;
    }
  }

  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    return { status: 'downloaded', fileName };
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  return { status: 'downloaded', fileName };
}

/** Exports a dated JSON backup file via native Android Share or browser download. */
export async function exportBackupJson(
  snapshot: AppStateSnapshot,
  options?: ExportBackupOptions
): Promise<ExportBackupResult> {
  const payload = createBackupPayload(snapshot);
  const jsonText = JSON.stringify(payload, null, 2);
  const fileName = `financial-tracker-backup-${toDateOnlyString(new Date())}.json`;

  return shareOrDownloadTextFile({
    fileName,
    content: jsonText,
    mimeType: 'application/json',
    title: options?.title ?? 'Financial Tracker Backup',
    dialogTitle: options?.dialogTitle ?? 'Simpan atau Bagikan Backup JSON',
  });
}

/** Exports all transactions as a CSV file via native Android Share or browser download. */
export async function exportCashBookCsv(
  transactions: Transaction[],
  categories: Category[],
  options?: ExportCsvOptions
): Promise<ExportBackupResult> {
  const csvContent = buildCashBookCsvContent(transactions, categories, options);
  const fileName = `buku-kas-financial-tracker-${toDateOnlyString(new Date())}.csv`;

  return shareOrDownloadTextFile({
    fileName,
    content: csvContent,
    mimeType: 'text/csv;charset=utf-8;',
    title: options?.title ?? 'Rekap Buku Kas Financial Tracker',
    dialogTitle: options?.dialogTitle ?? 'Simpan atau Bagikan Rekap CSV',
  });
}

/** Parses and validates an uploaded JSON backup string into an AppStateSnapshot. */
export function parseBackupJson(rawText: string): ParseBackupResult {
  if (!rawText.trim()) {
    return { ok: false, error: 'File cadangan kosong.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return {
      ok: false,
      error: 'File bukan JSON yang valid. Pastikan Anda memilih file cadangan .json yang benar.',
    };
  }

  if (isRecord(parsed) && typeof parsed.app === 'string' && parsed.app !== 'financial-tracker') {
    return {
      ok: false,
      error: 'File JSON bukan cadangan dari aplikasi Financial Tracker.',
    };
  }

  const candidate = isRecord(parsed) && 'data' in parsed ? parsed.data : parsed;
  if (!isRecord(candidate)) {
    return { ok: false, error: 'Struktur data cadangan tidak dikenali.' };
  }

  if (!isValidCurrency(candidate.currency)) {
    return {
      ok: false,
      error: 'Mata uang dasar (currency) di dalam cadangan tidak valid atau tidak didukung.',
    };
  }

  if (
    !Array.isArray(candidate.categories) ||
    candidate.categories.length === 0 ||
    !candidate.categories.every(isValidCategory)
  ) {
    return {
      ok: false,
      error: 'Daftar kategori tidak valid atau kosong.',
    };
  }

  if (
    !Array.isArray(candidate.transactions) ||
    !candidate.transactions.every(isValidTransaction)
  ) {
    return {
      ok: false,
      error: 'Daftar transaksi tidak valid atau mengandung kolom yang rusak.',
    };
  }

  if (!Array.isArray(candidate.budgets) || !candidate.budgets.every(isValidBudget)) {
    return {
      ok: false,
      error: 'Daftar anggaran tidak valid atau mengandung kolom yang rusak.',
    };
  }

  if (
    !Array.isArray(candidate.recurringList) ||
    !candidate.recurringList.every(isValidRecurring)
  ) {
    return {
      ok: false,
      error: 'Daftar jadwal berulang tidak valid atau mengandung kolom yang rusak.',
    };
  }

  if (!isAppStateSnapshot(candidate)) {
    return { ok: false, error: 'Format snapshot cadangan tidak sesuai.' };
  }

  return { ok: true, snapshot: normalizeSnapshot(candidate) };
}
