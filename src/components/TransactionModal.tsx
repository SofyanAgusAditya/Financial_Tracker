import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';
import { 
  Transaction, 
  Category, 
  CurrencyCode, 
  TransactionType 
} from '../types';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Camera as CameraIcon,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from 'lucide-react';
import { toDateInputValue, toDateOnlyString } from '../utils/finance';
import { formatThousandInput, parseThousandInput } from '../utils/formatters';
import { translateCategoryName, useLanguage } from '../utils/i18n';
import { parseReceiptText } from '../utils/receiptParser';

interface ScanNotice {
  tone: 'success' | 'info' | 'error';
  message: string;
}

interface OcrLine {
  text?: string;
  frame?: { x?: number; y?: number; width?: number; height?: number } | null;
  cornerPoints?: Array<{ x?: number; y?: number }> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface OcrBlock {
  text?: string;
  lines?: OcrLine[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function getLineYCenter(line: OcrLine): number | null {
  // Try frame
  if (line.frame && line.frame.y != null && line.frame.height != null) {
    return line.frame.y + line.frame.height / 2;
  }
  // Try cornerPoints (top-left, top-right, bottom-right, bottom-left)
  if (line.cornerPoints && line.cornerPoints.length >= 4) {
    const ys = line.cornerPoints.map((p) => p.y ?? 0);
    return (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  return null;
}

function getLineXStart(line: OcrLine): number {
  if (line.frame && line.frame.x != null) {
    return line.frame.x;
  }
  if (line.cornerPoints && line.cornerPoints.length >= 1) {
    const xs = line.cornerPoints.map((p) => p.x ?? 0);
    return Math.min(...xs);
  }
  return 0;
}

function extractSpatiallyOrderedText(ocrResult: { text?: string; blocks?: OcrBlock[] }): string {
  const blocks = ocrResult.blocks ?? [];

  // Collect all lines with their spatial info
  const allLines: Array<{ text: string; yCtr: number | null; xStart: number }> = [];
  for (const block of blocks) {
    const lines = block.lines ?? [];
    for (const line of lines) {
      const text = (line.text ?? '').trim();
      if (!text) continue;
      allLines.push({
        text,
        yCtr: getLineYCenter(line),
        xStart: getLineXStart(line),
      });
    }
  }

  // Check if we have usable spatial coordinates
  const hasCoords = allLines.some((l) => l.yCtr !== null);

  if (!hasCoords) {
    // Fallback: use ocrResult.text or join blocks
    return (
      ocrResult.text?.trim() ||
      blocks.map((b) => b.text ?? '').join('\n').trim()
    );
  }

  // Group lines by Y-center proximity (tolerance = 20px)
  const Y_TOLERANCE = 20;
  const rows: Array<Array<{ text: string; xStart: number }>> = [];

  for (const line of allLines) {
    const yCtr = line.yCtr ?? 0;
    // Find an existing row close enough in Y
    let placed = false;
    for (const row of rows) {
      // Use the average Y of items already in this row
      const rowYAvg =
        row.reduce((sum, item) => {
          const matchLine = allLines.find((l) => l.text === item.text && l.xStart === item.xStart);
          return sum + (matchLine?.yCtr ?? 0);
        }, 0) / row.length;
      if (Math.abs(yCtr - rowYAvg) <= Y_TOLERANCE) {
        row.push({ text: line.text, xStart: line.xStart });
        placed = true;
        break;
      }
    }
    if (!placed) {
      rows.push([{ text: line.text, xStart: line.xStart }]);
    }
  }

  // Sort rows by their average Y (top to bottom)
  const rowsWithY = rows.map((row) => {
    const avgY =
      row.reduce((sum, item) => {
        const matchLine = allLines.find((l) => l.text === item.text && l.xStart === item.xStart);
        return sum + (matchLine?.yCtr ?? 0);
      }, 0) / row.length;
    return { row, avgY };
  });
  rowsWithY.sort((a, b) => a.avgY - b.avgY);

  // Within each row, sort segments left to right
  const textLines = rowsWithY.map(({ row }) => {
    const sorted = [...row].sort((a, b) => a.xStart - b.xStart);
    return sorted.map((s) => s.text).join('  ');
  });

  return textLines.join('\n').trim();
}

function getScanErrorInfo(error: unknown): { message: string; code: string } {
  if (typeof error === 'string') {
    return { message: error, code: '' };
  }
  if (error instanceof Error) {
    const codeValue = (error as { code?: unknown }).code;
    return {
      message: error.message,
      code: typeof codeValue === 'string' ? codeValue : '',
    };
  }
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === 'string'
        ? record.message
        : typeof record.errorMessage === 'string'
          ? record.errorMessage
          : '';
    const code = typeof record.code === 'string' ? record.code : '';
    return { message, code };
  }
  return { message: '', code: '' };
}

function isCameraCancelledError(error: unknown): boolean {
  const { message, code } = getScanErrorInfo(error);
  return (
    code === 'OS-PLUG-CAMR-0006' ||
    code === 'OS-PLUG-CAMR-0020' ||
    code === 'OS-PLUG-CAMR-0013' ||
    /cancel|dismiss|abort/i.test(message)
  );
}

function isCameraPermissionDeniedError(error: unknown): boolean {
  const { message, code } = getScanErrorInfo(error);
  return (
    code === 'OS-PLUG-CAMR-0003' ||
    code === 'OS-PLUG-CAMR-0005' ||
    /permission|denied/i.test(message)
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image blob'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (tx: Omit<Transaction, 'id' | 'idempotencyKey' | 'syncStatus' | 'createdAt'> & { id?: string }) => void;
  editingTransaction?: Transaction | null;
  initialType?: TransactionType;
  categories: Category[];
  currency: CurrencyCode;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingTransaction,
  initialType = 'EXPENSE',
  categories,
  currency,
}) => {
  const { lang, t } = useLanguage();
  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amountInput, setAmountInput] = useState<string>(formatThousandInput('50000'));
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [transactionDate, setTransactionDate] = useState(toDateOnlyString(new Date()));
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isMounted, setIsMounted] = useState<boolean>(isOpen);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      const frame = window.requestAnimationFrame(() => setIsVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }

    setIsVisible(false);
    const timer = window.setTimeout(() => setIsMounted(false), 300);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isMounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMounted]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const categoryForType = (nextType: TransactionType) =>
    categories.find((c) => c.type === nextType)?.id || '';

  useEffect(() => {
    if (!isOpen) return;
    setIsScanning(false);
    setScanNotice(null);
    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountInput(formatThousandInput(String(Math.round(editingTransaction.amount))));
      setDescription(editingTransaction.description);
      setCategoryId(editingTransaction.categoryId || '');
      setTransactionDate(toDateInputValue(editingTransaction.transactionDate));
      setNotes(editingTransaction.notes || '');
      setTagsInput(editingTransaction.tags.join(', '));
    } else {
      setType(initialType);
      setAmountInput(formatThousandInput('50000'));
      setDescription('');
      setCategoryId(categoryForType(initialType));
      setTransactionDate(toDateOnlyString(new Date()));
      setNotes('');
      setTagsInput('');
    }
  }, [editingTransaction, isOpen, categories, initialType]);

  if (!isMounted) return null;

  const handleScanReceipt = async () => {
    if (isScanning) return;

    if (!Capacitor.isNativePlatform()) {
      setScanNotice({
        tone: 'info',
        message: t.txModal.scanNativeOnly,
      });
      return;
    }

    setIsScanning(true);
    setScanNotice(null);
    let tempCacheFileName: string | null = null;

    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
        promptLabelHeader: t.txModal.scanPromptTitle,
        promptLabelPhoto: t.txModal.scanFromGallery,
        promptLabelPicture: t.txModal.scanTakePhoto,
        promptLabelCancel: t.common.cancel,
      });

      let imagePath = photo.path;
      if (!imagePath && photo.webPath) {
        const response = await fetch(photo.webPath);
        const blob = await response.blob();
        const base64Data = await blobToBase64(blob);
        tempCacheFileName = `receipt-ocr-${Date.now()}.jpg`;
        const saved = await Filesystem.writeFile({
          path: tempCacheFileName,
          data: base64Data,
          directory: Directory.Cache,
        });
        imagePath = saved.uri;
      }

      if (!imagePath) {
        setScanNotice({
          tone: 'error',
          message: t.txModal.scanError,
        });
        return;
      }

      const ocrResult = await TextRecognition.processImage({
        path: imagePath,
        script: Script.Latin,
      });

      const rawText = extractSpatiallyOrderedText(ocrResult);

      if (!rawText) {
        setScanNotice({
          tone: 'info',
          message: t.txModal.scanNoText,
        });
        return;
      }

      const parsed = parseReceiptText(rawText, categories);

      if (parsed.amount !== undefined && parsed.amount > 0) {
        setAmountInput(formatThousandInput(String(Math.round(parsed.amount))));
      }
      if (parsed.description) {
        setDescription(parsed.description);
      }
      if (parsed.date) {
        setTransactionDate(parsed.date);
      }
      if (parsed.notes) {
        setNotes(parsed.notes);
      }
      if (parsed.categoryId) {
        const matchedCategory = categories.find((cat) => cat.id === parsed.categoryId);
        if (matchedCategory) {
          setType(matchedCategory.type);
          setCategoryId(matchedCategory.id);
        }
      }

      const hasUsefulData = parsed.amount !== undefined || Boolean(parsed.description);
      setScanNotice({
        tone: hasUsefulData ? 'success' : 'info',
        message: hasUsefulData ? t.txModal.scanSuccessReview : t.txModal.scanPartialReview,
      });
    } catch (error) {
      if (isCameraCancelledError(error)) {
        return;
      }
      if (isCameraPermissionDeniedError(error)) {
        setScanNotice({
          tone: 'error',
          message: t.txModal.scanPermissionDenied,
        });
        return;
      }
      setScanNotice({
        tone: 'error',
        message: t.txModal.scanError,
      });
    } finally {
      if (tempCacheFileName) {
        void Filesystem.deleteFile({
          path: tempCacheFileName,
          directory: Directory.Cache,
        }).catch(() => {});
      }
      setIsScanning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseThousandInput(amountInput);
    if (!description.trim() || parsedAmount <= 0) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);

    onSave({
      id: editingTransaction ? editingTransaction.id : undefined,
      type,
      amount: parsedAmount,
      currency,
      description,
      categoryId,
      transactionDate: new Date(`${transactionDate}T12:00:00`).toISOString(),
      notes,
      tags,
    });
    onClose();
  };

  const availableCategories = categories.filter((c) => c.type === type);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:pb-6">
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`absolute inset-0 bg-[#121118]/60 backdrop-blur-xs transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <form 
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label={editingTransaction ? t.txModal.editTitle : t.txModal.newTitle}
        className={`relative w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#181720] rounded-t-[28px] sm:rounded-3xl border border-[#EAE5DC] dark:border-[#262432] shadow-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 rounded-full bg-[#DED6CA] dark:bg-[#3A3450] sm:hidden" />
        <div className="flex items-center justify-between pb-3 border-b border-[#F1ECE3] dark:border-[#252230]">
          <h3 className="text-base font-extrabold text-[#16151D] dark:text-white">
            {editingTransaction ? t.txModal.editTitle : t.txModal.newTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl text-[#706B82] hover:text-[#16151D] dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transaction Type Segmented Switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-[#F1ECE3] dark:bg-[#1E1D27] rounded-xl border border-[#DDD7CD] dark:border-[#2D2A3B]">
          <button
            type="button"
            onClick={() => {
              setType('EXPENSE');
              const c = categories.find((cat) => cat.type === 'EXPENSE');
              if (c) setCategoryId(c.id);
            }}
            className={`min-h-[44px] py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              type === 'EXPENSE'
                ? 'bg-white dark:bg-[#282536] text-rose-600 dark:text-rose-400 shadow-xs'
                : 'text-[#686377] dark:text-[#9D98AC] hover:text-[#16151D]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>{t.common.expense}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setType('INCOME');
              const c = categories.find((cat) => cat.type === 'INCOME');
              if (c) setCategoryId(c.id);
            }}
            className={`min-h-[44px] py-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              type === 'INCOME'
                ? 'bg-white dark:bg-[#282536] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-[#686377] dark:text-[#9D98AC] hover:text-[#16151D]'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>{t.common.income}</span>
          </button>

        </div>

        {/* Receipt OCR Scan Button & Review Banner */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={isScanning}
            onClick={() => void handleScanReceipt()}
            className="w-full min-h-[44px] px-3.5 py-2.5 text-xs font-bold text-[#704BEA] dark:text-[#B8B2FF] bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#704BEA]/30 dark:border-[#B8B2FF]/30 hover:bg-[#EFEAFE]/70 dark:hover:bg-[#262238] disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors flex items-center justify-center gap-2 btn-tactile cursor-pointer"
          >
            {isScanning ? (
              <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
            ) : (
              <CameraIcon className="w-4 h-4 shrink-0" />
            )}
            <span>{isScanning ? t.txModal.scanningReceipt : t.txModal.scanReceipt}</span>
          </button>

          {scanNotice && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                scanNotice.tone === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : scanNotice.tone === 'info'
                    ? 'bg-[#FAF7F2] dark:bg-[#1E1D27] border-[#DED6CA] dark:border-[#343146] text-[#5B5670] dark:text-[#C5C0D4]'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {scanNotice.tone === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
              ) : scanNotice.tone === 'info' ? (
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#704BEA] dark:text-[#B8B2FF]" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              )}
              <span className="min-w-0 break-words leading-relaxed">{scanNotice.message}</span>
            </div>
          )}
        </div>

        {/* Inputs */}
        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
              {t.txModal.description}
            </label>
            <input
              type="text"
              required
              placeholder={t.txModal.descriptionPlaceholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
                {t.txModal.amountLabel(currency)}
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(formatThousandInput(e.target.value))}
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
                {t.txModal.date}
              </label>
              <input
                type="date"
                required
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full min-h-[44px] px-3 sm:px-3.5 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
              />
            </div>
          </div>

          {/* Category Selection */}
          <div>
            <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
              {t.txModal.category}
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
            >
              {availableCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {translateCategoryName(c, lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
              {t.txModal.tags}
            </label>
            <input
              type="text"
              placeholder={t.txModal.tagsPlaceholder}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
            />
          </div>

          <div>
            <label className="block text-[#16151D] dark:text-[#E2DFEC] font-semibold mb-1">
              {t.txModal.notes}
            </label>
            <textarea
              rows={2}
              placeholder={t.txModal.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl text-[#16151D] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#8E85FA]"
            />
          </div>
        </div>

        <div className="pt-3 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-[#706B82] dark:text-[#9D98AC] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
          >
            {t.common.cancel}
          </button>
          <button
            type="submit"
            className="min-h-[44px] px-5 py-2.5 text-xs font-bold bg-[#121118] text-white dark:bg-[#B8B2FF] dark:text-[#121118] hover:bg-[#252230] dark:hover:bg-[#A8A0FC] rounded-xl shadow-xs"
          >
            {editingTransaction ? t.txModal.saveChanges : t.txModal.recordTransaction}
          </button>
        </div>
      </form>
    </div>
  );
};
