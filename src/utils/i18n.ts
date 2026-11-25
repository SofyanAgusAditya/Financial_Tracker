import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Category, RecurringInterval } from '../types';
import { PeriodFilter, getPeriodRange } from './finance';

export type Language = 'id' | 'en';

const LANG_STORAGE_KEY = 'financial-tracker:lang:v1';

export function loadLanguagePreference(): Language {
  if (typeof window === 'undefined') return 'id';
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' ? 'en' : 'id';
  } catch {
    return 'id';
  }
}

export function saveLanguagePreference(lang: Language): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

export function getDateLocale(lang: Language): string {
  return lang === 'id' ? 'id-ID' : 'en-US';
}

const CATEGORY_LABELS: Record<string, { id: string; en: string }> = {
  'cat-inc-1': { id: 'Gaji', en: 'Salary' },
  'cat-inc-2': { id: 'Bisnis', en: 'Business' },
  'cat-inc-3': { id: 'Investasi & Dividen', en: 'Investment & Dividends' },
  'cat-inc-4': { id: 'Freelance & Konsultasi', en: 'Freelance & Consult' },
  'cat-inc-5': { id: 'Pemasukan Lainnya', en: 'Other Income' },
  'cat-exp-1': { id: 'Makanan & Minuman', en: 'Food & Dining' },
  'cat-exp-2': { id: 'Transportasi', en: 'Transportation' },
  'cat-exp-3': { id: 'Belanja & Ritel', en: 'Shopping & Retail' },
  'cat-exp-4': { id: 'Hiburan', en: 'Entertainment & Fun' },
  'cat-exp-5': { id: 'Tagihan & Utilitas', en: 'Bills & Utilities' },
  'cat-exp-6': { id: 'Kesehatan & Medis', en: 'Healthcare & Medical' },
  'cat-exp-7': { id: 'Pendidikan & Kursus', en: 'Education & Courses' },
  'cat-exp-8': { id: 'Tempat Tinggal & Sewa', en: 'Housing & Rent' },
  'cat-exp-9': { id: 'Pengeluaran Lainnya', en: 'Other Expenses' },
};

const CATEGORY_LABELS_BY_NAME = new Map<string, { id: string; en: string }>(
  Object.values(CATEGORY_LABELS).map((entry) => [entry.en.toLowerCase(), entry])
);

/** Returns a localized display label for default categories while preserving original ids/data. */
export function translateCategoryName(
  category: Pick<Category, 'id' | 'name'> | undefined | null,
  lang: Language,
  fallback?: string
): string {
  if (!category) {
    return fallback ?? (lang === 'id' ? 'Tanpa Kategori' : 'Unassigned');
  }

  const byId = CATEGORY_LABELS[category.id];
  if (byId) return byId[lang];

  const byName = CATEGORY_LABELS_BY_NAME.get(category.name.trim().toLowerCase());
  if (byName) return byName[lang];

  return category.name;
}

export function translatePeriodLabel(
  period: PeriodFilter,
  lang: Language,
  reference: Date = new Date()
): string {
  const locale = lang === 'id' ? 'id-ID' : 'en-GB';

  if (period === 'all') {
    return lang === 'id' ? 'Semua catatan' : 'All records';
  }

  if (period === 'today') {
    const formatted = reference.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return lang === 'id' ? `Hari ini, ${formatted}` : `Today, ${formatted}`;
  }

  const range = getPeriodRange(period, reference);
  if (!range) {
    return lang === 'id' ? 'Semua catatan' : 'All records';
  }

  if (period === 'this_week') {
    const startLabel = range.start.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
    });
    const endLabel = range.end.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${startLabel} – ${endLabel}`;
  }

  if (period === 'this_month') {
    return reference.toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
  }

  return String(reference.getFullYear());
}

export function translateInterval(interval: RecurringInterval, lang: Language): string {
  switch (interval) {
    case 'DAILY':
      return lang === 'id' ? 'Harian' : 'Daily';
    case 'WEEKLY':
      return lang === 'id' ? 'Mingguan' : 'Weekly';
    case 'MONTHLY':
      return lang === 'id' ? 'Bulanan' : 'Monthly';
    case 'YEARLY':
      return lang === 'id' ? 'Tahunan' : 'Yearly';
  }
}

export function translateBiometryLabel(label: string, lang: Language): string {
  if (lang === 'id') return label;
  if (label === 'Sidik Jari') return 'Fingerprint';
  if (label === 'Wajah') return 'Face ID';
  return 'Biometrics';
}

const idTranslations = {
  common: {
    income: 'Pemasukan',
    expense: 'Pengeluaran',
    all: 'Semua',
    cancel: 'Batal',
    save: 'Simpan',
    close: 'Tutup',
    delete: 'Hapus',
    edit: 'Ubah',
    unassigned: 'Tanpa Kategori',
    general: 'Umum',
    backupData: 'Backup & Data',
    securityMenu: 'Keamanan PIN & Biometrik',
    recurringSchedules: 'Jadwal Berulang',
  },
  header: {
    brandSubtitle: 'Dompet Pintar Lokal',
    navOverview: 'Ringkasan',
    navLedger: 'Catatan',
    navBudgets: 'Anggaran',
    navAnalytics: 'Laporan',
    tools: 'Alat',
    toolsTitle: 'Alat & Pengaturan',
    toggleTheme: 'Ganti Tema',
    switchLanguage: 'Pilih Bahasa',
    lockApp: 'Kunci Aplikasi',
  },
  bottomNav: {
    ariaLabel: 'Navigasi Bawah Mobile',
    home: 'Beranda',
    ledger: 'Catatan',
    budgets: 'Anggaran',
    analytics: 'Laporan',
    recordNewTx: 'Catat Transaksi Baru',
  },
  footer: {
    tagline: 'Buku kas lokal Rupiah',
    openCashBookAria: 'Buka Buku Kas Lokal (Rupiah)',
    backupData: 'Backup & Data',
  },
  toasts: {
    incomeAdded: (amount: string) => `Pemasukan ${amount} berhasil dicatat`,
    expenseAdded: (amount: string) => `Pengeluaran ${amount} berhasil dicatat`,
    txUpdated: (desc: string, amount: string) => `Transaksi "${desc}" (${amount}) diperbarui`,
    txDeleted: (desc: string, amount: string) => `Transaksi "${desc}" (${amount}) dihapus`,
    pressBackToExit: 'Tekan sekali lagi untuk keluar',
    confirmDeleteTx: (desc: string) => `Hapus "${desc}"? Tindakan ini tidak dapat dibatalkan.`,
    autoRecordedSingle: (sign: '+' | '-', amount: string, appName: string) =>
      `Auto-catat: ${sign}${amount} (${appName})`,
    autoRecordedMultiple: (count: number) =>
      `Auto-catat: ${count} transaksi baru dari notifikasi tersimpan`,
  },
  dashboard: {
    eyebrowLeft: 'Ringkasan Keuangan',
    eyebrowRight: 'Buku Kas Aktif',
    openCashBookTitle: 'Buka Buku Kas Lokal (Rupiah)',
    heroTitlePrefix: 'Kelola tabungan ',
    heroTitleHighlight: 'lebih rapi.',
    heroSubtitle: 'Pantau saldo kas, laju pengeluaran, dan batas anggaran secara real-time',
    budgetHeadroomTitle: 'Atur Batas & Pos Anggaran',
    budgetHeadroom: 'Sisa Anggaran',
    budgetHeadroomUsed: (pct: number) => `${pct}% anggaran bulanan terpakai`,
    budgetHeadroomEmpty: 'Atur anggaran pertama Anda',
    periods: {
      today: 'Hari Ini',
      this_week: 'Minggu',
      this_month: 'Bulan',
      this_year: 'Tahun',
      all: 'Semua',
    },
    netCashFlowPrefix: 'ARUS KAS BERSIH',
    entriesCount: (count: number) => `${count} transaksi`,
    asOf: (date: string) => `Per ${date}`,
    viewFullLedger: 'Lihat Semua Catatan',
    cashVelocity: 'Laju Pengeluaran',
    spentSuffix: (amount: string) => `${amount} Terpakai`,
    percentOfInflow: (pct: number) => `${pct}% dari pemasukan`,
    noInflowRecorded: 'Belum ada pemasukan',
    inflowLabel: (amount: string) => `Pemasukan: ${amount}`,
    income: 'Pemasukan',
    expense: 'Pengeluaran',
    analytics: 'Laporan',
    budgets: 'Anggaran',
    treatCheckEyebrow: 'CEK KESEHATAN KAS',
    surplusBanner: (amount: string) => `Surplus ${amount} tersedia untuk target tabungan`,
    deficitBanner: (amount: string) => `Perhatian: Pengeluaran melebihi pemasukan sebesar ${amount}`,
    envelopeRules: 'Atur Anggaran',
    weeklySpendingEyebrow: 'PENGELUARAN MINGGUAN',
    cashOutflowPulse: 'Ritme Pengeluaran Kas',
    fullAnalytics: 'Lihat Laporan',
    barAriaLabel: (date: string, amount: string) => `${date}: ${amount} terpakai`,
    budgetEnvelopes: 'Pos Anggaran',
    manageEnvelopes: 'Kelola Pos',
    noEnvelopesYet: 'Belum ada anggaran bulanan. Tetapkan batas bulanan untuk memantau pemakaian di sini.',
    spentLower: (amount: string) => `${amount} terpakai`,
    capLower: (amount: string) => `batas ${amount}`,
    kpiEntries: 'Transaksi',
    recordedIn: (period: string) => `Tercatat di ${period}`,
    kpiIncome: 'Pemasukan',
    periodInflow: 'Pemasukan periode ini',
    kpiExpenses: 'Pengeluaran',
    periodOutflow: 'Pengeluaran periode ini',
    kpiCashFlow: 'Arus Kas',
    periodSurplus: 'Surplus periode ini',
    periodDeficit: 'Defisit periode ini',
    velocityTitle: 'Rasio Pemasukan & Pengeluaran',
    velocitySubtitle: 'Perbandingan dana masuk terhadap pengeluaran operasional',
    consumedPercent: (pct: number) => `${pct}% Terpakai`,
    inflowShort: 'Pemasukan',
    outflowShort: 'Pengeluaran',
    spendingDistTitle: 'Distribusi Pengeluaran',
    spendingDistSubtitle: 'Alokasi pengeluaran berdasarkan kategori utama',
    fullBreakdown: 'Rincian Lengkap',
    noExpensesPeriod: 'Belum ada transaksi pengeluaran pada periode ini.',
    budgetThresholdsTitle: 'Batas Anggaran',
    budgetThresholdsSubtitle: 'Pemantauan batas anggaran bulanan',
    manage: 'Kelola',
    noThresholdsYet: 'Belum ada anggaran yang diatur. Tetapkan batas bulanan untuk memantau pemakaian nyata.',
    spentCapLabel: 'Terpakai',
    capLabel: 'Batas',
    timelineEyebrow: 'AKTIVITAS TERKINI',
    recentTransactions: 'Transaksi Terbaru',
    addRecordBtn: '+ Catat',
    viewAll: 'Lihat Semua',
    noTxInPeriod: (period: string) => `Belum ada transaksi pada ${period}`,
    noTxInPeriodHint: 'Catat pemasukan atau pengeluaran untuk mengisi periode ini.',
    recordTransaction: 'Catat Transaksi',
    pendingBadge: 'Tertunda',
    origSuffix: 'asal',
  },
  transactions: {
    eyebrow: 'Jurnal Umum & Riwayat',
    title: 'Daftar Transaksi',
    subtitle: (count: number, period: string) => `${count} transaksi tercatat · ${period}`,
    recordBtn: 'Catat Transaksi',
    searchPlaceholder: 'Cari deskripsi, catatan, atau tag (mis. kopi, gaji, sewa)...',
    sortDateDesc: 'Urutkan: Terbaru',
    sortDateAsc: 'Urutkan: Terlama',
    sortAmountDesc: 'Urutkan: Terbesar',
    sortAmountAsc: 'Urutkan: Terkecil',
    allTypes: 'Semua Tipe',
    allDates: 'Semua Tanggal',
    today: 'Hari Ini',
    thisWeek: 'Minggu Ini',
    thisMonth: 'Bulan Ini',
    thisYear: 'Tahun Ini',
    allCategories: 'Semua Kategori',
    resetFilters: 'Reset Filter',
    emptyTitle: 'Tidak ada transaksi yang cocok',
    emptySubtitle: 'Ubah filter pencarian atau catat transaksi baru ke buku kas.',
    addFirstBtn: 'Tambah Transaksi Pertama',
    editTitle: 'Ubah transaksi',
    deleteTitle: 'Hapus transaksi',
    detailTitle: 'Detail Transaksi',
    description: 'Deskripsi',
    amount: 'Nominal',
    type: 'Tipe',
    dateTime: 'Tanggal & Waktu',
    category: 'Kategori',
    uncategorized: 'Tanpa Kategori',
    notes: 'Catatan',
    tags: 'Tag',
    idempotencyKey: 'Kunci Idempotensi',
    syncStatus: 'Status Penyimpanan',
    editBtn: 'Ubah Transaksi',
  },
  budgets: {
    duplicateAlert: 'Kategori ini sudah memiliki anggaran bulanan. Ubah pos anggaran yang sudah ada daripada membuat duplikat.',
    eyebrow: 'Kontrol Pengeluaran Pos',
    title: 'Manajemen Anggaran',
    subtitle: (period: string) =>
      `Kelola disiplin pengeluaran ${period} dengan peringatan ambang 80%, 90%, dan 100%`,
    setCategoryBudget: 'Atur Anggaran',
    envelopeTotal: (period: string) => `Total Anggaran · ${period}`,
    ofAmount: (amount: string) => `dari ${amount}`,
    overallUtilization: 'Total Pemakaian',
    remainingToSpend: (amount: string) => `Sisa Anggaran: ${amount}`,
    activeCount: (count: number) => `${count} Pos Anggaran Aktif`,
    emptyTitle: (period: string) => `Belum ada anggaran untuk ${period}`,
    emptySubtitle: 'Buat pos anggaran untuk memantau pengeluaran bulanan terhadap batas yang ditetapkan.',
    setFirstBtn: 'Buat Anggaran Pertama',
    statusNominal: 'Aman',
    statusWarning: 'Peringatan (80%)',
    statusCritical: 'Kritis (90%)',
    statusExceeded: 'Melebihi Batas (100%+)',
    editLimitTitle: 'Ubah Batas',
    deleteBudgetTitle: 'Hapus Anggaran',
    spentLabel: 'Terpakai:',
    limitLabel: 'Batas:',
    leftAmount: (amount: string) => `Sisa ${amount}`,
    overAmount: (amount: string) => `Lebih ${amount}`,
    modalEditTitle: 'Ubah Anggaran Kategori',
    modalAddTitle: 'Tambah Anggaran Bulanan',
    expenseCategory: 'Kategori Pengeluaran',
    monthlyLimit: (currency: string) => `Batas Bulanan (${currency})`,
    thresholdNote: 'Pemantauan otomatis akan menandai pengeluaran saat mencapai kapasitas 80%, 90%, dan 100%.',
    saveBudget: 'Simpan Anggaran',
  },
  reports: {
    eyebrow: 'Laporan & Ringkasan Keuangan',
    title: 'Analitik & Laporan Keuangan',
    subtitle: (period: string) => `Laporan arus kas dan alokasi kategori untuk ${period}`,
    printReport: 'Cetak Laporan',
    exportCsv: 'Ekspor CSV',
    reportingPeriod: 'Periode laporan:',
    txCount: (count: number) => `${count} transaksi`,
    periods: {
      today: 'Hari Ini',
      this_week: 'Minggu Ini',
      this_month: 'Bulan Ini',
      this_year: 'Tahun Ini',
      all: 'Semua',
    },
    totalRevenue: 'Total Pemasukan',
    grossInflow: 'Total dana masuk tercatat',
    totalExpenditure: 'Total Pengeluaran',
    cumulativeOutlay: 'Total pembayaran & pengeluaran',
    netSavings: 'Surplus Tabungan Bersih',
    savingsRate: (rate: number) => `Rasio tabungan: ${rate}%`,
    allocationTitle: 'Rincian Alokasi Kategori',
    allocationSubtitle: 'Rincian volume pengeluaran berdasarkan kategori',
    emptyAllocation: 'Belum ada transaksi pengeluaran pada periode ini.',
    percentOfTotal: (pct: number) => `${pct}% dari total`,
  },
  recurring: {
    eyebrow: 'Aturan Arus Kas Otomatis',
    title: 'Jadwal Berulang',
    subtitle:
      'Otomatiskan tagihan rutin, pemasukan gaji, dan langganan. Hanya jadwal yang jatuh tempo yang akan dicatat.',
    processDue: (count: number) => `Proses ${count} Jatuh Tempo`,
    noDueSchedules: 'Tidak Ada Jatuh Tempo',
    newSchedule: 'Jadwal Baru',
    postedResult: (count: number) =>
      `${count} transaksi terjadwal berhasil dicatat ke buku kas. Tanggal berikutnya telah diperbarui.`,
    noneDueResult: 'Tidak ada jadwal yang jatuh tempo. Tidak ada transaksi baru.',
    active: 'Aktif',
    paused: 'Dijeda',
    nextRun: 'Berikutnya:',
    dueNow: '· Jatuh tempo',
    modalTitle: 'Transaksi Berulang Baru',
    description: 'Deskripsi',
    descriptionPlaceholder: 'mis. Internet WiFi, Sewa Kos, Spotify',
    scheduleType: 'Tipe Jadwal',
    frequency: 'Frekuensi',
    amountLabel: (currency: string) => `Nominal (${currency})`,
    category: 'Kategori',
    nextRunDate: 'Tanggal Berikutnya',
    createSchedule: 'Buat Jadwal',
  },
  txModal: {
    editTitle: 'Ubah Transaksi',
    newTitle: 'Catat Transaksi',
    scanReceipt: 'Scan Struk',
    scanningReceipt: 'Memindai struk...',
    scanPromptTitle: 'Pilih Sumber Foto Struk',
    scanTakePhoto: 'Ambil Foto dengan Kamera',
    scanFromGallery: 'Pilih dari Galeri',
    scanNativeOnly:
      'Fitur Scan Struk OCR offline tersedia di aplikasi Android. Silakan isi detail transaksi secara manual di browser web.',
    scanSuccessReview:
      'Data struk berhasil terbaca otomatis. Mohon periksa kembali nominal, deskripsi, kategori, tanggal, dan catatan sebelum menyimpan.',
    scanPartialReview:
      'Teks struk berhasil dipindai, namun detail belum terdeteksi lengkap. Silakan lengkapi kolom transaksi secara manual.',
    scanNoText:
      'Tidak ada teks yang terbaca pada foto struk. Coba ambil ulang foto di tempat yang lebih terang dan fokus.',
    scanPermissionDenied:
      'Izin kamera atau galeri ditolak. Aktifkan izin pada pengaturan perangkat untuk memindai struk.',
    scanError:
      'Gagal memindai struk. Pastikan foto jelas atau isi detail transaksi secara manual.',
    description: 'Deskripsi',
    descriptionPlaceholder: 'mis. Belanja Bulanan, Gaji, Makan Siang',
    amountLabel: (currency: string) => `Nominal (${currency})`,
    date: 'Tanggal',
    category: 'Kategori',
    tags: 'Tag (Pisahkan dengan koma)',
    tagsPlaceholder: 'mis. makan, kopi, tagihan',
    notes: 'Catatan (Opsional)',
    notesPlaceholder: 'Keterangan tambahan transaksi...',
    saveChanges: 'Simpan Perubahan',
    recordTransaction: 'Simpan Transaksi',
  },
  backupModal: {
    title: 'Backup & Data Lokal',
    subtitle: 'Penyimpanan lokal perangkat · Backup & Restore JSON',
    closeAria: 'Tutup modal Backup & Data',
    transactions: 'Transaksi',
    budgets: 'Anggaran',
    schedules: 'Jadwal',
    activeCategories: (count: number) => `${count} kategori aktif`,
    currencyLabel: 'Mata uang:',
    backupCardTitle: 'Cadangan Data (JSON)',
    exportBtn: 'Export JSON',
    exportingBtn: 'Menyiapkan...',
    restoreBtn: 'Restore JSON',
    clearBtn: 'Kosongkan Data (Mulai dari 0)',
    clearConfirmText:
      'Semua transaksi, anggaran, dan jadwal berulang akan dihapus permanen dari penyimpanan lokal. Kategori bawaan tetap dipertahankan.',
    confirmClearBtn: 'Ya, Kosongkan Data',
    shareTitle: 'Cadangan Financial Tracker',
    shareDialogTitle: 'Simpan atau Bagikan Backup JSON',
    exportSuccess: (fileName: string) => `Cadangan berhasil diunduh (${fileName}).`,
    exportSharedSuccess: (fileName: string) =>
      `Cadangan siap disimpan atau dibagikan (${fileName}).`,
    exportCancelled: 'Ekspor cadangan dibatalkan.',
    exportError: 'Gagal mengekspor file cadangan. Silakan coba lagi.',
    restoreSuccess: (tx: number, budgets: number, rec: number) =>
      `Cadangan dipulihkan (${tx} transaksi, ${budgets} anggaran, ${rec} jadwal).`,
    readError: 'Gagal membaca file cadangan. Coba pilih ulang file JSON.',
    clearSuccess:
      'Transaksi, anggaran, dan jadwal berulang telah dikosongkan. Kategori bawaan tetap dipertahankan.',
    notifTitle: 'Auto-Catat Notifikasi E-Wallet & Bank',
    notifSubtitle: 'Tangkap otomatis transaksi Bank Jago, DANA, GoPay, OVO, SeaBank, BCA, BRImo, Mandiri & lainnya',
    notifSupportedLabel: 'Didukung:',
    notifSupportedCompact: 'Bank Jago, DANA, GoPay, BCA, Mandiri & 11 lainnya',
    notifShowAllApps: 'Lihat semua',
    notifHideAllApps: 'Sembunyikan',
    notifStatusActive: 'Aktif',
    notifStatusInactive: 'Belum Aktif',
    notifAndroidOnly: 'Android',
    notifToggleLabel: 'Aktifkan Auto-Catat',
    notifToggleHint: 'Otomatis menyimpan transaksi masuk/keluar saat notifikasi diterima',
    notifAndroidOnlyHint:
      'Hanya tersedia di aplikasi Android melalui layanan Akses Notifikasi perangkat.',
    notifOpenSettingsBtn: 'Buka Izin',
    notifCheckStatusBtn: 'Cek Status',
    notifCheckingBtn: 'Memeriksa...',
    notifPermissionActiveFeedback:
      'Akses notifikasi aktif. Transaksi masuk/keluar dari e-wallet & bank akan dicatat otomatis.',
    notifPermissionInactiveFeedback:
      'Akses notifikasi belum aktif. Aktifkan "Financial Tracker Auto-Record" di Pengaturan Android.',
    notifOpenSettingsError: 'Gagal membuka Pengaturan Akses Notifikasi perangkat.',
    checkUpdateTitle: 'Pembaruan Aplikasi',
    checkUpdateVersion: (version: string) => `Versi v${version}`,
    checkUpdateBtn: 'Cek Pembaruan',
    checkingUpdateBtn: 'Memeriksa...',
    updateUpToDate: (version: string) =>
      `Aplikasi sudah menggunakan versi terbaru (v${version})`,
    updateAvailableFound: (version: string) => `Pembaruan v${version} tersedia!`,
    updateCheckUnavailable:
      'Pengecekan pembaruan membutuhkan koneksi internet. Coba lagi saat online.',
  },
  lockScreen: {
    localSecurity: 'Keamanan Lokal',
    createNewPin: 'Buat PIN Baru',
    secureWallet: 'Amankan Dompet Anda',
    confirmNewPin: 'Konfirmasi PIN Baru',
    setupSubtitle: 'Masukkan 6 digit PIN untuk mengunci data keuangan lokal Anda.',
    confirmSubtitle: 'Ketik ulang 6 digit PIN yang sama untuk konfirmasi.',
    unlockSubtitleBiometric: (label: string) => `Masukkan PIN 6 digit atau gunakan ${label}.`,
    unlockSubtitlePin: 'Masukkan PIN 6 digit untuk membuka data keuangan Anda.',
    pinProgressAria: (count: number, total: number) => `${count} dari ${total} digit dimasukkan`,
    verifyingPin: 'Memverifikasi PIN...',
    mismatchError: 'PIN konfirmasi tidak cocok. Silakan ketik ulang.',
    savePinError: 'Gagal menyimpan konfigurasi PIN. Silakan coba lagi.',
    wrongPinError: 'PIN salah. Silakan coba lagi.',
    verifyError: 'Terjadi kesalahan saat memeriksa PIN.',
    biometricReason: 'Buka kunci Financial Tracker',
    enableBiometric: (label: string) => `Aktifkan ${label}`,
    biometricAvailableHint: 'Buka kunci cepat dengan sensor biometrik',
    biometricAndroidHint: 'Aktif otomatis di perangkat Android yang mendukung',
    unlockWithBiometric: (label: string) => `Buka dengan ${label}`,
    waitingVerification: 'Menunggu verifikasi...',
    repeat: 'Ulangi',
    deleteDigitAria: 'Hapus digit',
    settingsTitle: 'Keamanan PIN & Biometrik',
    settingsSubtitle: 'Proteksi lokal perangkat tanpa akun cloud',
    settingsCloseAria: 'Tutup pengaturan keamanan',
    pinActiveTitle: 'PIN 6 Digit Aktif',
    pinActiveDesc: 'Tersimpan lokal sebagai hash SHA-256',
    statusActive: 'Aktif',
    biometricTitle: (label: string) => `Biometrik (${label})`,
    biometricEnabledDesc: 'Aktif untuk membuka aplikasi secara cepat',
    biometricDisabledDesc: 'Nonaktif · gunakan PIN 6 digit untuk masuk',
    biometricUnavailableDesc:
      'Hanya tersedia pada perangkat Android yang mendukung sidik jari.',
    unavailableBadge: 'Tidak Tersedia',
    biometricDisabledSuccess:
      'Kunci biometrik dinonaktifkan. Gunakan PIN 6 digit untuk membuka aplikasi.',
    biometricEnabledSuccess: (label: string) =>
      `${label} berhasil diaktifkan untuk membuka aplikasi.`,
    confirmBiometricPrompt: (label: string) =>
      `Konfirmasi ${label.toLowerCase()} untuk mengaktifkan kunci biometrik`,
    changePinBtn: 'Ubah PIN 6 Digit',
    lockNowBtn: 'Kunci Aplikasi Sekarang',
  },
  cashBook: {
    title: 'Buku Kas Lokal (Rupiah)',
    subtitle: 'SQLite Lokal Offline · Mata Uang IDR',
    closeAria: 'Tutup modal Buku Kas Lokal',
    storageStatus: 'SQLite Lokal Offline · Mata Uang IDR',
    summarySectionTitle: 'Ringkasan & Status Buku Kas',
    overallNetBalance: 'Saldo Bersih Keseluruhan',
    totalTransactions: 'Total Transaksi',
    txCount: (count: number) => `${count} transaksi`,
    allTimeIncome: 'Total Pemasukan',
    allTimeExpense: 'Total Pengeluaran',
    dateRangeLabel: 'Rentang Tanggal',
    noTransactionsRange: 'Belum ada transaksi tercatat',
    adjustmentSectionTitle: 'Penyesuaian Saldo / Saldo Awal Kas',
    adjustmentSectionSubtitle:
      'Samakan saldo tercatat di aplikasi dengan uang kas nyata Anda saat ini.',
    actualBalanceLabel: 'Saldo Kas Nyata Saat Ini (IDR)',
    actualBalancePlaceholder: 'cth. 2.500.000',
    recordedBalanceLabel: 'Saldo Tercatat:',
    differenceLabel: 'Selisih Saldo:',
    adjustmentHint: 'Masukkan nominal saldo kas nyata untuk menghitung selisih otomatis.',
    balanceMatched: 'Saldo tercatat sudah sesuai dengan saldo kas nyata Anda.',
    willRecordIncome: (amount: string) =>
      `Akan dicatat sebagai Pemasukan sebesar ${amount}`,
    willRecordExpense: (amount: string) =>
      `Akan dicatat sebagai Pengeluaran sebesar ${amount}`,
    recordAdjustmentBtn: 'Catat Penyesuaian Saldo',
    adjustmentTxDescription: 'Penyesuaian Saldo Kas',
    adjustmentNote: (recorded: string, actual: string, signedDiff: string) =>
      `Penyesuaian saldo kas: tercatat ${recorded} → nyata ${actual} (selisih ${signedDiff})`,
    adjustmentSuccess: (typeLabel: string, amount: string) =>
      `Penyesuaian saldo (${typeLabel} ${amount}) berhasil dicatat ke buku kas.`,
    exportSectionTitle: 'Ekspor Rekap Buku Kas',
    exportSectionSubtitle:
      'Bagikan daftar seluruh transaksi ke format CSV atau salin ringkasan arus kas bulan ini.',
    exportCsvBtn: 'Ekspor CSV',
    exportingCsvBtn: 'Menyiapkan CSV...',
    copySummaryBtn: 'Salin Ringkasan',
    copiedBtn: 'Tersalin!',
    csvShareTitle: 'Rekap Buku Kas Financial Tracker',
    csvShareDialogTitle: 'Simpan atau Bagikan Rekap CSV',
    csvHeaders: ['Tanggal', 'Tipe', 'Kategori', 'Deskripsi', 'Nominal IDR', 'Tag', 'Catatan'],
    csvEmptyInfo: 'Belum ada transaksi untuk diekspor ke CSV.',
    csvExportSuccess: (fileName: string) => `Rekap CSV berhasil diunduh (${fileName}).`,
    csvExportSharedSuccess: (fileName: string) =>
      `Rekap CSV siap disimpan atau dibagikan (${fileName}).`,
    csvExportCancelled: 'Ekspor rekap CSV dibatalkan.',
    csvExportError: 'Gagal mengekspor rekap CSV. Silakan coba lagi.',
    copySuccess: 'Ringkasan arus kas bulan ini berhasil disalin ke clipboard.',
    copyError: 'Gagal menyalin ringkasan ke clipboard.',
    summaryHeader: (monthLabel: string) => `Ringkasan Buku Kas · ${monthLabel}`,
    summaryMonthIncome: (amount: string) => `Pemasukan Bulan Ini: ${amount}`,
    summaryMonthExpense: (amount: string) => `Pengeluaran Bulan Ini: ${amount}`,
    summaryMonthNet: (signedAmount: string) => `Arus Kas Bersih Bulan Ini: ${signedAmount}`,
    summaryMonthCount: (count: number) => `Transaksi Bulan Ini: ${count} transaksi`,
    summaryOverallBalance: (amount: string, totalCount: number) =>
      `Saldo Kas Keseluruhan: ${amount} (Total ${totalCount} transaksi)`,
  },
  updateModal: {
    title: 'Pembaruan Tersedia',
    subtitle: 'Versi terbaru Financial Tracker tersedia di GitHub Releases',
    closeAria: 'Tutup pemberitahuan pembaruan',
    versionLabel: 'Versi Baru',
    releaseNotesTitle: 'Catatan Pembaruan',
    noReleaseNotes:
      'Peningkatan performa, perbaikan bug, dan penyempurnaan pengalaman pengguna.',
    updateNowBtn: 'Update Sekarang',
    laterBtn: 'Nanti Saja',
    publishedPrefix: (date: string) => `Dirilis ${date}`,
  },
};

export type TranslationDictionary = typeof idTranslations;

const enTranslations: TranslationDictionary = {
  common: {
    income: 'Income',
    expense: 'Expense',
    all: 'All',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    unassigned: 'Unassigned',
    general: 'General',
    backupData: 'Backup & Data',
    securityMenu: 'PIN & Biometric Security',
    recurringSchedules: 'Recurring Schedules',
  },
  header: {
    brandSubtitle: 'Local Fintech Suite',
    navOverview: 'Overview',
    navLedger: 'Ledger',
    navBudgets: 'Budgets',
    navAnalytics: 'Analytics',
    tools: 'Tools',
    toolsTitle: 'Tools & Settings',
    toggleTheme: 'Toggle Theme',
    switchLanguage: 'Select Language',
    lockApp: 'Lock App',
  },
  bottomNav: {
    ariaLabel: 'Mobile Navigation Dock',
    home: 'Home',
    ledger: 'Ledger',
    budgets: 'Budgets',
    analytics: 'Analytics',
    recordNewTx: 'Record New Transaction',
  },
  footer: {
    tagline: 'Local-first Rupiah ledger',
    openCashBookAria: 'Open Local Cash Book (Rupiah)',
    backupData: 'Backup & Data',
  },
  toasts: {
    incomeAdded: (amount: string) => `Income of ${amount} recorded`,
    expenseAdded: (amount: string) => `Expense of ${amount} recorded`,
    txUpdated: (desc: string, amount: string) => `Transaction "${desc}" (${amount}) updated`,
    txDeleted: (desc: string, amount: string) => `Transaction "${desc}" (${amount}) deleted`,
    pressBackToExit: 'Press back again to exit',
    confirmDeleteTx: (desc: string) => `Delete "${desc}"? This action cannot be undone.`,
    autoRecordedSingle: (sign: '+' | '-', amount: string, appName: string) =>
      `Auto-recorded: ${sign}${amount} (${appName})`,
    autoRecordedMultiple: (count: number) =>
      `Auto-recorded: ${count} new transactions from notifications`,
  },
  dashboard: {
    eyebrowLeft: 'Portfolio Intelligence',
    eyebrowRight: 'Active Ledger',
    openCashBookTitle: 'Open Local Cash Book (Rupiah)',
    heroTitlePrefix: 'Make your capital ',
    heroTitleHighlight: 'thrive.',
    heroSubtitle: 'Real-time cash liquidity, spending velocity, and budget envelopes',
    budgetHeadroomTitle: 'Configure Budget Envelopes & Rules',
    budgetHeadroom: 'Budget Headroom',
    budgetHeadroomUsed: (pct: number) => `${pct}% of monthly envelopes used`,
    budgetHeadroomEmpty: 'Set your first envelope',
    periods: {
      today: 'Today',
      this_week: 'Week',
      this_month: 'Month',
      this_year: 'Year',
      all: 'All',
    },
    netCashFlowPrefix: 'NET CASH FLOW',
    entriesCount: (count: number) => `${count} entries`,
    asOf: (date: string) => `As of ${date}`,
    viewFullLedger: 'View Full Ledger',
    cashVelocity: 'Cash Velocity',
    spentSuffix: (amount: string) => `${amount} Spent`,
    percentOfInflow: (pct: number) => `${pct}% of inflow`,
    noInflowRecorded: 'No inflow recorded',
    inflowLabel: (amount: string) => `Inflow: ${amount}`,
    income: 'Income',
    expense: 'Expense',
    analytics: 'Analytics',
    budgets: 'Budgets',
    treatCheckEyebrow: 'TREAT CHECK · CASH FLOW HEALTH',
    surplusBanner: (amount: string) => `Surplus of ${amount} available for savings goals`,
    deficitBanner: (amount: string) => `Attention: Outflow exceeded income by ${amount}`,
    envelopeRules: 'Envelope Rules',
    weeklySpendingEyebrow: 'WEEKLY SPENDING',
    cashOutflowPulse: 'Cash Outflow Pulse',
    fullAnalytics: 'Full Analytics',
    barAriaLabel: (date: string, amount: string) => `${date}: ${amount} spent`,
    budgetEnvelopes: 'Budget Envelopes',
    manageEnvelopes: 'Manage Envelopes',
    noEnvelopesYet: 'No budget envelopes yet. Set a monthly cap to see live utilization here.',
    spentLower: (amount: string) => `${amount} spent`,
    capLower: (amount: string) => `${amount} cap`,
    kpiEntries: 'Entries',
    recordedIn: (period: string) => `Recorded in ${period}`,
    kpiIncome: 'Income',
    periodInflow: 'Period inflow',
    kpiExpenses: 'Expenses',
    periodOutflow: 'Period outflow',
    kpiCashFlow: 'Cash Flow',
    periodSurplus: 'Period surplus',
    periodDeficit: 'Period deficit',
    velocityTitle: 'Income to Expense Velocity',
    velocitySubtitle: 'Ratio of inflows retained versus operational burn',
    consumedPercent: (pct: number) => `${pct}% Consumed`,
    inflowShort: 'Inflow',
    outflowShort: 'Outflow',
    spendingDistTitle: 'Spending Distribution',
    spendingDistSubtitle: 'Capital allocation across primary spending categories',
    fullBreakdown: 'Full Breakdown',
    noExpensesPeriod: 'No expense transactions recorded in this period.',
    budgetThresholdsTitle: 'Budget Thresholds',
    budgetThresholdsSubtitle: 'Monthly envelope cap tracking',
    manage: 'Manage',
    noThresholdsYet: 'No envelopes configured yet. Set a monthly cap so this panel reflects real spending.',
    spentCapLabel: 'Spent',
    capLabel: 'Cap',
    timelineEyebrow: 'TIMELINE ACTIVITY',
    recentTransactions: 'Recent Ledger Transactions',
    addRecordBtn: '+ Record',
    viewAll: 'View All',
    noTxInPeriod: (period: string) => `No transactions in ${period}`,
    noTxInPeriodHint: 'Record an income or expense entry to populate this period.',
    recordTransaction: 'Record Transaction',
    pendingBadge: 'Pending',
    origSuffix: 'orig',
  },
  transactions: {
    eyebrow: 'General Journal & Audit Log',
    title: 'Transactions Ledger',
    subtitle: (count: number, period: string) => `${count} recorded items · ${period}`,
    recordBtn: 'Record Transaction',
    searchPlaceholder: 'Search description, notes, or tags (e.g. coffee, salary, rent)...',
    sortDateDesc: 'Sort: Date (Newest)',
    sortDateAsc: 'Sort: Date (Oldest)',
    sortAmountDesc: 'Sort: Amount (Highest)',
    sortAmountAsc: 'Sort: Amount (Lowest)',
    allTypes: 'All Types',
    allDates: 'All Dates',
    today: 'Today',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    thisYear: 'This Year',
    allCategories: 'All Categories',
    resetFilters: 'Reset Filters',
    emptyTitle: 'No transactions match your criteria',
    emptySubtitle: 'Try adjusting your search query or record a new entry into the ledger.',
    addFirstBtn: 'Add First Transaction',
    editTitle: 'Edit transaction',
    deleteTitle: 'Delete transaction',
    detailTitle: 'Transaction Details',
    description: 'Description',
    amount: 'Amount',
    type: 'Type',
    dateTime: 'Date & Time',
    category: 'Category',
    uncategorized: 'Uncategorized',
    notes: 'Notes',
    tags: 'Tags',
    idempotencyKey: 'Idempotency Key',
    syncStatus: 'Sync Status',
    editBtn: 'Edit Transaction',
  },
  budgets: {
    duplicateAlert:
      'This category already has a monthly budget. Edit the existing envelope instead of creating a duplicate.',
    eyebrow: 'Envelope Spending Controls',
    title: 'Budget Management',
    subtitle: (period: string) =>
      `Enforce spending discipline for ${period} with 80%, 90%, and 100% threshold alerts`,
    setCategoryBudget: 'Set Category Budget',
    envelopeTotal: (period: string) => `Envelope Total · ${period}`,
    ofAmount: (amount: string) => `of ${amount}`,
    overallUtilization: 'Overall Utilization',
    remainingToSpend: (amount: string) => `Remaining to Spend: ${amount}`,
    activeCount: (count: number) => `${count} Active Category Budgets`,
    emptyTitle: (period: string) => `No budgets configured for ${period}`,
    emptySubtitle: 'Create an envelope to track monthly spending against a real limit.',
    setFirstBtn: 'Set First Budget',
    statusNominal: 'Nominal',
    statusWarning: 'Warning (80%)',
    statusCritical: 'Critical Alert (90%)',
    statusExceeded: 'Exceeded (100%+)',
    editLimitTitle: 'Edit Limit',
    deleteBudgetTitle: 'Delete Budget',
    spentLabel: 'Spent:',
    limitLabel: 'Limit:',
    leftAmount: (amount: string) => `${amount} left`,
    overAmount: (amount: string) => `Over by ${amount}`,
    modalEditTitle: 'Edit Category Budget',
    modalAddTitle: 'Add Monthly Budget',
    expenseCategory: 'Expense Category',
    monthlyLimit: (currency: string) => `Monthly Limit (${currency})`,
    thresholdNote:
      'Automated threshold monitoring will flag entries at 80%, 90%, and 100% capacity.',
    saveBudget: 'Save Budget',
  },
  reports: {
    eyebrow: 'Financial Statements & Disclosures',
    title: 'Financial Analytics & Reports',
    subtitle: (period: string) =>
      `Audit-ready cash flow statements and category allocations for ${period}`,
    printReport: 'Print Report',
    exportCsv: 'Export CSV',
    reportingPeriod: 'Reporting period:',
    txCount: (count: number) => `${count} transactions`,
    periods: {
      today: 'Today',
      this_week: 'This Week',
      this_month: 'This Month',
      this_year: 'This Year',
      all: 'All Records',
    },
    totalRevenue: 'Total Revenue',
    grossInflow: 'Gross inflow recorded',
    totalExpenditure: 'Total Expenditure',
    cumulativeOutlay: 'Cumulative payments & outlays',
    netSavings: 'Net Savings Surplus',
    savingsRate: (rate: number) => `Savings rate: ${rate}%`,
    allocationTitle: 'Detailed Category Allocation',
    allocationSubtitle: 'Breakdown of total expense volume by functional category',
    emptyAllocation: 'No expense transactions recorded in this period.',
    percentOfTotal: (pct: number) => `${pct}% of total`,
  },
  recurring: {
    eyebrow: 'Automated Cash Flow Rules',
    title: 'Recurring Schedules',
    subtitle:
      'Automate routine billing, salary credits, and subscriptions. Only schedules with a due date are posted.',
    processDue: (count: number) => `Process ${count} Due`,
    noDueSchedules: 'No Due Schedules',
    newSchedule: 'New Schedule',
    postedResult: (count: number) =>
      `${count} scheduled ${count === 1 ? 'transaction was' : 'transactions were'} posted to the ledger. Next run dates have been advanced.`,
    noneDueResult: 'No schedules were due. Nothing was posted to the ledger.',
    active: 'Active',
    paused: 'Paused',
    nextRun: 'Next Run:',
    dueNow: '· Due now',
    modalTitle: 'New Recurring Transaction',
    description: 'Description',
    descriptionPlaceholder: 'e.g. Internet Provider, Office Rent, Spotify',
    scheduleType: 'Schedule Type',
    frequency: 'Frequency',
    amountLabel: (currency: string) => `Amount (${currency})`,
    category: 'Category',
    nextRunDate: 'Next Run Date',
    createSchedule: 'Create Schedule',
  },
  txModal: {
    editTitle: 'Edit Transaction',
    newTitle: 'Record Transaction',
    scanReceipt: 'Scan Receipt',
    scanningReceipt: 'Scanning receipt...',
    scanPromptTitle: 'Choose Receipt Photo Source',
    scanTakePhoto: 'Take Photo with Camera',
    scanFromGallery: 'Choose from Gallery',
    scanNativeOnly:
      'Offline OCR receipt scanning is available in the Android app. Please enter the transaction details manually in the web browser.',
    scanSuccessReview:
      'Receipt details were auto-filled. Please review the amount, description, category, date, and notes before saving.',
    scanPartialReview:
      'Receipt text was scanned, but some details could not be detected automatically. Please complete the fields manually.',
    scanNoText:
      'No readable text was detected in the photo. Try capturing the receipt again in brighter lighting.',
    scanPermissionDenied:
      'Camera or gallery permission was denied. Enable permissions in device settings to scan receipts.',
    scanError:
      'Failed to scan the receipt. Make sure the photo is clear or enter the details manually.',
    description: 'Description',
    descriptionPlaceholder: 'e.g. Grocery Store, Client Payout, Lunch',
    amountLabel: (currency: string) => `Amount (${currency})`,
    date: 'Date',
    category: 'Category',
    tags: 'Tags (Comma separated)',
    tagsPlaceholder: 'e.g. food, dinner, client',
    notes: 'Notes (Optional)',
    notesPlaceholder: 'Additional ledger context...',
    saveChanges: 'Save Changes',
    recordTransaction: 'Record Transaction',
  },
  backupModal: {
    title: 'Local Backup & Data',
    subtitle: 'On-device local storage · JSON Backup & Restore',
    closeAria: 'Close Backup & Data modal',
    transactions: 'Transactions',
    budgets: 'Budgets',
    schedules: 'Schedules',
    activeCategories: (count: number) => `${count} active categories`,
    currencyLabel: 'Currency:',
    backupCardTitle: 'Data Backup (JSON)',
    exportBtn: 'Export JSON',
    exportingBtn: 'Preparing...',
    restoreBtn: 'Restore JSON',
    clearBtn: 'Clear Data (Start Fresh)',
    clearConfirmText:
      'All transactions, budgets, and recurring schedules will be permanently deleted from local storage. Default categories will remain intact.',
    confirmClearBtn: 'Yes, Clear Data',
    shareTitle: 'Financial Tracker Backup',
    shareDialogTitle: 'Save or Share JSON Backup',
    exportSuccess: (fileName: string) => `Backup downloaded (${fileName}).`,
    exportSharedSuccess: (fileName: string) =>
      `Backup ready to save or share (${fileName}).`,
    exportCancelled: 'Backup export was cancelled.',
    exportError: 'Failed to export backup file. Please try again.',
    restoreSuccess: (tx: number, budgets: number, rec: number) =>
      `Backup restored (${tx} transactions, ${budgets} budgets, ${rec} schedules).`,
    readError: 'Failed to read backup file. Please choose the JSON file again.',
    clearSuccess:
      'Transactions, budgets, and recurring schedules have been cleared. Default categories were preserved.',
    notifTitle: 'Auto-Record E-Wallet & Bank Notifications',
    notifSubtitle: 'Automatically capture Bank Jago, DANA, GoPay, OVO, SeaBank, BCA, BRImo, Mandiri & more',
    notifSupportedLabel: 'Supported:',
    notifSupportedCompact: 'Bank Jago, DANA, GoPay, BCA, Mandiri & 11 more',
    notifShowAllApps: 'Show all',
    notifHideAllApps: 'Hide',
    notifStatusActive: 'Active',
    notifStatusInactive: 'Not Active',
    notifAndroidOnly: 'Android',
    notifToggleLabel: 'Enable Auto-Record',
    notifToggleHint: 'Automatically save incoming/outgoing transactions when notifications arrive',
    notifAndroidOnlyHint:
      'Only available on the Android app via device Notification Access settings.',
    notifOpenSettingsBtn: 'Open Access',
    notifCheckStatusBtn: 'Check Status',
    notifCheckingBtn: 'Checking...',
    notifPermissionActiveFeedback:
      'Notification access is active. E-wallet & bank transactions will be recorded automatically.',
    notifPermissionInactiveFeedback:
      'Notification access is not active yet. Enable "Financial Tracker Auto-Record" in Android Settings.',
    notifOpenSettingsError: 'Failed to open device Notification Access settings.',
    checkUpdateTitle: 'App Updates',
    checkUpdateVersion: (version: string) => `Version v${version}`,
    checkUpdateBtn: 'Check for Updates',
    checkingUpdateBtn: 'Checking...',
    updateUpToDate: (version: string) =>
      `App is already up to date (v${version})`,
    updateAvailableFound: (version: string) => `Update v${version} is available!`,
    updateCheckUnavailable:
      'Checking for updates requires an internet connection. Please try again when online.',
  },
  lockScreen: {
    localSecurity: 'Local Security',
    createNewPin: 'Create New PIN',
    secureWallet: 'Secure Your Wallet',
    confirmNewPin: 'Confirm New PIN',
    setupSubtitle: 'Enter a 6-digit PIN to protect your local financial data.',
    confirmSubtitle: 'Re-enter the same 6-digit PIN to confirm.',
    unlockSubtitleBiometric: (label: string) => `Enter your 6-digit PIN or use ${label}.`,
    unlockSubtitlePin: 'Enter your 6-digit PIN to unlock your financial data.',
    pinProgressAria: (count: number, total: number) => `${count} of ${total} digits entered`,
    verifyingPin: 'Verifying PIN...',
    mismatchError: 'Confirmation PIN does not match. Please try again.',
    savePinError: 'Failed to save PIN configuration. Please try again.',
    wrongPinError: 'Incorrect PIN. Please try again.',
    verifyError: 'An error occurred while verifying your PIN.',
    biometricReason: 'Unlock Financial Tracker',
    enableBiometric: (label: string) => `Enable ${label}`,
    biometricAvailableHint: 'Quick unlock with biometric sensor',
    biometricAndroidHint: 'Automatically available on supported Android devices',
    unlockWithBiometric: (label: string) => `Unlock with ${label}`,
    waitingVerification: 'Waiting for verification...',
    repeat: 'Reset',
    deleteDigitAria: 'Delete digit',
    settingsTitle: 'PIN & Biometric Security',
    settingsSubtitle: 'On-device protection without cloud accounts',
    settingsCloseAria: 'Close security settings',
    pinActiveTitle: '6-Digit PIN Active',
    pinActiveDesc: 'Stored locally as a SHA-256 hash',
    statusActive: 'Active',
    biometricTitle: (label: string) => `Biometrics (${label})`,
    biometricEnabledDesc: 'Enabled for quick app unlock',
    biometricDisabledDesc: 'Disabled · use your 6-digit PIN to unlock',
    biometricUnavailableDesc:
      'Only available on Android devices with biometric hardware.',
    unavailableBadge: 'Unavailable',
    biometricDisabledSuccess:
      'Biometric lock disabled. Use your 6-digit PIN to unlock.',
    biometricEnabledSuccess: (label: string) => `${label} enabled for unlocking the app.`,
    confirmBiometricPrompt: (label: string) =>
      `Confirm ${label.toLowerCase()} to enable biometric lock`,
    changePinBtn: 'Change 6-Digit PIN',
    lockNowBtn: 'Lock App Now',
  },
  cashBook: {
    title: 'Local Cash Book (Rupiah)',
    subtitle: 'Local Offline SQLite · IDR Currency',
    closeAria: 'Close Local Cash Book modal',
    storageStatus: 'Local Offline SQLite · IDR Currency',
    summarySectionTitle: 'Cash Book Summary & Status',
    overallNetBalance: 'Overall Net Balance',
    totalTransactions: 'Total Transactions',
    txCount: (count: number) => `${count} ${count === 1 ? 'transaction' : 'transactions'}`,
    allTimeIncome: 'Total Income',
    allTimeExpense: 'Total Expenses',
    dateRangeLabel: 'Date Range',
    noTransactionsRange: 'No transactions recorded yet',
    adjustmentSectionTitle: 'Balance Adjustment / Initial Cash',
    adjustmentSectionSubtitle:
      'Match your app balance with the actual Rupiah cash you currently hold.',
    actualBalanceLabel: 'Actual Cash Balance Now (IDR)',
    actualBalancePlaceholder: 'e.g. 2.500.000',
    recordedBalanceLabel: 'Recorded Balance:',
    differenceLabel: 'Balance Difference:',
    adjustmentHint: 'Enter your actual cash balance to calculate the adjustment automatically.',
    balanceMatched: 'Your recorded balance already matches your actual cash balance.',
    willRecordIncome: (amount: string) =>
      `Will record an Income entry of ${amount}`,
    willRecordExpense: (amount: string) =>
      `Will record an Expense entry of ${amount}`,
    recordAdjustmentBtn: 'Record Balance Adjustment',
    adjustmentTxDescription: 'Cash Balance Adjustment',
    adjustmentNote: (recorded: string, actual: string, signedDiff: string) =>
      `Cash balance adjustment: recorded ${recorded} → actual ${actual} (diff ${signedDiff})`,
    adjustmentSuccess: (typeLabel: string, amount: string) =>
      `Balance adjustment (${typeLabel} ${amount}) recorded to cash book.`,
    exportSectionTitle: 'Export Cash Book Summary',
    exportSectionSubtitle:
      'Share all recorded transactions as CSV or copy this month’s cash flow summary.',
    exportCsvBtn: 'Export CSV',
    exportingCsvBtn: 'Preparing CSV...',
    copySummaryBtn: 'Copy Summary',
    copiedBtn: 'Copied!',
    csvShareTitle: 'Financial Tracker Cash Book Export',
    csvShareDialogTitle: 'Save or Share CSV Summary',
    csvHeaders: ['Date', 'Type', 'Category', 'Description', 'Amount IDR', 'Tags', 'Notes'],
    csvEmptyInfo: 'No transactions available to export to CSV yet.',
    csvExportSuccess: (fileName: string) => `CSV summary downloaded (${fileName}).`,
    csvExportSharedSuccess: (fileName: string) =>
      `CSV summary ready to save or share (${fileName}).`,
    csvExportCancelled: 'CSV export was cancelled.',
    csvExportError: 'Failed to export CSV summary. Please try again.',
    copySuccess: 'This month’s cash flow summary was copied to the clipboard.',
    copyError: 'Failed to copy summary to the clipboard.',
    summaryHeader: (monthLabel: string) => `Cash Book Summary · ${monthLabel}`,
    summaryMonthIncome: (amount: string) => `This Month Income: ${amount}`,
    summaryMonthExpense: (amount: string) => `This Month Expenses: ${amount}`,
    summaryMonthNet: (signedAmount: string) => `This Month Net Cash Flow: ${signedAmount}`,
    summaryMonthCount: (count: number) =>
      `This Month Entries: ${count} ${count === 1 ? 'transaction' : 'transactions'}`,
    summaryOverallBalance: (amount: string, totalCount: number) =>
      `Overall Cash Balance: ${amount} (Total ${totalCount} ${totalCount === 1 ? 'transaction' : 'transactions'})`,
  },
  updateModal: {
    title: 'Update Available',
    subtitle: 'A new Financial Tracker release is available on GitHub Releases',
    closeAria: 'Close update notification',
    versionLabel: 'New Version',
    releaseNotesTitle: 'Release Notes',
    noReleaseNotes:
      'Performance improvements, bug fixes, and user experience refinements.',
    updateNowBtn: 'Update Now',
    laterBtn: 'Later',
    publishedPrefix: (date: string) => `Released ${date}`,
  },
};

const translations: Record<Language, TranslationDictionary> = {
  id: idTranslations,
  en: enTranslations,
};

export interface LanguageContextValue {
  lang: Language;
  setLang: (next: Language) => void;
  toggleLang: () => void;
  t: TranslationDictionary;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'id',
  setLang: () => {},
  toggleLang: () => {},
  t: idTranslations,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => loadLanguagePreference());

  useEffect(() => {
    saveLanguagePreference(lang);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang: () => setLang((prev) => (prev === 'id' ? 'en' : 'id')),
      t: translations[lang],
    }),
    [lang]
  );

  return React.createElement(LanguageContext.Provider, { value }, children);
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

const SERVICE_ERROR_EN: Record<string, string> = {
  'File cadangan kosong.': 'Backup file is empty.',
  'File bukan JSON yang valid. Pastikan Anda memilih file cadangan .json yang benar.':
    'Invalid JSON file. Please select a valid .json backup file.',
  'File JSON bukan cadangan dari aplikasi Financial Tracker.':
    'This JSON file is not a Financial Tracker backup.',
  'Struktur data cadangan tidak dikenali.': 'Unrecognized backup data structure.',
  'Mata uang dasar (currency) di dalam cadangan tidak valid atau tidak didukung.':
    'The currency in the backup file is invalid or unsupported.',
  'Daftar kategori tidak valid atau kosong.': 'Category list is invalid or empty.',
  'Daftar transaksi tidak valid atau mengandung kolom yang rusak.':
    'Transaction list is invalid or contains corrupted fields.',
  'Daftar anggaran tidak valid atau mengandung kolom yang rusak.':
    'Budget list is invalid or contains corrupted fields.',
  'Daftar jadwal berulang tidak valid atau mengandung kolom yang rusak.':
    'Recurring schedules list is invalid or contains corrupted fields.',
  'Format snapshot cadangan tidak sesuai.': 'Invalid backup snapshot format.',
  'Autentikasi biometrik hanya tersedia di perangkat Android.':
    'Biometric authentication is only available on Android devices.',
  'Verifikasi biometrik gagal. Silakan gunakan PIN 6 digit.':
    'Biometric verification failed. Please use your 6-digit PIN.',
};

export function translateServiceMessage(message: string, lang: Language): string {
  if (lang === 'id') return message;
  return SERVICE_ERROR_EN[message] ?? message;
}
