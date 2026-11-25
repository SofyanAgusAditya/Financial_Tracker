import React, { useState, useMemo } from 'react';
import { 
  Transaction, 
  Category, 
  Budget, 
  CurrencyCode 
} from '../types';
import { formatCurrency, convertCurrency } from '../data/mockData';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  ArrowDown,
  TrendingUp, 
  ChevronRight,
  AlertTriangle,
  Sparkles,
  Sliders,
  ReceiptText,
  BarChart3,
  BookOpen,
} from 'lucide-react';
import { OrganicDivider } from './OrganicDivider';
import { DashboardSkeleton } from './Skeleton';
import {
  PeriodFilter,
  clamp,
  filterTransactionsByPeriod,
  getWeekDays,
} from '../utils/finance';
import {
  getDateLocale,
  translateCategoryName,
  translatePeriodLabel,
  useLanguage,
} from '../utils/i18n';

interface DashboardViewProps {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  currency: CurrencyCode;
  timeFilter: PeriodFilter;
  setTimeFilter: (filter: PeriodFilter) => void;
  onNavigateTab: (tab: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  onOpenNewTx: (type?: 'INCOME' | 'EXPENSE') => void;
  onOpenCashBook?: () => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  categories,
  budgets,
  currency,
  timeFilter,
  setTimeFilter,
  onNavigateTab,
  onSelectTransaction,
  onOpenNewTx,
  onOpenCashBook,
  isLoading = false,
  onRefresh,
}) => {
  const { lang, t } = useLanguage();
  const now = useMemo(() => new Date(), []);
  const [selectedChartDateKey, setSelectedChartDateKey] = useState<string>(() =>
    new Date().toDateString()
  );

  const periodLabel = translatePeriodLabel(timeFilter, lang, now);

  const handlePeriodChange = (newPeriod: PeriodFilter) => {
    if (newPeriod === timeFilter) return;
    setTimeFilter(newPeriod);
  };

  // 1. Filter transactions based on the selected period
  const filteredTransactions = useMemo(() => {
    return filterTransactionsByPeriod(transactions, timeFilter, now);
  }, [transactions, timeFilter, now]);

  // 3. Compute Income, Expense, and Net Cash Flow
  const { totalIncome, totalExpense, netCashFlow } = useMemo(() => {
    let income = 0;
    let expense = 0;

    filteredTransactions.forEach((tx) => {
      const converted = convertCurrency(tx.amount, tx.currency, currency);
      if (tx.type === 'INCOME') {
        income += converted;
      } else if (tx.type === 'EXPENSE') {
        expense += converted;
      }
    });

    return {
      totalIncome: income,
      totalExpense: expense,
      netCashFlow: income - expense,
    };
  }, [filteredTransactions, currency]);

  // 4. Group Expenses by Category
  const categoryExpenses = useMemo(() => {
    const map = new Map<string, number>();
    filteredTransactions
      .filter((tx) => tx.type === 'EXPENSE' && tx.categoryId)
      .forEach((tx) => {
        const catId = tx.categoryId!;
        const amt = convertCurrency(tx.amount, tx.currency, currency);
        map.set(catId, (map.get(catId) || 0) + amt);
      });

    const list: { category: Category; amount: number; percentage: number }[] = [];
    const totalExp = totalExpense > 0 ? totalExpense : 1;

    map.forEach((amount, catId) => {
      const category = categories.find((c) => c.id === catId);
      if (category) {
        list.push({
          category,
          amount,
          percentage: Math.round((amount / totalExp) * 100),
        });
      }
    });

    return list.sort((a, b) => b.amount - a.amount);
  }, [filteredTransactions, categories, currency, totalExpense]);

  // 5. Budget Utilization Status (always the current calendar month)
  const monthlyTransactions = useMemo(
    () => filterTransactionsByPeriod(transactions, 'this_month', now),
    [transactions, now]
  );

  const budgetStatuses = useMemo(() => {
    return budgets.map((b) => {
      const category = categories.find((c) => c.id === b.categoryId);
      const convertedLimit = convertCurrency(b.monthlyLimit, b.currency, currency);

      const spent = monthlyTransactions
        .filter((tx) => tx.type === 'EXPENSE' && tx.categoryId === b.categoryId)
        .reduce((sum, tx) => sum + convertCurrency(tx.amount, tx.currency, currency), 0);

      const percent = convertedLimit > 0 ? Math.round((spent / convertedLimit) * 100) : 0;

      return {
        budget: b,
        category,
        limit: convertedLimit,
        spent,
        percent,
      };
    });
  }, [budgets, categories, monthlyTransactions, currency]);

  const overallBudgetPercent = useMemo(() => {
    const totalLimit = budgetStatuses.reduce((sum, b) => sum + b.limit, 0);
    const totalSpent = budgetStatuses.reduce((sum, b) => sum + b.spent, 0);
    return totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
  }, [budgetStatuses]);

  const budgetHeadroom = Math.round(clamp(100 - overallBudgetPercent, 0, 100));

  const topEnvelopes = useMemo(
    () => [...budgetStatuses].sort((a, b) => b.percent - a.percent).slice(0, 2),
    [budgetStatuses]
  );

  // Weekly spending chart is derived from real expense transactions.
  const weeklyChartData = useMemo(() => {
    const locale = getDateLocale(lang);
    const days = getWeekDays(now);
    const values = days.map((day) => {
      const key = day.toDateString();
      const amount = transactions
        .filter(
          (tx) =>
            tx.type === 'EXPENSE' &&
            new Date(tx.transactionDate).toDateString() === key
        )
        .reduce(
          (sum, tx) => sum + convertCurrency(tx.amount, tx.currency, currency),
          0
        );

      return { day, key, amount };
    });

    const max = Math.max(...values.map((value) => value.amount), 1);

    return values.map((value) => ({
      dateKey: value.key,
      day: value.day.toLocaleDateString(locale, { weekday: 'short' }),
      dateLabel: value.day.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      }),
      amount: value.amount,
      heightPct: value.amount > 0 ? Math.max(8, (value.amount / max) * 100) : 3,
      isPeak: value.amount > 0 && value.amount === max,
      isToday: value.key === now.toDateString(),
    }));
  }, [transactions, currency, now, lang]);

  const asOfLabel = now.toLocaleDateString(getDateLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-5 sm:space-y-8 animate-fadeIn">
      
      {/* Top Editorial Greeting & Period Switcher */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 pb-2 border-b border-[#EDE7DE] dark:border-[#262234]">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#704BEA] dark:text-[#B8B0FF] mb-1">
            <span>{t.dashboard.eyebrowLeft}</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onOpenCashBook}
              title={t.dashboard.openCashBookTitle}
              aria-label={t.dashboard.openCashBookTitle}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 min-h-[28px] rounded-lg bg-[#704BEA]/10 dark:bg-[#B8B0FF]/15 hover:bg-[#704BEA]/20 dark:hover:bg-[#B8B0FF]/25 text-[#704BEA] dark:text-[#B8B0FF] transition-colors cursor-pointer btn-tactile focus:outline-none focus-visible:ring-2 focus-visible:ring-[#704BEA]"
            >
              <BookOpen className="w-3 h-3 shrink-0" />
              <span>{t.dashboard.eyebrowRight}</span>
            </button>
          </div>
          {/* Treats inspired editorial greeting headline */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#181522] dark:text-white">
            {t.dashboard.heroTitlePrefix}
            <span className="text-[#704BEA] dark:text-[#B8B0FF]">
              {t.dashboard.heroTitleHighlight}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-[#726B82] dark:text-[#A7A0B8] mt-0.5 sm:mt-1">
            {t.dashboard.heroSubtitle}
          </p>
        </div>

        {/* Dial Rule Pill + Period Tabs */}
        <div className="w-full lg:w-auto flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Treats-inspired 'SET YOUR RULES' dial stat with hover card lift */}
          <button 
            onClick={() => onNavigateTab('budgets')}
            title={t.dashboard.budgetHeadroomTitle}
            className="hidden sm:flex items-center gap-3 px-3.5 py-2 rounded-2xl bg-white dark:bg-[#1A1726] border border-[#E5DDD0] dark:border-[#2C273B] shadow-xs card-hover-lift cursor-pointer text-left btn-tactile"
          >
            {/* Budget headroom dial, derived from current-month budget usage */}
            <div className="relative w-10 h-10 rounded-2xl bg-[#FBF8F2] dark:bg-[#252132] border-2 border-[#704BEA]/40 dark:border-[#B8B0FF]/40 flex items-center justify-center font-mono font-black text-sm text-[#704BEA] dark:text-[#B8B0FF] shadow-inner">
              <span className="relative z-10">
                {budgetStatuses.length > 0 ? budgetHeadroom : '—'}
              </span>
              {/* Dial Notch Accent */}
              <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-[#FFB800] -translate-y-0.5 translate-x-0.5 shadow-xs" />
            </div>
            <div className="text-left leading-tight">
              <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-[#181522] dark:text-white">
                <span>{t.dashboard.budgetHeadroom}</span>
                <ArrowUpRight className="w-3 h-3 text-[#704BEA] dark:text-[#B8B0FF] stroke-[2.5]" />
              </div>
              <div className="text-[10px] text-[#726B82] dark:text-[#A7A0B8]">
                {budgetStatuses.length > 0
                  ? t.dashboard.budgetHeadroomUsed(overallBudgetPercent)
                  : t.dashboard.budgetHeadroomEmpty}
              </div>
            </div>
          </button>

          {/* Period Filter Tabs with tactile micro-interactions */}
          <div className="w-full sm:w-auto grid grid-cols-5 sm:flex items-center gap-1 p-1 bg-[#F4EFE6] dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#E5DDD0] dark:border-[#2E283F]">
            {([
              { id: 'today', label: t.dashboard.periods.today },
              { id: 'this_week', label: t.dashboard.periods.this_week },
              { id: 'this_month', label: t.dashboard.periods.this_month },
              { id: 'this_year', label: t.dashboard.periods.this_year },
              { id: 'all', label: t.dashboard.periods.all },
            ] as { id: PeriodFilter; label: string }[]).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handlePeriodChange(item.id)}
                className={`w-full sm:w-auto min-w-0 flex items-center justify-center text-center whitespace-nowrap px-1 sm:px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg sm:rounded-xl btn-tactile cursor-pointer min-h-[40px] sm:min-h-[38px] ${
                  timeFilter === item.id
                    ? 'bg-white dark:bg-[#2D283E] text-[#181522] dark:text-white shadow-xs font-bold'
                    : 'text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#181522] dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Signature Dual-Pillar Stage (Treats-Inspired Organic Wave Cards) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
        
        {/* Left Pillar: Treats Royal Purple 'Joy Budget' & Primary Capital Card (7 Cols) */}
        <div className="lg:col-span-7 space-y-3.5 sm:space-y-4 flex flex-col justify-between">
          
          {/* Main Card: Purple with organic curvature and circular action button */}
          <div className="bg-gradient-to-br from-[#704BEA] via-[#7B56EE] to-[#8A66F5] text-white rounded-[28px] sm:rounded-[32px] p-4 sm:p-6 lg:p-7 shadow-xl relative overflow-hidden flex flex-col justify-between border border-[#9F82FF]/40 card-hover-lift">
            
            {/* Header: Condensed title & circular arrow button */}
            <div className="flex items-start justify-between gap-3 sm:gap-4">
              <div>
                <div className="text-[10px] sm:text-[11px] font-extrabold tracking-widest uppercase text-white/80">
                  {t.dashboard.netCashFlowPrefix} · {periodLabel.toUpperCase()}
                </div>
                <div className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-sans mt-1 sm:mt-2 truncate min-w-0">
                  {formatCurrency(netCashFlow, currency)}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1 sm:mt-2 text-[11px] sm:text-xs font-medium text-white/80">
                  <span>{t.dashboard.entriesCount(filteredTransactions.length)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t.dashboard.asOf(asOfLabel)}</span>
                </div>
              </div>

              {/* Treats signature circular white button with ↗ */}
              <button
                onClick={() => onNavigateTab('transactions')}
                title={t.dashboard.viewFullLedger}
                aria-label={t.dashboard.viewFullLedger}
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white text-[#100E17] btn-tactile shadow-md flex items-center justify-center shrink-0 cursor-pointer hover:bg-white/95"
              >
                <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Cash Velocity progress bar */}
            <div className="my-3 sm:my-6 pt-1 sm:pt-2">
              <div className="flex items-center justify-between text-[11px] sm:text-xs font-bold text-white/80 mb-1.5 sm:mb-2">
                <span className="uppercase tracking-wider text-[10px]">{t.dashboard.cashVelocity}</span>
                <span className="font-mono truncate ml-2 text-right min-w-0">
                  {t.dashboard.spentSuffix(formatCurrency(totalExpense, currency))}
                </span>
              </div>

              {/* Slider Track */}
              <div className="py-1">
                <div className="h-2.5 sm:h-3 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-white via-[#FFC430] to-white rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, totalIncome > 0 ? (totalExpense / totalIncome) * 100 : totalExpense > 0 ? 100 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-white/70 font-mono mt-1.5">
                <span className="truncate">
                  {totalIncome > 0
                    ? t.dashboard.percentOfInflow(Math.round((totalExpense / totalIncome) * 100))
                    : t.dashboard.noInflowRecorded}
                </span>
                <span className="truncate ml-2 text-right">
                  {t.dashboard.inflowLabel(formatCurrency(totalIncome, currency))}
                </span>
              </div>
            </div>

            {/* Quick Action Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2.5 pt-2 border-t border-white/20">
              <button 
                onClick={() => onOpenNewTx('INCOME')}
                className="min-h-[40px] sm:h-11 bg-white hover:bg-white/95 text-[#100E17] rounded-xl sm:rounded-2xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm text-[11px] sm:text-xs font-bold btn-tactile cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>{t.dashboard.income}</span>
              </button>

              <button 
                onClick={() => onOpenNewTx('EXPENSE')}
                className="min-h-[40px] sm:h-11 bg-white hover:bg-white/95 text-[#100E17] rounded-xl sm:rounded-2xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm text-[11px] sm:text-xs font-bold btn-tactile cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>{t.dashboard.expense}</span>
              </button>

              <button 
                onClick={() => onNavigateTab('reports')}
                className="min-h-[40px] sm:h-11 bg-white hover:bg-white/95 text-[#100E17] rounded-xl sm:rounded-2xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm text-[11px] sm:text-xs font-bold btn-tactile cursor-pointer"
              >
                <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                <span>{t.dashboard.analytics}</span>
              </button>

              <button 
                onClick={() => onNavigateTab('budgets')}
                className="min-h-[40px] sm:h-11 bg-[#100E17] hover:bg-black text-white rounded-xl sm:rounded-2xl flex items-center justify-center gap-1 sm:gap-1.5 shadow-sm text-[11px] sm:text-xs font-bold btn-tactile cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="truncate">{t.dashboard.budgets}</span>
              </button>
            </div>

          </div>

          {/* Treats 'Treat Check' Inspired Warm Sunset Banner */}
          <div className="bg-gradient-to-r from-[#FF941A] via-[#FFAF1A] to-[#FFC430] text-[#100E17] rounded-[24px] sm:rounded-[28px] p-3.5 sm:p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#FF941A]/30 relative overflow-hidden card-hover-lift">
            <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white/80 text-[#100E17] flex items-center justify-center shadow-xs shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[#FF941A]" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-[#100E17]/80">
                  {t.dashboard.treatCheckEyebrow}
                </div>
                <div className="text-xs sm:text-sm font-bold text-[#100E17] mt-0.5 leading-snug">
                  {netCashFlow >= 0 
                    ? t.dashboard.surplusBanner(formatCurrency(netCashFlow, currency))
                    : t.dashboard.deficitBanner(formatCurrency(Math.abs(netCashFlow), currency))}
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigateTab('budgets')}
              className="w-full sm:w-auto justify-center px-3.5 sm:px-4 py-2 bg-white text-[#100E17] hover:bg-white/90 rounded-xl sm:rounded-2xl text-xs font-extrabold shadow-sm flex items-center gap-1 shrink-0 btn-tactile cursor-pointer"
            >
              <span>{t.dashboard.envelopeRules}</span>
              <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          </div>

        </div>

        {/* Right Pillar: Analytics Rhythm & Savings Envelopes (5 Cols) */}
        <div className="lg:col-span-5 bg-[#100E17] text-white rounded-[28px] sm:rounded-[32px] p-4 sm:p-6 lg:p-7 shadow-xl flex flex-col justify-between border border-[#252033] relative overflow-hidden card-hover-lift">
          
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#B8B0FF]">
                {t.dashboard.weeklySpendingEyebrow}
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight mt-0.5">
                {t.dashboard.cashOutflowPulse}
              </h2>
            </div>
            <button 
              onClick={() => onNavigateTab('reports')}
              className="text-xs font-semibold text-[#B8B0FF] hover:text-white flex items-center gap-0.5 btn-tactile cursor-pointer"
            >
              <span>{t.dashboard.fullAnalytics}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Weekly spending bars derived from real expense transactions */}
          <div className="relative h-28 sm:h-36 flex items-end justify-between px-1 sm:px-2 pt-6 pb-2">
            {weeklyChartData.map((bar) => {
              const isSelected = selectedChartDateKey === bar.dateKey;
              const showTooltip = bar.isPeak || isSelected;
              return (
                <button
                  type="button"
                  key={bar.dateKey}
                  onClick={() => setSelectedChartDateKey(bar.dateKey)}
                  className="flex-1 h-full flex flex-col items-center justify-end gap-1 group cursor-pointer relative focus:outline-none"
                  aria-label={t.dashboard.barAriaLabel(bar.dateLabel, formatCurrency(bar.amount, currency))}
                >
                  <div className="relative w-full flex-1 flex items-end justify-center">
                    <div
                      className={`absolute -top-5 bg-white text-[#100E17] font-bold text-[9px] sm:text-[10px] px-2 py-0.5 rounded-full shadow-md font-mono whitespace-nowrap transition-opacity ${
                        showTooltip ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      {formatCurrency(bar.amount, currency)}
                    </div>
                    <div
                      className={`w-5 sm:w-6 rounded-t-lg sm:rounded-t-xl transition-all duration-300 ${
                        bar.isPeak
                          ? 'bg-[#B8B0FF] shadow-xs'
                          : isSelected
                          ? 'bg-white'
                          : 'bg-white/60 group-hover:bg-white'
                      }`}
                      style={{ height: `${bar.heightPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-semibold ${
                      bar.isToday || bar.isPeak || isSelected
                        ? 'text-[#B8B0FF]'
                        : 'text-[#878096]'
                    }`}
                  >
                    {bar.day}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Organic Divider flowing to Lower Envelope Section */}
          <div className="-mx-4 sm:-mx-7 my-2">
            <OrganicDivider 
              topColor="#100E17" 
              bottomColor="#171424" 
              pillColor="#B8B0FF" 
            />
          </div>

          {/* Live budget envelopes snapshot */}
          <div className="bg-[#171424] -mx-4 sm:-mx-7 -mb-4 sm:-mb-7 p-4 sm:p-6 text-white space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="uppercase tracking-wider text-[11px] text-white/90">
                {t.dashboard.budgetEnvelopes}
              </span>
              <button 
                onClick={() => onNavigateTab('budgets')}
                className="text-[#B8B0FF] hover:underline text-[11px] btn-tactile cursor-pointer"
              >
                {t.dashboard.manageEnvelopes}
              </button>
            </div>

            {topEnvelopes.length === 0 ? (
              <div className="text-[11px] text-white/60 leading-relaxed">
                {t.dashboard.noEnvelopesYet}
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                {topEnvelopes.map((envelope, index) => {
                  const percent = envelope.percent;
                  const barColor =
                    percent >= 100
                      ? 'from-rose-500 to-rose-400'
                      : percent >= 80
                      ? 'from-amber-500 to-[#FFC430]'
                      : index === 0
                      ? 'from-[#704BEA] to-[#B8B0FF]'
                      : 'from-emerald-500 to-emerald-300';

                  return (
                    <div key={envelope.budget.id} className="space-y-1">
                      <div className="flex justify-between text-[11px] text-[#D8D4E5] gap-2">
                        <span className="truncate">
                          {translateCategoryName(envelope.category, lang, t.common.unassigned)}
                        </span>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            percent >= 100
                              ? 'text-rose-400'
                              : percent >= 80
                              ? 'text-[#FFB800]'
                              : 'text-[#B8B0FF]'
                          }`}
                        >
                          {percent}%
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-300`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-white/50 font-mono">
                        <span>{t.dashboard.spentLower(formatCurrency(envelope.spent, currency))}</span>
                        <span>{t.dashboard.capLower(formatCurrency(envelope.limit, currency))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </section>

      {/* 4-Card Primary Financial Health Strip (Tabular, Unboxed, Clean) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        
        {/* Period Activity */}
        <div className="p-3 sm:p-5 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift cursor-default overflow-hidden">
          <div className="flex items-center justify-between text-[#726B82] dark:text-[#A7A0B8]">
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase truncate">
              {t.dashboard.kpiEntries}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-purple-50 dark:bg-purple-950/40 text-[#704BEA] dark:text-[#B8B0FF] flex items-center justify-center shrink-0">
              <ReceiptText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-base sm:text-2xl font-extrabold font-mono tabular-nums text-[#181522] dark:text-white tracking-tight truncate">
              {filteredTransactions.length}
            </div>
            <div className="text-[10px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8] mt-0.5 sm:mt-1 truncate">
              {t.dashboard.recordedIn(periodLabel.toLowerCase())}
            </div>
          </div>
        </div>

        {/* Total Period Inflow */}
        <div className="p-3 sm:p-5 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift cursor-default overflow-hidden">
          <div className="flex items-center justify-between text-[#726B82] dark:text-[#A7A0B8]">
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase truncate">
              {t.dashboard.kpiIncome}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-sm sm:text-2xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 tracking-tight truncate">
              +{formatCurrency(totalIncome, currency)}
            </div>
            <div className="text-[10px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8] mt-0.5 sm:mt-1 truncate">
              {t.dashboard.periodInflow}
            </div>
          </div>
        </div>

        {/* Total Period Outflow */}
        <div className="p-3 sm:p-5 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift cursor-default overflow-hidden">
          <div className="flex items-center justify-between text-[#726B82] dark:text-[#A7A0B8]">
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase truncate">
              {t.dashboard.kpiExpenses}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="text-sm sm:text-2xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400 tracking-tight truncate">
              -{formatCurrency(totalExpense, currency)}
            </div>
            <div className="text-[10px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8] mt-0.5 sm:mt-1 truncate">
              {t.dashboard.periodOutflow}
            </div>
          </div>
        </div>

        {/* Net Cash Flow */}
        <div className="p-3 sm:p-5 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift cursor-default overflow-hidden">
          <div className="flex items-center justify-between text-[#726B82] dark:text-[#A7A0B8]">
            <span className="text-[10px] sm:text-xs font-bold tracking-wider uppercase truncate">
              {t.dashboard.kpiCashFlow}
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className={`text-sm sm:text-2xl font-extrabold font-mono tabular-nums tracking-tight truncate ${
              netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow, currency)}
            </div>
            <div className="text-[10px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8] mt-0.5 sm:mt-1 truncate">
              {netCashFlow >= 0 ? t.dashboard.periodSurplus : t.dashboard.periodDeficit}
            </div>
          </div>
        </div>

      </section>

      {/* Main Analysis Section: Cash Flow Ratio & Spending by Category */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        
        {/* Left Column (2 Cols): Cash Flow Split & Category Breakdown */}
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          
          {/* Income vs Outflow Ratio Card */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#181522] dark:text-white">
                  {t.dashboard.velocityTitle}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8]">
                  {t.dashboard.velocitySubtitle}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-[#181522] dark:text-white">
                {totalIncome > 0
                  ? t.dashboard.consumedPercent(Math.round((totalExpense / totalIncome) * 100))
                  : '0%'}
              </span>
            </div>

            {/* Split Progress Track */}
            <div className="h-3 sm:h-4 bg-[#EFE9E0] dark:bg-[#282337] rounded-full overflow-hidden flex shadow-inner">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500" 
                style={{ width: `${totalIncome + totalExpense > 0 ? (totalIncome / (totalIncome + totalExpense)) * 100 : 0}%` }}
                title={`${t.dashboard.inflowShort}: ${formatCurrency(totalIncome, currency)}`}
              />
              <div 
                className="bg-rose-500 h-full transition-all duration-500" 
                style={{ width: `${totalIncome + totalExpense > 0 ? (totalExpense / (totalIncome + totalExpense)) * 100 : 0}%` }}
                title={`${t.dashboard.outflowShort}: ${formatCurrency(totalExpense, currency)}`}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[#6D657C] dark:text-[#B4ADC4] mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-[#F2ECE2] dark:border-[#282337] gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                <span className="text-[11px] sm:text-xs truncate">
                  {t.dashboard.inflowShort}:{' '}
                  <strong className="font-mono text-[#181522] dark:text-white">
                    {formatCurrency(totalIncome, currency)}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-rose-500 inline-block shrink-0" />
                <span className="text-[11px] sm:text-xs truncate">
                  {t.dashboard.outflowShort}:{' '}
                  <strong className="font-mono text-[#181522] dark:text-white">
                    {formatCurrency(totalExpense, currency)}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Expense Category Breakdown */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#181522] dark:text-white">
                  {t.dashboard.spendingDistTitle}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8]">
                  {t.dashboard.spendingDistSubtitle}
                </p>
              </div>
              <button 
                onClick={() => onNavigateTab('reports')}
                className="text-xs font-semibold text-[#704BEA] dark:text-[#B8B0FF] hover:underline flex items-center gap-0.5 btn-tactile cursor-pointer"
              >
                <span>{t.dashboard.fullBreakdown}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {categoryExpenses.length === 0 ? (
              <div className="py-6 sm:py-8 text-center text-[#A7A0B8] text-xs">
                {t.dashboard.noExpensesPeriod}
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {categoryExpenses.slice(0, 5).map(({ category, amount, percentage }) => (
                  <div key={category.id} className="space-y-1 sm:space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span 
                          className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full shrink-0" 
                          style={{ backgroundColor: category.colorHex }}
                        />
                        <span className="font-medium text-[#181522] dark:text-[#EAE6F3] truncate">
                          {translateCategoryName(category, lang)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 font-mono tabular-nums text-[#6D657C] dark:text-[#B4ADC4] shrink-0 text-right">
                        <span>{formatCurrency(amount, currency)}</span>
                        <span className="text-[#A7A0B8]">({percentage}%)</span>
                      </div>
                    </div>
                    {/* Linear Bar */}
                    <div className="h-1.5 sm:h-2 bg-[#EFE9E0] dark:bg-[#282337] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300" 
                        style={{ 
                          width: `${percentage}%`,
                          backgroundColor: category.colorHex 
                        }} 
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Column (1 Col): Budget Alerts */}
        <div className="space-y-4 sm:space-y-6">
          
          {/* Monthly Budget Envelopes */}
          <div className="p-4 sm:p-6 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-[#181522] dark:text-white">
                  {t.dashboard.budgetThresholdsTitle}
                </h2>
                <p className="text-[11px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8]">
                  {t.dashboard.budgetThresholdsSubtitle}
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('budgets')}
                className="text-xs font-semibold text-[#704BEA] dark:text-[#B8B0FF] hover:underline btn-tactile cursor-pointer"
              >
                {t.dashboard.manage}
              </button>
            </div>

            <div className="space-y-2.5 sm:space-y-3.5">
              {budgetStatuses.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-[#FBF8F2] dark:bg-[#221E2E] border border-dashed border-[#DDD5C7] dark:border-[#322C42] text-[11px] text-[#726B82] dark:text-[#A7A0B8]">
                  {t.dashboard.noThresholdsYet}
                </div>
              ) : budgetStatuses.slice(0, 4).map(({ budget, category, limit, spent, percent }) => {
                let alertColor = 'bg-[#704BEA]';
                let isCritical = false;
                if (percent >= 100) {
                  alertColor = 'bg-rose-500';
                  isCritical = true;
                } else if (percent >= 90) {
                  alertColor = 'bg-orange-500';
                } else if (percent >= 80) {
                  alertColor = 'bg-amber-500';
                }

                return (
                  <div key={budget.id} className="p-3 sm:p-3.5 rounded-xl bg-[#FBF8F2] dark:bg-[#221E2E] border border-[#EDE7DE] dark:border-[#322C42] transition-transform hover:scale-[1.01]">
                    <div className="flex items-center justify-between text-xs mb-1 sm:mb-1.5">
                      <span className="font-semibold text-[#181522] dark:text-[#EAE6F3] truncate">
                        {translateCategoryName(category, lang, t.common.general)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {percent >= 80 && (
                          <AlertTriangle className={`w-3.5 h-3.5 ${
                            isCritical ? 'text-rose-500 animate-pulse' : 'text-amber-500'
                          }`} />
                        )}
                        <span className={`font-mono font-bold tabular-nums ${
                          percent >= 100 ? 'text-rose-600 dark:text-rose-400' :
                          percent >= 80 ? 'text-amber-600 dark:text-amber-400' :
                          'text-[#6D657C] dark:text-[#B4ADC4]'
                        }`}>
                          {percent}%
                        </span>
                      </div>
                    </div>

                    <div className="h-1.5 bg-[#DDD5C7] dark:bg-[#322C42] rounded-full overflow-hidden mb-1 sm:mb-1.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${alertColor}`} 
                        style={{ width: `${Math.min(percent, 100)}%` }} 
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#726B82] dark:text-[#A7A0B8] font-mono tabular-nums gap-2">
                      <span className="truncate">{t.dashboard.spentCapLabel}: {formatCurrency(spent, currency)}</span>
                      <span className="truncate text-right">{t.dashboard.capLabel}: {formatCurrency(limit, currency)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </section>

      {/* Treats Timeline-Style Recent Ledger Transactions */}
      <section className="p-4 sm:p-6 bg-white dark:bg-[#1A1726] rounded-xl sm:rounded-2xl border border-[#EDE7DE] dark:border-[#2C273B] shadow-xs card-hover-lift">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#704BEA] dark:text-[#B8B0FF]">
              {t.dashboard.timelineEyebrow}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-[#181522] dark:text-white mt-0.5">
              {t.dashboard.recentTransactions}
            </h2>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              onClick={() => onOpenNewTx()}
              className="text-xs font-bold text-[#704BEA] dark:text-[#B8B0FF] hover:underline btn-tactile cursor-pointer"
            >
              {t.dashboard.addRecordBtn}
            </button>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-semibold text-[#6D657C] dark:text-[#B4ADC4] hover:text-[#181522] dark:hover:text-white flex items-center gap-0.5 btn-tactile cursor-pointer"
            >
              <span>{t.dashboard.viewAll}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Transactions List with Treats-inspired colored indicator bars */}
        <div className="divide-y divide-[#EDE7DE] dark:divide-[#282337]">
          {filteredTransactions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-[#181522] dark:text-white">
                {t.dashboard.noTxInPeriod(periodLabel.toLowerCase())}
              </p>
              <p className="text-xs text-[#726B82] dark:text-[#A7A0B8] mt-1">
                {t.dashboard.noTxInPeriodHint}
              </p>
              <button
                onClick={() => onOpenNewTx('EXPENSE')}
                className="mt-4 px-4 py-2 text-xs font-bold bg-[#121118] text-white dark:bg-[#B8B0FF] dark:text-[#121118] rounded-xl shadow-xs btn-tactile cursor-pointer"
              >
                {t.dashboard.recordTransaction}
              </button>
            </div>
          ) : filteredTransactions.slice(0, 6).map((tx) => {
            const category = categories.find((c) => c.id === tx.categoryId);
            const converted = convertCurrency(tx.amount, tx.currency, currency);
            const dateStr = new Date(tx.transactionDate).toLocaleDateString(getDateLocale(lang), {
              month: 'short',
              day: 'numeric',
            });

            // Status bar indicator color inspired by the Treats timeline
            const barColor = tx.type === 'INCOME' ? '#10B981' : tx.type === 'EXPENSE' ? '#704BEA' : '#FF941A';

            return (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction(tx)}
                className="py-2.5 sm:py-3.5 px-2 sm:px-3 -mx-1 sm:-mx-2 rounded-xl sm:rounded-2xl hover:bg-[#FBF8F2] dark:hover:bg-[#221E2E] transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 sm:gap-4 hover:translate-x-0.5 active:scale-[0.99]"
              >
                {/* Left: Treats Vertical Timeline Line & Info */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  {/* Vertical Colored Indicator Bar */}
                  <div 
                    className="w-1 sm:w-1.5 h-8 sm:h-9 rounded-full shrink-0" 
                    style={{ backgroundColor: barColor }} 
                  />

                  <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0 ${
                    tx.type === 'INCOME' ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' :
                    'bg-purple-50 dark:bg-purple-950/50 text-[#704BEA] dark:text-[#B8B0FF]'
                  }`}>
                    {tx.type === 'INCOME'
                      ? <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      : <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-semibold text-[#181522] dark:text-white truncate">
                      {tx.description}
                    </div>
                    {/* Unboxed metadata separated by '·' (§1.A Zero-Pill rule) */}
                    <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs text-[#726B82] dark:text-[#A7A0B8] mt-0.5 truncate">
                      <span className="shrink-0">{dateStr}</span>
                      {category && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{translateCategoryName(category, lang)}</span>
                        </>
                      )}
                      {tx.syncStatus === 'PENDING' && (
                        <span className="text-amber-500 font-medium shrink-0">· {t.dashboard.pendingBadge}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amount in Tabular Numbers */}
                <div className="text-right shrink-0">
                  <div className={`text-xs sm:text-sm font-mono font-bold tabular-nums ${
                    tx.type === 'INCOME' ? 'text-emerald-600 dark:text-emerald-400' :
                    tx.type === 'EXPENSE' ? 'text-rose-600 dark:text-rose-400' :
                    'text-[#181522] dark:text-[#EAE6F3]'
                  }`}>
                    {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}
                    {formatCurrency(converted, currency)}
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-[#878096] dark:text-[#A7A0B8] font-mono truncate">
                    {tx.currency !== currency && `${formatCurrency(tx.amount, tx.currency)} ${t.dashboard.origSuffix}`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

    </div>
  );
};
