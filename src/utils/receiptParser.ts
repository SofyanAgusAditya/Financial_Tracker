import { INITIAL_CATEGORIES } from '../data/mockData';
import { Category } from '../types';

export interface ParsedReceipt {
  amount?: number;
  description?: string;
  notes?: string;
  date?: string; // YYYY-MM-DD
  categoryId?: string;
  rawText: string;
}

const MIN_VALID_AMOUNT = 100;
const MAX_VALID_AMOUNT = 500_000_000;

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  ags: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
};

interface CategoryRule {
  defaultId: string;
  fallbackNameTerms: string[];
  pattern: RegExp;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    defaultId: 'cat-exp-1',
    fallbackNameTerms: ['food', 'dining', 'makanan', 'minuman'],
    pattern:
      /\b(gofood|grabfood|shopeefood|air\s*mineral\w*|es|teh|tea|lemon|kopi|coffee|jus|juice|susu|milk|latte|matcha|boba|gelato|ice\s*cream|makan\w*|minum\w*|resto\w*|restaurant|cafe|kafe|warung|warteg|rumah\s*makan|dine\s*in|take\s*away|takeaway|padang|nasi|mie|bakmi|soto|bakso|sate|ayam|bebek|seafood|sushi|ramen|bakery|roti|kue|cake|sogem|campur|goreng|bakar|kuliner|kantin|kedai|warkop|bistro|steak|starbucks|kopi\s*kenangan|janji\s*jiwa|fore\s*coffee|tuku|chatime|mixue|kfc|mcd|mcdonald'?s?|burger\s*king|pizza\s*hut|domino'?s?|hokben|solaria|richeese|marugame|yoshinoya|gacoan|breadtalk|mako|j\.?\s*co|dunkin)\b/i,
  },
  {
    defaultId: 'cat-exp-2',
    fallbackNameTerms: ['transport', 'transportasi'],
    pattern:
      /\b(spbu|pertamina|shell|bp\s*akr|vivo|pertamax|pertalite|solar|dexlite|bbm|bensin|gojek|goride|gocar|grab|uber|bluebird|blue\s*bird|maxim|indrive|taxi|taksi|kai|kereta|krl|mrt|lrt|transjakarta|garuda|lion\s*air|citilink|parkir|parking|tol|e-?toll|jasa\s*marga|bengkel|ahass|auto2000|ban|oli)\b/i,
  },
  {
    defaultId: 'cat-exp-3',
    fallbackNameTerms: ['shopping', 'retail', 'belanja', 'ritel'],
    pattern:
      /\b(minimarket|supermarket|hypermarket|indomaret|alfamart|alfamidi|lawson|familymart|family\s*mart|circle\s*k|superindo|super\s*indo|hypermart|transmart|lotte\s*mart|lottemart|hero|ranch\s*market|farmers\s*market|swalayan|gramedia|uniqlo|ikea|ace\s*hardware|mr\.?\s*diy|miniso|guardian|watsons|matahari|ramayana|aeon|toko|shop|store|mart|shopee|tokopedia|lazada|blibli)\b/i,
  },
  {
    defaultId: 'cat-exp-6',
    fallbackNameTerms: ['health', 'medical', 'kesehatan', 'medis'],
    pattern:
      /\b(apotek|apotik|kimia\s*farma|k-?24|century|klinik|clinic|rumah\s*sakit|rsud|hospital|siloam|prodia|laboratorium|dokter|dental|gigi|optik|farmasi|halodoc)\b/i,
  },
  {
    defaultId: 'cat-exp-5',
    fallbackNameTerms: ['bills', 'utilities', 'tagihan', 'utilitas'],
    pattern:
      /\b(pdam|pam\s*jaya|tagihan\s*air|pln|token\s*listrik|listrik|tagihan\s*listrik|indihome|biznet|first\s*media|myrepublic|wifi|internet|telkom|telkomsel|indosat|xl\s*axiata|pulsa|paket\s*data|bpjs|pbb|samsat|pgn|pajak\s*(?:kendaraan|bumi|motor|mobil))\b/i,
  },
  {
    defaultId: 'cat-exp-4',
    fallbackNameTerms: ['entertainment', 'fun', 'hiburan'],
    pattern:
      /\b(cinema|xxi|cgv|cinepolis|bioskop|netflix|spotify|youtube|disney|steam|timezone|karaoke|gym|fitness)\b/i,
  },
  {
    defaultId: 'cat-exp-7',
    fallbackNameTerms: ['education', 'course', 'pendidikan', 'kursus'],
    pattern:
      /\b(kursus|bimbel|ruangguru|udemy|coursera|universitas|sekolah|spp|seminar|workshop|atk|fotokopi)\b/i,
  },
  {
    defaultId: 'cat-exp-8',
    fallbackNameTerms: ['housing', 'rent', 'tempat\s*tinggal', 'sewa'],
    pattern: /\b(kos|kost|kontrakan|sewa|apartemen|ipl|mitra10|depo\s*bangunan|laundry)\b/i,
  },
];

const EXCLUDED_TOTAL_LINE_PATTERN =
  /\b(sub\s*total|subtotal|pajak|tax|ppn|pb1|diskon|discount|disc|hemat|potongan|total\s*(?:item|items|qty|barang|pcs|unit|poin|point))\b/i;

const METADATA_NON_AMOUNT_PATTERN =
  /\b(cashback|poin|point|barcode|no\.?\s*struk|nota|invoice|inv\b|ref\b|order\s*id|npwp|telp|tlp|phone|hp|wa|kartu|card|rek)\b/i;

function normalizeLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function stripNonMonetaryTokens(line: string): string {
  return line
    .replace(/\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g, ' ')
    .replace(/\b\d{1,4}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:[\/.-]\d+)?\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*%/g, ' ')
    .replace(/\b(?:\+?62|0\d{2,3})[\s-]?\d{3,4}[\s-]?\d{3,5}(?:[\s-]?\d{2,5})?\b/g, ' ')
    .replace(/\b(?:TELP|TLP|TEL|PHONE|FAX|HP|WA)\.?\s*[:#-]?\s*[\d\s()-]{6,}/gi, ' ');
}

function parseMonetaryToken(rawToken: string, minAmount = MIN_VALID_AMOUNT): number | null {
  let token = rawToken.trim().replace(/(?:,-|\.-)$/, '');
  if (!token) return null;

  if (/^\d{1,3}(?:[.,]\d{3})+[.,]\d{2}$/.test(token)) {
    token = token.slice(0, -3);
  } else if (/^\d{3,}[.,]\d{2}$/.test(token)) {
    token = token.slice(0, -3);
  }

  const digits = token.replace(/[.,\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;

  const value = Number(digits);
  if (!Number.isFinite(value) || value < minAmount || value > MAX_VALID_AMOUNT) {
    return null;
  }
  return Math.round(value);
}

function extractAmountsFromLine(
  line: string,
  allowPlainInteger: boolean,
  minAmount = MIN_VALID_AMOUNT
): number[] {
  const cleaned = stripNonMonetaryTokens(line);
  const results: number[] = [];

  const pattern = allowPlainInteger
    ? /(?:(?:RP|IDR)\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-)?|\d{1,9}(?:[.,]\d{2})?(?:,-)?)/gi
    : /(?:(?:RP|IDR)\.?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?(?:,-)?|\d{3,9}(?:[.,]\d{2})?(?:,-)?)|(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-)?))/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const token = match[1] ?? match[2];
    if (!token) continue;

    const after = cleaned.slice(pattern.lastIndex).trimStart();
    if (/^(?:PCS|PC|ITEM|ITEMS|QTY|UNIT|PACK|BKS|GR|KG|ML|LTR|LITER)\b/i.test(after)) {
      continue;
    }

    const parsed = parseMonetaryToken(token, minAmount);
    if (parsed !== null) {
      results.push(parsed);
    }
  }

  return results;
}

function isPaymentOrChangeBlacklisted(line: string): boolean {
  if (/\b(total\s*bayar|jumlah\s*bayar)\b/i.test(line)) {
    return false;
  }
  return /\b(bayar|tunai|cash|debit|kredit|credit|qris|transfer|kembali|kembalian|change)\b/i.test(
    line
  );
}

function isPureAmountLine(line: string): boolean {
  const stripped = line
    .replace(/\b(?:RP|IDR)\.?\b/gi, '')
    .replace(/[\d.,:\-\s]/g, '');
  return stripped.length === 0;
}

/**
 * Fallback: pasangkan baris label ringkasan (Sub Total, Pajak, TOTAL, Bayar, Kembali)
 * yang terpisah dari angkanya ke dalam satu baris "LABEL  ANGKA".
 * Diperlukan ketika ML Kit memecah kolom kiri dan kanan menjadi blok berbeda.
 */
function expandSplitColumnBlocks(lines: string[]): string[] {
  const SUMMARY_LABEL_PATTERN =
    /^\s*(sub\s*total|subtotal|pajak|tax|ppn|pb1|diskon|discount|disc|total\s*bayar|total\s*tagihan|total\s*belanja|grand\s*total|jumlah\s*bayar|total|bayar|tunai|cash|kembali|kembalian|change)\s*[:\-]?\s*$/i;

  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (SUMMARY_LABEL_PATTERN.test(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (isPureAmountLine(nextLine)) {
        // Merge: "TOTAL  67.400"
        result.push(`${line.trim()}  ${nextLine.trim()}`);
        i += 2;
        continue;
      }
    }
    result.push(line);
    i++;
  }
  return result;
}

function extractLineOrNextAmount(lines: string[], index: number): number | null {
  const currentAmounts = extractAmountsFromLine(lines[index], true);
  if (currentAmounts.length > 0) {
    return currentAmounts[currentAmounts.length - 1];
  }

  if (index + 1 < lines.length) {
    const nextLine = lines[index + 1];
    if (
      !isPaymentOrChangeBlacklisted(nextLine) &&
      !EXCLUDED_TOTAL_LINE_PATTERN.test(nextLine) &&
      !METADATA_NON_AMOUNT_PATTERN.test(nextLine)
    ) {
      const nextAmounts = extractAmountsFromLine(nextLine, true);
      if (nextAmounts.length > 0) {
        return nextAmounts[nextAmounts.length - 1];
      }
    }
  }

  return null;
}

function extractLabeledAmount(
  lines: string[],
  labelTest: (line: string) => boolean,
  minAmount = MIN_VALID_AMOUNT
): number | null {
  let matched: number | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!labelTest(line)) continue;

    const sameLine = extractAmountsFromLine(line, true, minAmount);
    if (sameLine.length > 0) {
      matched = sameLine[sameLine.length - 1];
      continue;
    }

    if (i + 1 < lines.length && isPureAmountLine(lines[i + 1])) {
      const nextLine = extractAmountsFromLine(lines[i + 1], true, minAmount);
      if (nextLine.length > 0) {
        matched = nextLine[nextLine.length - 1];
      }
    }
  }
  return matched;
}

function extractAmount(lines: string[]): number | undefined {
  const subTotalAmount = extractLabeledAmount(lines, (line) =>
    /\b(sub\s*total|subtotal)\b/i.test(line)
  );
  const paymentAmount = extractLabeledAmount(
    lines,
    (line) =>
      /\b(bayar|tunai|cash)\b/i.test(line) &&
      !/\b(total\s*bayar|jumlah\s*bayar|kembali|kembalian|change)\b/i.test(line)
  );
  const changeAmount = extractLabeledAmount(
    lines,
    (line) => /\b(kembali|kembalian|change)\b/i.test(line),
    0
  );

  const netFromPayment =
    paymentAmount !== null &&
    changeAmount !== null &&
    paymentAmount > changeAmount &&
    paymentAmount - changeAmount >= MIN_VALID_AMOUNT
      ? paymentAmount - changeAmount
      : null;

  const totalTiers: Array<(line: string) => boolean> = [
    (line) =>
      /\b(grand\s*total|total\s*bayar|total\s*belanja|total\s*tagihan|total\s*harga|jumlah\s*bayar|net\s*total|amount\s*due)\b/i.test(
        line
      ),
    (line) => /\b(total|tagihan)\b/i.test(line),
  ];

  let totalAmount: number | null = null;
  for (const tierTest of totalTiers) {
    let tierMatch: number | null = null;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (isPaymentOrChangeBlacklisted(line)) continue;
      if (EXCLUDED_TOTAL_LINE_PATTERN.test(line)) continue;
      if (!tierTest(line)) continue;

      const candidate = extractLineOrNextAmount(lines, i);
      if (candidate !== null) {
        tierMatch = candidate;
      }
    }
    if (tierMatch !== null) {
      totalAmount = tierMatch;
      break;
    }
  }

  if (totalAmount !== null) {
    if (
      subTotalAmount !== null &&
      totalAmount === subTotalAmount &&
      netFromPayment !== null &&
      netFromPayment !== totalAmount
    ) {
      return netFromPayment;
    }
    return totalAmount;
  }

  if (netFromPayment !== null) {
    return netFromPayment;
  }

  const fallbackCandidates: number[] = [];
  for (const line of lines) {
    if (isPaymentOrChangeBlacklisted(line)) continue;
    if (METADATA_NON_AMOUNT_PATTERN.test(line)) continue;
    if (EXCLUDED_TOTAL_LINE_PATTERN.test(line)) continue;
    const amounts = extractAmountsFromLine(line, false);
    fallbackCandidates.push(...amounts);
  }

  if (fallbackCandidates.length === 0) return undefined;
  return Math.max(...fallbackCandidates);
}

const KNOWN_SHORT_BRANDS = new Set([
  'kfc', 'mcd', 'jco', 'j.co', 'xxi', 'cgv', 'pln', 'bca', 'bni', 'bri', 'bsi',
  'uob', 'dbs', 'atm', 'tuku', 'fore', 'grab', 'gojek', 'ovo', 'dana',
]);

const NOISE_WORDS = new Set([
  'demo', 'lock', 'test', 'void', 'open', 'close', 'copy', 'print',
  'draft', 'sample', 'dummy', 'e2c', 'pos',
]);

function cleanMerchantText(line: string): string {
  return line
    .replace(/^[\s*=~#|•\-_.:]+|[\s*=~#|•\-_.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
}

function isShortAlphanumericCode(text: string): boolean {
  return /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9]{1,4}$/.test(text);
}

const QTY_MULTIPLIER_UNIT_PATTERN =
  '(?:\\s*(?:pcs|pc|item|items|unit|pack|bks|cup|gls|btl|kg|gr|gram|ltr|liter|l|ml|porsi|box|dus))?';

const QTY_PRICE_NUMBER_PATTERN = '\\d+(?:[.,]\\d+)*(?:,-|\\.-)?';

const QTY_PRICE_TRAILING_AMOUNTS_PATTERN =
  '(?:(?:\\s+(?:[=:]\\s*)?|\\s*[=:]\\s*)[-+]?\\(?(?:(?:Rp|IDR)\\.?\\s*)?\\d+(?:[.,]\\d+)*(?:,-|\\.-)?\\)?)*(?:\\s*[*#])?';

const PURE_QTY_PRICE_LINE_PATTERN = new RegExp(
  `^\\s*(?:(?:Rp|IDR)\\.?\\s*)?${QTY_PRICE_NUMBER_PATTERN}${QTY_MULTIPLIER_UNIT_PATTERN}\\s*(?:[xX×✕✖*∗]\\s*@?|@)\\s*(?:(?:Rp|IDR)\\.?\\s*)?${QTY_PRICE_NUMBER_PATTERN}${QTY_PRICE_TRAILING_AMOUNTS_PATTERN}\\s*$`,
  'i'
);

const PURE_SPACED_QTY_PRICE_LINE_PATTERN =
  /^\s*\d{1,3}(?:[.,]\d{1,2})?\s+(?:(?:Rp|IDR)\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-|\.-)?\s+(?:(?:Rp|IDR)\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-|\.-)?(?:\s*[*#])?\s*$/i;

const PRICE_LIKE_TOKEN_PATTERN =
  /(?:(?:Rp|IDR)\.?\s*\d|(?<!\d)\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?!\d)|(?<!\d)\d+[.,]\d{2}(?!\d)|(?<!\d)\d{3,}(?!\d))/i;

const INLINE_QTY_PRICE_SUFFIX_PATTERN = new RegExp(
  `\\s+\\d+(?:[.,]\\d+)?${QTY_MULTIPLIER_UNIT_PATTERN}\\s*(?:[xX×✕✖*∗]\\s*@?|@)\\s*(?:(?:Rp|IDR)\\.?\\s*\\d+(?:[.,]\\d+)*|(?:\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{2})?|\\d+[.,]\\d{2}|\\d{3,}))(?:,-|\\.-)?${QTY_PRICE_TRAILING_AMOUNTS_PATTERN}\\s*$`,
  'i'
);

const INLINE_SPACED_QTY_PRICE_SUFFIX_PATTERN =
  /\s+\d{1,3}(?:[.,]\d{1,2})?\s+(?:(?:Rp|IDR)\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-|\.-)?\s+(?:(?:Rp|IDR)\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-|\.-)?(?:\s*[*#])?\s*$/i;

function isPureQtyPriceLine(line: string): boolean {
  if (PURE_SPACED_QTY_PRICE_LINE_PATTERN.test(line)) {
    return true;
  }
  if (!PURE_QTY_PRICE_LINE_PATTERN.test(line)) {
    return false;
  }
  // Hindari dimensi pendek seperti "4×6" atau "20x20" kecuali ada format harga, @, atau angka total baris (mis. "1×0 0")
  if (PRICE_LIKE_TOKEN_PATTERN.test(line) || line.includes('@')) {
    return true;
  }
  const numberTokens = line.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return numberTokens.length >= 3;
}

function hasQtyPriceExpression(line: string): boolean {
  return (
    isPureQtyPriceLine(line) ||
    INLINE_QTY_PRICE_SUFFIX_PATTERN.test(line) ||
    INLINE_SPACED_QTY_PRICE_SUFFIX_PATTERN.test(line)
  );
}

function isFollowedByQtyPriceLine(lines: string[], index: number): boolean {
  if (index + 1 < lines.length && isPureQtyPriceLine(lines[index + 1])) {
    return true;
  }
  if (
    index + 2 < lines.length &&
    isPureAmountLine(lines[index + 1]) &&
    isPureQtyPriceLine(lines[index + 2])
  ) {
    return true;
  }
  return false;
}

function cleanItemNameCandidate(rawName: string): string {
  // Hapus suffix harga di akhir nama jika OCR menggabungkan kolom nama + subtotal baris
  const withoutTrailingPrice = rawName
    .replace(/\s+(?:Rp|IDR)\.?\s*\d+(?:[.,]\d+)*(?:,-|\.-)?\s*$/i, '')
    .replace(/\s+\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?(?:,-|\.-)?\s*$/, '');
  return cleanMerchantText(withoutTrailingPrice);
}

function isNonItemNameLine(line: string): boolean {
  if (isPureAmountLine(line) || hasQtyPriceExpression(line)) {
    return true;
  }

  const core = cleanMerchantText(line);
  const letterCount = (core.match(/[a-zA-Z]/g) ?? []).length;
  if (core.length < 2 || letterCount < 2) return true;

  if (isShortAlphanumericCode(core)) return true;
  if (NOISE_WORDS.has(core.toLowerCase())) return true;
  if (/^[-=*_~.#+|\\/\s]+$/.test(line)) return true;

  // Baris kuantitas/unit saja tanpa nama produk (mis. "2 pcs", "1x", "3 item")
  if (
    /^\s*\d+(?:[.,]\d+)?\s*(?:[xX×✕✖*∗]|pcs|pc|item|items|unit|pack|bks|cup|gls|btl|kg|gr|gram|ltr|liter|l|ml|porsi|box|dus)\s*$/i.test(
      core
    )
  ) {
    return true;
  }

  // Baris header kolom tabel item (mis. "Item Qty Harga", "Menu Harga")
  if (
    /^(?:no\.?\s+)?(?:nama\s*)?(?:item|items|menu|barang|produk|deskripsi|description)(?:\s+(?:qty|jml|jumlah|harga|price|subtotal|total|satuan))*$/i.test(
      core
    ) ||
    /^(?:qty|jml|jumlah|harga|price|satuan|uom)(?:\s*[:=-].*)?$/i.test(core)
  ) {
    return true;
  }

  // Baris ucapan / header struk
  if (
    /\b(selamat\s*datang|welcome|struk\s*pembayaran|struk\s*belanja|bukti\s*pembayaran|bukti\s*transaksi|official\s*receipt|receipt|customer\s*copy|merchant\s*copy|lunas|paid|terima\s*kasih|thank\s*you)\b/i.test(
      line
    )
  ) {
    return true;
  }

  // Baris alamat / kontak / URL
  if (
    /\b(jl\.?|jalan|gg\.?|gang|alamat|ruko|komp\.?|komplek|blok|kav\.?|rt\.?\s*\d|rw\.?\s*\d|kec\.?|kecamatan|kel\.?|kelurahan|kab\.?|kabupaten|kota|lantai|lt\.?\s*\d|kode\s*pos)\b/i.test(
      line
    ) ||
    /\b(npwp|pkp|telp|tlp|tel\.?|phone|fax|hp|wa|whatsapp|call\s*center|instagram|tiktok)\b/i.test(
      line
    ) ||
    /\b(?:\+?62|0\d{2,3})[\s-]?\d{3,4}[\s-]?\d{3,5}\b/.test(line) ||
    /(?:https?:\/\/|www\.|\.(?:com|co\.id|id|net|org)\b|@)/i.test(line)
  ) {
    return true;
  }

  // Baris tanggal / jam
  if (
    /\d{1,4}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(line) ||
    /\b\d{1,2}:\d{2}\b/.test(line) ||
    /\b(?:tgl|tanggal|date|waktu|time)\s*[:=-]/i.test(line) ||
    /^(?:tgl|tanggal|date|waktu|time)\b/i.test(core)
  ) {
    return true;
  }

  // Baris metadata transaksi & ringkasan pembayaran (bukan nama item menu)
  if (
    /\b(no\.?\s*(?:struk|nota|trx|transaksi|bon|faktur|order|inv|ref)|nota|inv|invoice|ref|order\s*id|tipe|type|dine\s*in|take\s*away|takeaway|delivery|drive\s*thru|pelanggan|customer|member|guest|tamu|kasir|cashier|operator|staff|waiter|server|shift|meja|table|antrian|bayar|tunai|cash|debit|kredit|credit|qris|transfer|kembali|kembalian|change|sub\s*total|subtotal|total|grand\s*total|pajak|tax|ppn|pb1|diskon|discount|disc|potongan|anda\s*hemat|pembulatan|rounding|service\s*charge|biaya\s*(?:layanan|service|admin))\b/i.test(
      line
    ) ||
    /^hemat\b/i.test(core)
  ) {
    return true;
  }

  return false;
}

function isNonMerchantLine(line: string): boolean {
  const core = cleanMerchantText(line);
  const letterCount = (core.match(/[a-zA-Z]/g) ?? []).length;
  if (core.length <= 2 || letterCount < 2) return true;

  if (isShortAlphanumericCode(core)) return true;

  // Filter kata noise/header palsu yang pendek dan tidak dikenal
  const coreUpper = core.toLowerCase();
  // Reject noise words
  if (NOISE_WORDS.has(coreUpper)) return true;
  // Reject unknown short words (<=4 chars) that aren't known brands
  if (core.length <= 4 && !KNOWN_SHORT_BRANDS.has(coreUpper)) return true;

  if (/^[-=*_~.#+|\\/\s]+$/.test(line)) return true;

  if (
    /\b(selamat\s*datang|welcome|struk\s*pembayaran|struk\s*belanja|bukti\s*pembayaran|bukti\s*transaksi|official\s*receipt|receipt|customer\s*copy|merchant\s*copy|lunas|paid|terima\s*kasih|thank\s*you)\b/i.test(
      line
    )
  ) {
    return true;
  }

  if (
    /\b(jl\.?|jalan|gg\.?|gang|alamat|ruko|komp\.?|komplek|blok|kav\.?|rt\.?\s*\d|rw\.?\s*\d|kec\.?|kecamatan|kel\.?|kelurahan|kab\.?|kabupaten|kota|lantai|lt\.?\s*\d|kode\s*pos)\b/i.test(
      line
    ) ||
    /(?<![.,])\b\d{5}\b/.test(line)
  ) {
    return true;
  }

  if (
    /\b\d+(?:[.,]\d+)?\s*(?:ltr|liter|pcs|pc|kg|gr|gram|ml|unit|item|bks|pack)\b/i.test(line)
  ) {
    return true;
  }

  if (
    /\b(npwp|pkp|telp|tlp|tel\.?|phone|fax|hp|wa|whatsapp|call\s*center|instagram|tiktok)\b/i.test(
      line
    ) ||
    /\b(?:\+?62|0\d{2,3})[\s-]?\d{3,4}[\s-]?\d{3,5}\b/.test(line) ||
    /(?:https?:\/\/|www\.|\.(?:com|co\.id|id|net|org)\b|@)/i.test(line)
  ) {
    return true;
  }

  if (
    /\d{1,4}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(line) ||
    /\b\d{1,2}:\d{2}\b/.test(line) ||
    /\b(tgl|tanggal|date|waktu|time)\b/i.test(line)
  ) {
    return true;
  }

  if (
    /\b(no\.?\s*(?:struk|nota|trx|transaksi|bon|faktur|order|inv|ref)?|nota|inv|invoice|ref|order\s*id|tipe|type|dine\s*in|take\s*away|takeaway|delivery|drive\s*thru|pelanggan|customer|member|guest|tamu|kasir|cashier|operator|staff|waiter|server|shift|meja|table|antrian|bayar|tunai|cash|debit|kredit|credit|qris|transfer|kembali|kembalian|change|sub\s*total|subtotal|total|grand\s*total|pajak|tax|ppn|pb1|diskon|discount|disc|harga|qty|rp\.?|idr)\b/i.test(
      line
    )
  ) {
    return true;
  }

  // Pola qty item belanja: "1×8.000 8.000", "1 x 8.000", "NAMA ITEM 1×8.000 8.000" → bukan merchant
  if (hasQtyPriceExpression(line)) return true;

  return false;
}

function extractDescription(lines: string[]): string | undefined {
  const topCount = Math.min(lines.length, 7);
  const candidates: Array<{ index: number; text: string }> = [];

  for (let i = 0; i < topCount; i += 1) {
    const line = lines[i];
    if (hasQtyPriceExpression(line)) break;
    if (isNonMerchantLine(line) || isFollowedByQtyPriceLine(lines, i)) continue;
    const cleaned = cleanMerchantText(line);
    if (cleaned.length >= 3) {
      candidates.push({ index: i, text: cleaned });
    }
  }

  if (candidates.length === 0) return undefined;

  const first = candidates[0];
  const second = candidates[1];
  if (
    /^(?:PT|CV)\.?\s+/i.test(first.text) &&
    second &&
    second.index - first.index <= 2
  ) {
    return second.text;
  }

  return first.text;
}

/**
 * Fallback ketika nama merchant tidak ada di struk:
 * rangkum nama item belanja yang ditemukan.
 * Pola item: "NAMA ITEM  1 x 8.000  8.000" atau "NAMA ITEM" diikuti baris qty.
 */
function extractItemSummaryFallback(lines: string[]): string | undefined {
  const itemNames: string[] = [];
  const usedLineIndices = new Set<number>();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Kasus 1: Baris murni kuantitas/harga (struktur item 2 baris, mis. "1×8.000   8.000")
    // Ambil nama item dari baris sebelumnya (atau lewati 1 baris angka murni jika hasil OCR miring).
    if (isPureQtyPriceLine(line)) {
      let candidateIndex = i - 1;
      if (
        candidateIndex >= 0 &&
        !usedLineIndices.has(candidateIndex) &&
        isPureAmountLine(lines[candidateIndex]) &&
        !isPureQtyPriceLine(lines[candidateIndex])
      ) {
        candidateIndex -= 1;
      }

      if (candidateIndex >= 0 && !usedLineIndices.has(candidateIndex)) {
        const candidateLine = lines[candidateIndex];
        if (!hasQtyPriceExpression(candidateLine) && !isNonItemNameLine(candidateLine)) {
          const cleaned = cleanItemNameCandidate(candidateLine);
          if (cleaned.length >= 2 && !isNonItemNameLine(cleaned)) {
            itemNames.push(cleaned);
            usedLineIndices.add(candidateIndex);
          }
        }
      }
      continue;
    }

    // Kasus 2: Baris item 1 baris (nama + qty/harga dalam baris yang sama)
    let namePart: string | null = null;
    if (INLINE_QTY_PRICE_SUFFIX_PATTERN.test(line)) {
      namePart = line.replace(INLINE_QTY_PRICE_SUFFIX_PATTERN, '').trim();
    } else if (INLINE_SPACED_QTY_PRICE_SUFFIX_PATTERN.test(line)) {
      namePart = line.replace(INLINE_SPACED_QTY_PRICE_SUFFIX_PATTERN, '').trim();
    }

    if (namePart && !hasQtyPriceExpression(namePart) && !isNonItemNameLine(namePart)) {
      const cleaned = cleanItemNameCandidate(namePart);
      if (cleaned.length >= 2 && !isNonItemNameLine(cleaned)) {
        itemNames.push(cleaned);
        usedLineIndices.add(i);
      }
    }
  }

  if (itemNames.length === 0) return undefined;

  const MAX_SHOWN = 3;
  if (itemNames.length <= MAX_SHOWN) {
    return itemNames.join(', ');
  }
  const shown = itemNames.slice(0, MAX_SHOWN - 1);
  const remaining = itemNames.length - (MAX_SHOWN - 1);
  return `${shown.join(', ')} (+${remaining} lainnya)`;
}

function isValidReceiptNumber(candidate: string): boolean {
  if (candidate.length < 3 || candidate.length > 32) return false;
  if (!/\d/.test(candidate)) return false;
  if (/^\d{1,4}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(candidate)) return false;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(candidate)) return false;
  return true;
}

function extractReceiptNotes(lines: string[]): string | undefined {
  const skipLinePattern =
    /\b(jl\.?|jalan|gg\.?|gang|alamat|rt\.?\s*\d|rw\.?\s*\d|blok|kav\.?|npwp|pkp|nik|telp|tlp|tel\.?|phone|fax|hp|wa|whatsapp|call\s*center)\b/i;

  const explicitLabelOnlyPattern =
    /\b(?:no\.?\s*(?:struk|nota|transaksi|trx|bon|faktur|kwitansi|order|inv|invoice|ref|referensi)|trx\s*id|order\s*id|receipt\s*no\.?|bill\s*no\.?|invoice\s*(?:no\.?|id)?|inv\.?|referensi|reference|ref\.?|nota)\s*[:#=\-]?\s*$/i;

  const explicitPattern =
    /\b(?:no\.?\s*(?:struk|nota|transaksi|trx|bon|faktur|kwitansi|order|inv|invoice|ref|referensi)|trx\s*id|order\s*id|receipt\s*no\.?|bill\s*no\.?|invoice\s*(?:no\.?|id)?|inv\.?|referensi|reference|ref\.?|nota)\s*[:#=\-\s]\s*([A-Za-z0-9][A-Za-z0-9\/_-]{1,31})/i;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (skipLinePattern.test(line)) continue;

    const match = explicitPattern.exec(line);
    if (match?.[1]) {
      const cleaned = match[1].replace(/[.,:;-]+$/, '');
      if (isValidReceiptNumber(cleaned)) {
        return `No. Struk: ${cleaned}`;
      }
    }

    if (explicitLabelOnlyPattern.test(line) && i + 1 < lines.length && !skipLinePattern.test(lines[i + 1])) {
      const nextToken = /^([A-Za-z0-9][A-Za-z0-9\/_-]{2,31})/.exec(lines[i + 1]);
      if (nextToken?.[1]) {
        const cleaned = nextToken[1].replace(/[.,:;-]+$/, '');
        if (isValidReceiptNumber(cleaned)) {
          return `No. Struk: ${cleaned}`;
        }
      }
    }
  }

  const genericNoPattern =
    /\bno\.?(?:\s*[:#=\-]\s*|\s+)([A-Za-z0-9][A-Za-z0-9\/_-]{1,31})/i;
  const genericExcludedPattern =
    /\bno\.?\s*(?:telp|tlp|tel|hp|wa|npwp|meja|antrian|pol|plat|kartu|rek|rekening|urut)\b/i;

  for (const line of lines) {
    if (skipLinePattern.test(line) || genericExcludedPattern.test(line)) continue;
    const match = genericNoPattern.exec(line);
    if (!match?.[1]) continue;

    const cleaned = match[1].replace(/[.,:;-]+$/, '');
    if (isValidReceiptNumber(cleaned)) {
      return `No. Struk: ${cleaned}`;
    }
  }

  return undefined;
}

function formatValidatedDate(year: number, month: number, day: number): string | null {
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  const maxDay = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDay) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractFourDigitDateFromLine(line: string): string | null {
  const dmy4 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/.exec(line);
  if (dmy4) {
    const formatted = formatValidatedDate(Number(dmy4[3]), Number(dmy4[2]), Number(dmy4[1]));
    if (formatted) return formatted;
  }

  const ymd = /\b(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})\b/.exec(line);
  if (ymd) {
    const formatted = formatValidatedDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
    if (formatted) return formatted;
  }

  const namedMonth = /\b(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})\b/.exec(line);
  if (namedMonth) {
    const month = MONTH_NAME_MAP[namedMonth[2].toLowerCase()];
    if (month) {
      const formatted = formatValidatedDate(
        Number(namedMonth[3]),
        month,
        Number(namedMonth[1])
      );
      if (formatted) return formatted;
    }
  }

  return null;
}

function extractDate(lines: string[]): string | undefined {
  const dateLabelPattern = /\b(tgl|tanggal|date|waktu)\b/i;

  // Pass 1a: 4-digit year dates on explicit date-labeled lines
  for (const line of lines) {
    if (!dateLabelPattern.test(line)) continue;
    const found = extractFourDigitDateFromLine(line);
    if (found) return found;
  }

  // Pass 1b: 4-digit year dates anywhere
  for (const line of lines) {
    const found = extractFourDigitDateFromLine(line);
    if (found) return found;
  }

  // Pass 2: 2-digit year dates (avoid matching receipt serial numbers like 18/11/26/00001)
  for (const line of lines) {
    const dmy2 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})\b(?![\/.-]\d)/.exec(line);
    if (dmy2) {
      const formatted = formatValidatedDate(
        2000 + Number(dmy2[3]),
        Number(dmy2[2]),
        Number(dmy2[1])
      );
      if (formatted) return formatted;
    }

    const namedMonthShort = /\b(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{2})\b/.exec(line);
    if (namedMonthShort) {
      const month = MONTH_NAME_MAP[namedMonthShort[2].toLowerCase()];
      if (month) {
        const formatted = formatValidatedDate(
          2000 + Number(namedMonthShort[3]),
          month,
          Number(namedMonthShort[1])
        );
        if (formatted) return formatted;
      }
    }
  }

  return undefined;
}

function resolveExpenseCategoryId(
  rule: CategoryRule,
  expenseCategories: Category[]
): string | undefined {
  const byId = expenseCategories.find((c) => c.id === rule.defaultId);
  if (byId) return byId.id;

  const byName = expenseCategories.find((c) => {
    const lower = c.name.toLowerCase();
    return rule.fallbackNameTerms.some((term) => lower.includes(term));
  });
  return byName?.id;
}

function matchCategoryId(
  description: string | undefined,
  rawText: string,
  categories: Category[]
): string | undefined {
  if (categories.length === 0) return undefined;
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  if (expenseCategories.length === 0) return undefined;

  if (description) {
    for (const rule of CATEGORY_RULES) {
      if (rule.pattern.test(description)) {
        const resolved = resolveExpenseCategoryId(rule, expenseCategories);
        if (resolved) return resolved;
      }
    }
  }

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(rawText)) {
      const resolved = resolveExpenseCategoryId(rule, expenseCategories);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

/**
 * Parses raw offline OCR text from a shopping/payment receipt and extracts
 * amount, merchant description, receipt reference notes, date, and categoryId.
 */
export function parseReceiptText(
  rawText: string,
  categories: Category[] = INITIAL_CATEGORIES
): ParsedReceipt {
  const lines = normalizeLines(rawText);
  if (lines.length === 0) {
    return { rawText };
  }

  const expandedLines = expandSplitColumnBlocks(lines);

  const amount = extractAmount(expandedLines);
  const description = extractDescription(expandedLines);
  const notes = extractReceiptNotes(expandedLines);
  const date = extractDate(expandedLines);
  const categoryList = categories.length > 0 ? categories : INITIAL_CATEGORIES;
  const finalDescription = description ?? extractItemSummaryFallback(expandedLines);
  const categoryId = matchCategoryId(finalDescription, rawText, categoryList);

  return {
    amount,
    description: finalDescription,
    notes,
    date,
    categoryId,
    rawText,
  };
}
