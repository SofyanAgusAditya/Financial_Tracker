import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CalendarRange,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Info,
  Scale,
  X,
} from 'lucide-react';
import { Category, CurrencyCode, Transaction, TransactionType } from '../types';
import { convertCurrency, formatCurrency } from '../data/mockData';
import { filterTransactionsByPeriod } from '../utils/finance';
import { formatThousandInput, parseThousandInput } from '../utils/formatters';
import {
  getDateLocale,
  translateCategoryName,
  translatePeriodLabel,
  useLanguage,
} from '../utils/i18n';
import { exportCashBookCsv } from '../utils/storage';

export interface CashBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: Category[];
  currency: CurrencyCode;
  onSaveTransaction: (
    txData: Omit<Transaction, 'id' | 'idempotencyKey' | 'syncStatus' | 'createdAt'> & { id?: string }
  ) => void;
  onNotify?: (message: string) => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below for Android WebView or restricted contexts.
    }
  }

  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

export const CashBookModal: React.FC<CashBookModalProps> = ({
  isOpen,
  onClose,
  transactions,
  categories,
  currency,
  onSaveTransaction,
  onNotify,
}) => {
  const { lang, t } = useLanguage();
  const [actualBalanceInput, setActualBalanceInput] = useState<string>('');
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [copiedRecently, setCopiedRecently] = useState<boolean>(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setActualBalanceInput('');
    setFeedback(null);
    setIsExportingCsv(false);
    setCopiedRecently(false);
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const { allTimeIncome, allTimeExpense, allTimeNetBalance, dateRangeLabel } = useMemo(() => {
    let income = 0;
    let expense = 0;
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const tx of transactions) {
      const amt = convertCurrency(tx.amount, tx.currency, currency);
      if (tx.type === 'INCOME') {
        income += amt;
      } else if (tx.type === 'EXPENSE') {
        expense += amt;
      }

      const ts = new Date(tx.transactionDate).getTime();
      if (!Number.isNaN(ts)) {
        if (ts < minTime) minTime = ts;
        if (ts > maxTime) maxTime = ts;
      }
    }

    let rangeText = t.cashBook.noTransactionsRange;
    if (Number.isFinite(minTime) && Number.isFinite(maxTime)) {
      const locale = getDateLocale(lang);
      const startDate = new Date(minTime);
      const endDate = new Date(maxTime);
      const fmt: Intl.DateTimeFormatOptions = {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      };
      const startStr = startDate.toLocaleDateString(locale, fmt);
      const endStr = endDate.toLocaleDateString(locale, fmt);
      rangeText =
        startDate.toDateString() === endDate.toDateString()
          ? startStr
          : `${startStr} – ${endStr}`;
    }

    const roundedIncome = Math.round(income);
    const roundedExpense = Math.round(expense);

    return {
      allTimeIncome: roundedIncome,
      allTimeExpense: roundedExpense,
      allTimeNetBalance: roundedIncome - roundedExpense,
      dateRangeLabel: rangeText,
    };
  }, [transactions, currency, lang, t.cashBook.noTransactionsRange]);

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const monthlyTxs = filterTransactionsByPeriod(transactions, 'this_month', now);
    let monthIncome = 0;
    let monthExpense = 0;

    for (const tx of monthlyTxs) {
      const amt = convertCurrency(tx.amount, tx.currency, currency);
      if (tx.type === 'INCOME') {
        monthIncome += amt;
      } else if (tx.type === 'EXPENSE') {
        monthExpense += amt;
      }
    }

    const roundedMonthIncome = Math.round(monthIncome);
    const roundedMonthExpense = Math.round(monthExpense);

    return {
      monthLabel: translatePeriodLabel('this_month', lang, now),
      count: monthlyTxs.length,
      income: roundedMonthIncome,
      expense: roundedMonthExpense,
      net: roundedMonthIncome - roundedMonthExpense,
    };
  }, [transactions, currency, lang]);

  if (!isOpen) return null;

  const formatSignedCurrency = (value: number): string => {
    if (value > 0) return `+${formatCurrency(value, currency)}`;
    if (value < 0) return `-${formatCurrency(Math.abs(value), currency)}`;
    return formatCurrency(0, currency);
  };

  const handleActualBalanceChange = (raw: string) => {
    const digitsOnly = raw.replace(/\D/g, '');
    if (!digitsOnly) {
      setActualBalanceInput('');
      return;
    }
    if (/^0+$/.test(digitsOnly)) {
      setActualBalanceInput('0');
      return;
    }
    setActualBalanceInput(formatThousandInput(digitsOnly));
  };

  const hasActualInput = actualBalanceInput.trim().length > 0;
  const actualBalanceValue = hasActualInput ? parseThousandInput(actualBalanceInput) : null;
  const difference =
    actualBalanceValue !== null ? Math.round(actualBalanceValue - allTimeNetBalance) : 0;

  const handleRecordAdjustment = () => {
    if (!hasActualInput || actualBalanceValue === null || difference === 0) return;

    const txType: TransactionType = difference > 0 ? 'INCOME' : 'EXPENSE';
    const fallbackCategoryId =
      txType === 'INCOME'
        ? categories.find((c) => c.id === 'cat-inc-5')?.id ??
          categories.find((c) => c.type === 'INCOME')?.id
        : categories.find((c) => c.id === 'cat-exp-9')?.id ??
          categories.find((c) => c.type === 'EXPENSE')?.id;

    const absDiff = Math.abs(difference);
    const formattedRecorded = formatSignedCurrency(allTimeNetBalance);
    const formattedActual = formatCurrency(actualBalanceValue, currency);
    const formattedSignedDiff = formatSignedCurrency(difference);
    const formattedAbsDiff = formatCurrency(absDiff, currency);

    onSaveTransaction({
      type: txType,
      amount: absDiff,
      currency: 'IDR',
      categoryId: fallbackCategoryId,
      description: t.cashBook.adjustmentTxDescription,
      notes: t.cashBook.adjustmentNote(
        formattedRecorded,
        formattedActual,
        formattedSignedDiff
      ),
      transactionDate: new Date().toISOString(),
      tags: ['penyesuaian-saldo', 'buku-kas'],
    });

    setActualBalanceInput('');
    setFeedback({
      type: 'success',
      message: t.cashBook.adjustmentSuccess(
        txType === 'INCOME' ? t.common.income : t.common.expense,
        formattedAbsDiff
      ),
    });
  };

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    if (transactions.length === 0) {
      setFeedback({
        type: 'info',
        message: t.cashBook.csvEmptyInfo,
      });
      return;
    }

    setIsExportingCsv(true);
    try {
      const result = await exportCashBookCsv(transactions, categories, {
        headers: t.cashBook.csvHeaders,
        typeLabels: {
          INCOME: t.common.income,
          EXPENSE: t.common.expense,
        },
        resolveCategoryName: (cat) =>
          translateCategoryName(cat, lang, t.common.unassigned),
        title: t.cashBook.csvShareTitle,
        dialogTitle: t.cashBook.csvShareDialogTitle,
      });

      if (result.status === 'cancelled') {
        setFeedback({
          type: 'info',
          message: t.cashBook.csvExportCancelled,
        });
        return;
      }

      setFeedback({
        type: 'success',
        message:
          result.status === 'shared'
            ? t.cashBook.csvExportSharedSuccess(result.fileName)
            : t.cashBook.csvExportSuccess(result.fileName),
      });
    } catch {
      setFeedback({
        type: 'error',
        message: t.cashBook.csvExportError,
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleCopySummary = async () => {
    const lines = [
      t.cashBook.summaryHeader(monthlyStats.monthLabel),
      t.cashBook.summaryMonthIncome(formatCurrency(monthlyStats.income, currency)),
      t.cashBook.summaryMonthExpense(formatCurrency(monthlyStats.expense, currency)),
      t.cashBook.summaryMonthNet(formatSignedCurrency(monthlyStats.net)),
      t.cashBook.summaryMonthCount(monthlyStats.count),
      t.cashBook.summaryOverallBalance(
        formatSignedCurrency(allTimeNetBalance),
        transactions.length
      ),
    ];

    const ok = await copyTextToClipboard(lines.join('\n'));
    if (!ok) {
      setFeedback({
        type: 'error',
        message: t.cashBook.copyError,
      });
      return;
    }

    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    setCopiedRecently(true);
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedRecently(false);
      copyTimerRef.current = null;
    }, 2000);

    setFeedback({
      type: 'success',
      message: t.cashBook.copySuccess,
    });
    onNotify?.(t.cashBook.copySuccess);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#121118]/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div
        onClick={onClose}
        aria-hidden="true"
        className="absolute inset-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.cashBook.title}
        className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#181720] rounded-t-[28px] sm:rounded-3xl border border-[#EAE5DC] dark:border-[#262432] shadow-2xl p-4 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4"
      >
        <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 rounded-full bg-[#DED6CA] dark:bg-[#3A3450] sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F1ECE3] dark:border-[#252230]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FAF7F2] dark:bg-[#252230] text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[#16151D] dark:text-white truncate">
                {t.cashBook.title}
              </h3>
              <p className="text-xs text-[#706B82] dark:text-[#9D98AC] truncate">
                {t.cashBook.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.cashBook.closeAria}
            className="min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl text-[#706B82] hover:text-[#16151D] dark:hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            role="status"
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : feedback.type === 'info'
                ? 'bg-[#FAF7F2] dark:bg-[#1E1D27] border-[#DED6CA] dark:border-[#343146] text-[#5B5670] dark:text-[#C5C0D4]'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : feedback.type === 'info' ? (
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#8E85FA] dark:text-[#B8B2FF]" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="min-w-0 break-words">{feedback.message}</span>
          </div>
        )}

        {/* 1. Ringkasan & Status Buku Kas Offline */}
        <section className="p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#706B82] dark:text-[#9D98AC]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#16151D] dark:text-white min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="truncate">{t.cashBook.storageStatus}</span>
            </span>
            <span className="font-mono tabular-nums font-bold text-[#704BEA] dark:text-[#B8B2FF] shrink-0">
              {t.cashBook.txCount(transactions.length)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432]">
            <div className="text-[11px] font-semibold text-[#706B82] dark:text-[#9D98AC]">
              {t.cashBook.overallNetBalance}
            </div>
            <div
              className={`text-xl sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight mt-0.5 truncate ${
                allTimeNetBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatSignedCurrency(allTimeNetBalance)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] min-w-0">
              <div className="text-[11px] font-semibold text-[#706B82] dark:text-[#9D98AC] truncate">
                {t.cashBook.allTimeIncome}
              </div>
              <div className="text-xs sm:text-sm font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                +{formatCurrency(allTimeIncome, currency)}
              </div>
            </div>

            <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] min-w-0">
              <div className="text-[11px] font-semibold text-[#706B82] dark:text-[#9D98AC] truncate">
                {t.cashBook.allTimeExpense}
              </div>
              <div className="text-xs sm:text-sm font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                -{formatCurrency(allTimeExpense, currency)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#EAE5DC] dark:border-[#2D2A3B] text-[11px] text-[#706B82] dark:text-[#9D98AC]">
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <CalendarRange className="w-3.5 h-3.5 text-[#704BEA] dark:text-[#B8B2FF]" />
              <span>{t.cashBook.dateRangeLabel}</span>
            </span>
            <span className="font-mono tabular-nums font-medium text-[#16151D] dark:text-[#E2DFEC] text-right truncate">
              {dateRangeLabel}
            </span>
          </div>
        </section>

        {/* 2. Penyesuaian Saldo / Saldo Awal Kas */}
        <section className="p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#704BEA]/15 text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0 mt-0.5">
              <Scale className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-[#16151D] dark:text-white">
                {t.cashBook.adjustmentSectionTitle}
              </h4>
              <p className="text-[11px] text-[#706B82] dark:text-[#9D98AC] mt-0.5 leading-snug">
                {t.cashBook.adjustmentSectionSubtitle}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="cashbook-actual-balance"
              className="block text-xs font-semibold text-[#16151D] dark:text-[#E2DFEC] mb-1.5"
            >
              {t.cashBook.actualBalanceLabel}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-[#706B82] dark:text-[#9D98AC]">
                Rp
              </span>
              <input
                id="cashbook-actual-balance"
                type="text"
                inputMode="numeric"
                value={actualBalanceInput}
                onChange={(e) => handleActualBalanceChange(e.target.value)}
                placeholder={t.cashBook.actualBalancePlaceholder}
                className="w-full min-h-[44px] pl-10 pr-3.5 py-2.5 text-sm font-bold font-mono tabular-nums text-[#16151D] dark:text-white bg-white dark:bg-[#181720] border border-[#DDD7CD] dark:border-[#2D2A3B] rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#704BEA]"
              />
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-2 text-[11px] text-[#706B82] dark:text-[#9D98AC]">
              <span>{t.cashBook.recordedBalanceLabel}</span>
              <span className="font-mono tabular-nums font-semibold text-[#16151D] dark:text-white">
                {formatSignedCurrency(allTimeNetBalance)}
              </span>
            </div>

            {hasActualInput ? (
              <>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#706B82] dark:text-[#9D98AC]">
                    {t.cashBook.differenceLabel}
                  </span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      difference > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : difference < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-[#706B82] dark:text-[#9D98AC]'
                    }`}
                  >
                    {formatSignedCurrency(difference)}
                  </span>
                </div>
                <div className="text-[11px] text-[#5B5670] dark:text-[#C5C0D4] pt-1 border-t border-[#F1ECE3] dark:border-[#252230]">
                  {difference === 0
                    ? t.cashBook.balanceMatched
                    : difference > 0
                    ? t.cashBook.willRecordIncome(formatCurrency(difference, currency))
                    : t.cashBook.willRecordExpense(formatCurrency(Math.abs(difference), currency))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-[#706B82] dark:text-[#9D98AC]">
                {t.cashBook.adjustmentHint}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!hasActualInput || difference === 0}
            onClick={handleRecordAdjustment}
            className="w-full min-h-[44px] px-4 py-2.5 text-xs font-bold bg-[#121118] text-white dark:bg-[#B8B2FF] dark:text-[#121118] hover:bg-[#252230] dark:hover:bg-[#A8A0FC] disabled:opacity-45 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 btn-tactile cursor-pointer"
          >
            <Scale className="w-4 h-4 shrink-0" />
            <span>{t.cashBook.recordAdjustmentBtn}</span>
          </button>
        </section>

        {/* 3. Ekspor Rekap Buku Kas (CSV & Salin Ringkasan) */}
        <section className="p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] space-y-3">
          <div>
            <h4 className="text-xs font-bold text-[#16151D] dark:text-white">
              {t.cashBook.exportSectionTitle}
            </h4>
            <p className="text-[11px] text-[#706B82] dark:text-[#9D98AC] mt-0.5 leading-snug">
              {t.cashBook.exportSectionSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isExportingCsv}
              onClick={() => void handleExportCsv()}
              className="min-h-[44px] px-3 py-2.5 text-xs font-bold bg-[#704BEA] hover:bg-[#5E38DB] text-white dark:bg-[#B8B0FF] dark:text-[#121118] dark:hover:bg-[#A8A0FC] disabled:opacity-60 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 btn-tactile cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {isExportingCsv ? t.cashBook.exportingCsvBtn : t.cashBook.exportCsvBtn}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className="min-h-[44px] px-3 py-2.5 text-xs font-semibold text-[#16151D] dark:text-[#F4F2F8] bg-white dark:bg-[#181720] border border-[#DDD7CD] dark:border-[#2D2A3B] hover:bg-[#F1ECE3] dark:hover:bg-[#262432] rounded-xl transition-colors flex items-center justify-center gap-1.5 btn-tactile cursor-pointer"
            >
              {copiedRecently ? (
                <Check className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4 shrink-0 text-[#704BEA] dark:text-[#B8B2FF]" />
              )}
              <span className="truncate">
                {copiedRecently ? t.cashBook.copiedBtn : t.cashBook.copySummaryBtn}
              </span>
            </button>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 text-xs font-semibold text-[#706B82] dark:text-[#9D98AC] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
