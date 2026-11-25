/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  CurrencyCode,
  Category,
  Transaction,
  Budget,
  RecurringTransaction,
  TransactionType,
} from './types';
import {
  INITIAL_CATEGORIES,
  formatCurrency,
} from './data/mockData';
import { BookOpen, CheckCircle2, Info, Trash2 } from 'lucide-react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetsView } from './components/BudgetsView';
import { ReportsView } from './components/ReportsView';
import { RecurringView } from './components/RecurringView';
import { TransactionModal } from './components/TransactionModal';
import { OfflineSyncModal } from './components/OfflineSyncModal';
import { CashBookModal } from './components/CashBookModal';
import { UpdateModal } from './components/UpdateModal';
import { LockScreen, SecuritySettingsModal } from './components/LockScreen';
import { AndroidBottomNav } from './components/AndroidBottomNav';
import { useTabSeo } from './utils/seo';
import { PeriodFilter } from './utils/finance';
import {
  APP_VERSION,
  ReleaseUpdateInfo,
  UpdateCheckResult,
  checkForAppUpdate,
  openReleaseUrl,
} from './utils/updateChecker';
import {
  AppStateSnapshot,
  loadAppState,
  loadThemePreference,
  saveAppState,
  saveThemePreference,
} from './utils/storage';
import { hasPinConfigured } from './utils/security';
import { useLanguage } from './utils/i18n';
import {
  addRecurringInterval,
  createId,
  endOfDay,
  parseDateOnly,
  recurringOccurrenceKey,
  toDateOnlyString,
} from './utils/finance';
import {
  RawFinanceNotification,
  acknowledgePendingNotifications,
  addNotificationListener,
  drainPendingNotifications,
  isNotificationCaptureSupported,
  isNotificationPermissionGranted,
  loadAutoRecordEnabled,
  saveAutoRecordEnabled,
} from './utils/notificationBridge';
import {
  loadProcessedNotificationIds,
  markNotificationIdsProcessed,
  parseBankNotification,
} from './utils/notificationParser';

type ToastTone = 'income' | 'expense' | 'info' | 'warning' | 'delete';

interface ToastState {
  id: number;
  message: string;
  tone: ToastTone;
}

const VALID_TABS = new Set([
  'dashboard',
  'transactions',
  'budgets',
  'reports',
  'recurring',
]);

export default function App() {
  const { t } = useLanguage();

  // Security Lock state
  const [hasPin, setHasPin] = useState<boolean>(() => hasPinConfigured());
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false);

  // Theme state
  const [isDark, setIsDark] = useState<boolean>(() => loadThemePreference() ?? false);

  // App Navigation state (always start at dashboard)
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  // Dynamic SEO & Document Head Metadata Service Hook
  useTabSeo(currentTab);

  // Currency & Filter states (currency locked to IDR)
  const currency: CurrencyCode = 'IDR';
  const [timeFilter, setTimeFilter] = useState<PeriodFilter>('this_month');

  // Data states (start clean with empty records on fresh installs)
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [isUnlockTransitioning, setIsUnlockTransitioning] = useState<boolean>(false);
  const isUnlockTransitioningRef = useRef<boolean>(false);
  isUnlockTransitioningRef.current = isUnlockTransitioning;
  const unlockTransitionTimerRef = useRef<number | null>(null);

  const startUnlockTransition = () => {
    if (unlockTransitionTimerRef.current !== null) {
      window.clearTimeout(unlockTransitionTimerRef.current);
    }
    isUnlockTransitioningRef.current = true;
    setIsUnlockTransitioning(true);
    unlockTransitionTimerRef.current = window.setTimeout(() => {
      unlockTransitionTimerRef.current = null;
      isUnlockTransitioningRef.current = false;
      setIsUnlockTransitioning(false);
    }, 250);
  };

  const showToast = (
    message: string,
    tone: ToastTone = 'info',
    durationMs: number = 2500
  ) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ id: Date.now(), message, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (unlockTransitionTimerRef.current !== null) {
        window.clearTimeout(unlockTransitionTimerRef.current);
      }
    };
  }, []);

  // Auto-Record Notification preference
  const [autoRecordEnabled, setAutoRecordEnabled] = useState<boolean>(() =>
    loadAutoRecordEnabled()
  );

  const handleToggleAutoRecord = (next: boolean) => {
    saveAutoRecordEnabled(next);
    setAutoRecordEnabled(next);
  };

  // Ref mirrors are updated immediately so rapid repeated actions cannot
  // re-post the same recurring occurrence before React re-renders.
  const categoriesRef = useRef(categories);
  const transactionsRef = useRef(transactions);
  const recurringRef = useRef(recurringList);
  const processingRecurringRef = useRef(false);
  const autoRecordEnabledRef = useRef(autoRecordEnabled);
  const syncingNotifsRef = useRef(false);
  const toastMessagesRef = useRef(t.toasts);
  toastMessagesRef.current = t.toasts;
  autoRecordEnabledRef.current = autoRecordEnabled;

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    recurringRef.current = recurringList;
  }, [recurringList]);

  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const isHydratedRef = useRef(isHydrated);
  isHydratedRef.current = isHydrated;
  const isUnlockedRef = useRef(isUnlocked);
  isUnlockedRef.current = isUnlocked;

  const applySnapshot = (snapshot: AppStateSnapshot) => {
    categoriesRef.current = snapshot.categories;
    transactionsRef.current = snapshot.transactions;
    recurringRef.current = snapshot.recurringList;
    setCategories(snapshot.categories);
    setTransactions(snapshot.transactions);
    setBudgets(snapshot.budgets);
    setRecurringList(snapshot.recurringList);
  };

  // Hydrate state from local storage on startup.
  useEffect(() => {
    let cancelled = false;

    loadAppState()
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          applySnapshot(saved);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every state change directly to local storage once hydrated.
  useEffect(() => {
    if (!isHydrated) return;

    const snapshot: AppStateSnapshot = {
      categories,
      transactions,
      budgets,
      recurringList,
      currency,
    };

    void saveAppState(snapshot);
  }, [
    categories,
    transactions,
    budgets,
    recurringList,
    currency,
    isHydrated,
  ]);

  const handleTabChange = (newTab: string) => {
    if (isUnlockTransitioningRef.current) return;
    if (!VALID_TABS.has(newTab) || newTab === currentTab) return;
    setCurrentTab(newTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Modals
  const [showTxModal, setShowTxModal] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [txModalType, setTxModalType] = useState<TransactionType>('EXPENSE');
  const [showDataModal, setShowDataModal] = useState<boolean>(false);
  const [showCashBookModal, setShowCashBookModal] = useState<boolean>(false);
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState<boolean>(false);
  const hasCheckedUpdateSessionRef = useRef<boolean>(false);

  // Android hardware/gesture back button handling
  const lastBackPressRef = useRef<number>(0);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const backExitMessageRef = useRef(t.toasts.pressBackToExit);
  backExitMessageRef.current = t.toasts.pressBackToExit;
  const backStateRef = useRef({
    isUnlocked,
    isChangingPin,
    showUpdateModal,
    showTxModal,
    showDataModal,
    showCashBookModal,
    showSecurityModal,
    currentTab,
  });
  backStateRef.current = {
    isUnlocked,
    isChangingPin,
    showUpdateModal,
    showTxModal,
    showDataModal,
    showCashBookModal,
    showSecurityModal,
    currentTab,
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removed = false;
    let listenerHandle: PluginListenerHandle | null = null;

    void CapacitorApp.addListener('backButton', () => {
      const state = backStateRef.current;

      // 1. Jika layar terkunci atau sedang mengubah PIN -> keluar aplikasi
      if (!state.isUnlocked || state.isChangingPin) {
        void CapacitorApp.exitApp();
        return;
      }

      // 2. Jika ada modal terbuka -> tutup modal tersebut
      if (state.showUpdateModal) {
        lastBackPressRef.current = 0;
        setShowUpdateModal(false);
        return;
      }
      if (state.showTxModal) {
        lastBackPressRef.current = 0;
        setShowTxModal(false);
        return;
      }
      if (state.showDataModal) {
        lastBackPressRef.current = 0;
        setShowDataModal(false);
        return;
      }
      if (state.showCashBookModal) {
        lastBackPressRef.current = 0;
        setShowCashBookModal(false);
        return;
      }
      if (state.showSecurityModal) {
        lastBackPressRef.current = 0;
        setShowSecurityModal(false);
        return;
      }

      // 3. Jika sedang di tab selain dashboard -> kembali ke dashboard
      if (state.currentTab !== 'dashboard') {
        lastBackPressRef.current = 0;
        setCurrentTab('dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // 4. Di dashboard tanpa modal -> konfirmasi tekan 2x dalam 2 detik
      const now = Date.now();
      if (now - lastBackPressRef.current <= 2000) {
        lastBackPressRef.current = 0;
        void CapacitorApp.exitApp();
      } else {
        lastBackPressRef.current = now;
        showToastRef.current(backExitMessageRef.current, 'info');
      }
    }).then((handle) => {
      if (removed) {
        void handle.remove();
      } else {
        listenerHandle = handle;
      }
    });

    return () => {
      removed = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  const ingestBankNotifications = (
    items: RawFinanceNotification[],
    options?: { force?: boolean }
  ): number => {
    if (
      !isHydratedRef.current ||
      !isUnlockedRef.current ||
      (!options?.force && !autoRecordEnabledRef.current) ||
      items.length === 0
    ) {
      return 0;
    }

    const processedSet = new Set(loadProcessedNotificationIds());
    const existingIdemKeys = new Set(
      transactionsRef.current.map((tx) => tx.idempotencyKey)
    );
    const seenIds: string[] = [];
    const createdTxs: Transaction[] = [];
    const recordedMeta: Array<{ appName: string; amount: number; txType: TransactionType }> = [];

    for (const item of items) {
      if (!item || !item.id || processedSet.has(item.id)) {
        continue;
      }

      processedSet.add(item.id);
      seenIds.push(item.id);

      const idempotencyKey = `notif-${item.id}`;
      if (existingIdemKeys.has(idempotencyKey)) {
        continue;
      }

      const parsed = parseBankNotification(item, categoriesRef.current);
      if (!parsed) {
        continue;
      }

      const txType: TransactionType = parsed.type === 'income' ? 'INCOME' : 'EXPENSE';
      const appTag = parsed.appName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const newTx: Transaction = {
        id: createId('tx'),
        categoryId: parsed.categoryId,
        type: txType,
        amount: parsed.amount,
        currency: 'IDR',
        description: parsed.description,
        notes: parsed.notes,
        transactionDate: new Date(`${parsed.date}T12:00:00`).toISOString(),
        tags: appTag ? ['auto-notif', appTag] : ['auto-notif'],
        idempotencyKey,
        syncStatus: 'SYNCED',
        createdAt: new Date().toISOString(),
      };

      createdTxs.push(newTx);
      existingIdemKeys.add(idempotencyKey);
      recordedMeta.push({
        appName: parsed.appName,
        amount: parsed.amount,
        txType,
      });
    }

    if (seenIds.length > 0) {
      markNotificationIdsProcessed(seenIds);
    }

    if (createdTxs.length > 0) {
      transactionsRef.current = [...createdTxs.reverse(), ...transactionsRef.current];
      setTransactions(transactionsRef.current);

      if (recordedMeta.length === 1) {
        const entry = recordedMeta[0];
        const sign = entry.txType === 'INCOME' ? '+' : '-';
        const formattedAmount = formatCurrency(entry.amount, 'IDR');
        showToastRef.current(
          toastMessagesRef.current.autoRecordedSingle(sign, formattedAmount, entry.appName),
          entry.txType === 'INCOME' ? 'income' : 'expense'
        );
      } else {
        showToastRef.current(
          toastMessagesRef.current.autoRecordedMultiple(recordedMeta.length),
          'info'
        );
      }
    }

    return createdTxs.length;
  };

  const syncPendingNotifications = async () => {
    if (
      !isNotificationCaptureSupported() ||
      !isHydratedRef.current ||
      !isUnlockedRef.current ||
      !autoRecordEnabledRef.current
    ) {
      return;
    }
    if (syncingNotifsRef.current) return;
    syncingNotifsRef.current = true;

    try {
      const granted = await isNotificationPermissionGranted();
      if (!granted || !isUnlockedRef.current || !autoRecordEnabledRef.current) return;
      const items = await drainPendingNotifications();
      if (!isUnlockedRef.current) return;
      ingestBankNotifications(items);
    } finally {
      syncingNotifsRef.current = false;
    }
  };

  useEffect(() => {
    if (!isNotificationCaptureSupported() || !isHydrated || !isUnlocked || !autoRecordEnabled) {
      return;
    }

    let removed = false;
    let appStateHandle: PluginListenerHandle | null = null;
    let notifHandle: PluginListenerHandle | null = null;

    void syncPendingNotifications();

    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive && !removed && isUnlockedRef.current) {
        void syncPendingNotifications();
      }
    }).then((handle) => {
      if (removed) {
        void handle.remove();
      } else {
        appStateHandle = handle;
      }
    });

    void addNotificationListener((item) => {
      if (!removed && isUnlockedRef.current && autoRecordEnabledRef.current) {
        ingestBankNotifications([item]);
        if (item?.id) {
          void acknowledgePendingNotifications([item.id]);
        }
      }
    }).then((handle) => {
      if (removed) {
        if (handle) void handle.remove();
      } else {
        notifHandle = handle;
      }
    });

    return () => {
      removed = true;
      if (appStateHandle) {
        void appStateHandle.remove();
      }
      if (notifHandle) {
        void notifHandle.remove();
      }
    };
  }, [isHydrated, isUnlocked, autoRecordEnabled]);

  const openNewTransaction = (type: TransactionType = 'EXPENSE') => {
    if (isUnlockTransitioningRef.current) return;
    setEditingTx(null);
    setTxModalType(type);
    setShowTxModal(true);
  };

  const openEditTransaction = (tx: Transaction) => {
    setEditingTx(tx);
    setTxModalType(tx.type);
    setShowTxModal(true);
  };

  // Sync dark class on documentElement and persist theme preference locally
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    saveThemePreference(isDark);
  }, [isDark]);

  const toggleTheme = () => setIsDark(!isDark);

  // Handlers for Transactions
  const handleSaveTransaction = (
    txData: Omit<Transaction, 'id' | 'idempotencyKey' | 'syncStatus' | 'createdAt'> & { id?: string }
  ) => {
    const existing = txData.id
      ? transactionsRef.current.find((t) => t.id === txData.id) ?? null
      : null;

    const newTx: Transaction = {
      ...txData,
      id: existing?.id ?? txData.id ?? createId('tx'),
      idempotencyKey: existing?.idempotencyKey ?? createId('idem'),
      syncStatus: 'SYNCED',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };

    if (existing) {
      transactionsRef.current = transactionsRef.current.map((tx) =>
        tx.id === newTx.id ? newTx : tx
      );
      setTransactions(transactionsRef.current);
    } else {
      transactionsRef.current = [newTx, ...transactionsRef.current];
      setTransactions(transactionsRef.current);
    }

    const formattedAmount = formatCurrency(newTx.amount, newTx.currency);
    if (existing) {
      showToast(t.toasts.txUpdated(newTx.description, formattedAmount), 'info');
    } else if (newTx.type === 'INCOME') {
      showToast(t.toasts.incomeAdded(formattedAmount), 'income');
    } else {
      showToast(t.toasts.expenseAdded(formattedAmount), 'expense');
    }
  };

  const handleDeleteTransaction = (id: string) => {
    const tx = transactionsRef.current.find((t) => t.id === id);
    if (!tx) return;

    const confirmed = window.confirm(
      t.toasts.confirmDeleteTx(tx.description)
    );
    if (!confirmed) return;

    transactionsRef.current = transactionsRef.current.filter((t) => t.id !== id);
    setTransactions(transactionsRef.current);
    const formattedAmount = formatCurrency(tx.amount, tx.currency);
    showToast(t.toasts.txDeleted(tx.description, formattedAmount), 'delete');
  };

  // Handlers for Budgets
  const handleSaveBudget = (budget: Budget) => {
    setBudgets((prev) => {
      const idx = prev.findIndex((b) => b.id === budget.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = budget;
        return copy;
      }
      return [...prev, budget];
    });
  };

  const handleDeleteBudget = (id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  // Handlers for Recurring
  const handleAddRecurring = (item: Omit<RecurringTransaction, 'id'>) => {
    const newItem: RecurringTransaction = {
      ...item,
      id: createId('rec'),
    };
    setRecurringList((prev) => [...prev, newItem]);
  };

  const handleToggleRecurringActive = (id: string) => {
    setRecurringList((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  /**
   * Posts every due occurrence exactly once, then advances nextRunDate.
   * The deterministic idempotency key (`rec-<id>-<YYYY-MM-DD>`) is the
   * duplicate guard, so pressing the button repeatedly is safe.
   */
  const handleProcessDueSchedules = (): number => {
    if (processingRecurringRef.current) return 0;
    processingRecurringRef.current = true;

    try {
      const now = new Date();
      const dueCutoff = endOfDay(now).getTime();
      const existingKeys = new Set(
        transactionsRef.current.map((tx) => tx.idempotencyKey)
      );

      const created: Transaction[] = [];
      let createdAny = false;

      const updatedSchedules = recurringRef.current.map((schedule) => {
        if (!schedule.isActive) return schedule;

        let cursor = parseDateOnly(schedule.nextRunDate);
        let guard = 0;
        let scheduleCreated = false;

        // Catch up overdue schedules, but cap runaway loops at 60 occurrences.
        while (cursor.getTime() <= dueCutoff && guard < 60) {
          const occurrenceDate = toDateOnlyString(cursor);
          const idempotencyKey = recurringOccurrenceKey(
            schedule.id,
            occurrenceDate
          );

          if (!existingKeys.has(idempotencyKey)) {
            const tx: Transaction = {
              id: createId('tx'),
              categoryId: schedule.categoryId,
              type: schedule.type,
              amount: schedule.amount,
              currency: schedule.currency,
              description: `[Auto-Scheduled] ${schedule.description}`,
              notes: `Recurring ${schedule.interval.toLowerCase()} entry for ${occurrenceDate}`,
              transactionDate: new Date(`${occurrenceDate}T12:00:00`).toISOString(),
              tags: ['recurring', 'auto-schedule'],
              idempotencyKey,
              syncStatus: 'SYNCED',
              createdAt: new Date().toISOString(),
            };

            created.push(tx);
            existingKeys.add(idempotencyKey);
            scheduleCreated = true;
            createdAny = true;
          }

          cursor = addRecurringInterval(cursor, schedule.interval);
          guard += 1;
        }

        return {
          ...schedule,
          nextRunDate: toDateOnlyString(cursor),
          lastRunDate: scheduleCreated
            ? toDateOnlyString(now)
            : schedule.lastRunDate,
        };
      });

      recurringRef.current = updatedSchedules;
      setRecurringList(updatedSchedules);

      if (createdAny) {
        transactionsRef.current = [...created, ...transactionsRef.current];
        setTransactions(transactionsRef.current);
      }

      return created.length;
    } finally {
      processingRecurringRef.current = false;
    }
  };

  const currentSnapshot: AppStateSnapshot = {
    categories,
    transactions,
    budgets,
    recurringList,
    currency,
  };

  const handleRestoreBackup = (snapshot: AppStateSnapshot) => {
    applySnapshot(snapshot);
  };

  const handleClearData = () => {
    applySnapshot({
      categories: INITIAL_CATEGORIES,
      transactions: [],
      budgets: [],
      recurringList: [],
      currency,
    });
  };

  const handleUnlockSuccess = () => {
    startUnlockTransition();
    setShowTxModal(false);
    setShowDataModal(false);
    setShowSecurityModal(false);
    setShowCashBookModal(false);
    setCurrentTab('dashboard');
    setHasPin(true);
    setIsUnlocked(true);
    window.scrollTo(0, 0);
  };

  const handleLockApp = () => {
    if (unlockTransitionTimerRef.current !== null) {
      window.clearTimeout(unlockTransitionTimerRef.current);
      unlockTransitionTimerRef.current = null;
    }
    isUnlockTransitioningRef.current = false;
    setIsUnlockTransitioning(false);
    setShowTxModal(false);
    setShowDataModal(false);
    setShowSecurityModal(false);
    setShowCashBookModal(false);
    setShowUpdateModal(false);
    setIsChangingPin(false);
    setCurrentTab('dashboard');
    setIsUnlocked(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (!isUnlocked || isChangingPin) return;
    window.scrollTo(0, 0);
    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isUnlocked, isChangingPin]);

  useEffect(() => {
    if (
      !isUnlocked ||
      isChangingPin ||
      isUnlockTransitioning ||
      currentTab !== 'dashboard' ||
      hasCheckedUpdateSessionRef.current
    ) {
      return;
    }

    hasCheckedUpdateSessionRef.current = true;
    let cancelled = false;

    void checkForAppUpdate(APP_VERSION)
      .then((result) => {
        if (cancelled || !isUnlockedRef.current) return;
        if (result.status === 'update_available') {
          setAvailableUpdate(result.release);
          setShowUpdateModal(true);
        }
      })
      .catch(() => {
        // Silent fail for offline-first resilience.
      });

    return () => {
      cancelled = true;
    };
  }, [isUnlocked, isChangingPin, isUnlockTransitioning, currentTab]);

  const handleManualCheckUpdate = async (): Promise<UpdateCheckResult> => {
    const result = await checkForAppUpdate(APP_VERSION);
    if (result.status === 'update_available') {
      showToast(t.backupModal.updateAvailableFound(result.release.version), 'income', 3500);
      setShowDataModal(false);
      setAvailableUpdate(result.release);
      setShowUpdateModal(true);
    } else if (result.status === 'up_to_date') {
      showToast(t.backupModal.updateUpToDate(result.currentVersion), 'income', 3500);
    } else {
      showToast(t.backupModal.updateCheckUnavailable, 'warning', 3500);
    }
    return result;
  };

  if (!isUnlocked) {
    return (
      <LockScreen
        mode={hasPin ? 'unlock' : 'setup'}
        onSuccess={handleUnlockSuccess}
      />
    );
  }

  if (isChangingPin) {
    return (
      <LockScreen
        mode="setup"
        isChangePin
        onCancel={() => setIsChangingPin(false)}
        onSuccess={() => {
          startUnlockTransition();
          setHasPin(true);
          setIsChangingPin(false);
        }}
      />
    );
  }

  const activeTab = VALID_TABS.has(currentTab) ? currentTab : 'dashboard';

  return (
    <div
      className={`min-h-screen bg-[#FBF8F2] dark:bg-[#121019] text-[#181522] dark:text-[#F5F3FA] transition-colors flex flex-col font-sans selection:bg-[#EFEAFE] selection:text-[#704BEA] ${
        isUnlockTransitioning ? 'pointer-events-none select-none' : ''
      }`}
    >
      {isUnlockTransitioning && (
        <div
          aria-hidden="true"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 z-[70] pointer-events-auto bg-transparent touch-none"
        />
      )}

      {/* In-App Toast Notification */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top,0px))] z-[60] px-3 flex justify-center pointer-events-none"
        >
          <div
            className={`pointer-events-auto max-w-md w-full sm:w-auto px-3.5 py-2.5 rounded-2xl shadow-xl border backdrop-blur-md flex items-center gap-2.5 text-xs font-semibold animate-fadeIn ${
              toast.tone === 'income'
                ? 'bg-emerald-950/95 text-emerald-50 border-emerald-500/40'
                : toast.tone === 'expense'
                  ? 'bg-[#181522]/95 text-white border-[#704BEA]/50'
                  : toast.tone === 'warning'
                    ? 'bg-amber-950/95 text-amber-50 border-amber-500/40'
                    : toast.tone === 'delete'
                      ? 'bg-rose-950/95 text-rose-50 border-rose-500/40'
                      : 'bg-[#181522]/95 text-white border-white/15'
            }`}
          >
            {toast.tone === 'delete' ? (
              <Trash2 className="w-4 h-4 shrink-0 text-rose-400" />
            ) : toast.tone === 'warning' ? (
              <Info className="w-4 h-4 shrink-0 text-amber-400" />
            ) : (
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${
                  toast.tone === 'income' ? 'text-emerald-400' : 'text-[#B8B0FF]'
                }`}
              />
            )}
            <span className="min-w-0 break-words">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Top App Bar (Unified Soft Modern Top Bar Contract) */}
      <Header
        currentTab={activeTab}
        setCurrentTab={handleTabChange}
        isDark={isDark}
        toggleTheme={toggleTheme}
        onOpenDataModal={() => setShowDataModal(true)}
        onOpenSecurityModal={() => setShowSecurityModal(true)}
        onLockApp={handleLockApp}
      />

      {/* Main Content Area (Fluid with responsive clearance for mobile floating dock) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 pb-32 sm:pb-28 md:pb-16">
        {activeTab === 'dashboard' && (
          <DashboardView
            transactions={transactions}
            categories={categories}
            budgets={budgets}
            currency={currency}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            onNavigateTab={handleTabChange}
            onSelectTransaction={openEditTransaction}
            onOpenNewTx={openNewTransaction}
            onOpenCashBook={() => setShowCashBookModal(true)}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            transactions={transactions}
            categories={categories}
            currency={currency}
            onOpenNewTx={() => openNewTransaction('EXPENSE')}
            onEditTx={openEditTransaction}
            onDeleteTx={handleDeleteTransaction}
          />
        )}

        {activeTab === 'budgets' && (
          <BudgetsView
            budgets={budgets}
            categories={categories}
            transactions={transactions}
            currency={currency}
            onSaveBudget={handleSaveBudget}
            onDeleteBudget={handleDeleteBudget}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            transactions={transactions}
            categories={categories}
            currency={currency}
          />
        )}

        {activeTab === 'recurring' && (
          <RecurringView
            recurringList={recurringList}
            categories={categories}
            currency={currency}
            onAddRecurring={handleAddRecurring}
            onProcessDueSchedules={handleProcessDueSchedules}
            onToggleActive={handleToggleRecurringActive}
          />
        )}

      </main>

      {/* Mobile Bottom Navigation (Visible strictly on mobile screens, hidden on desktop) */}
      <AndroidBottomNav
        currentTab={activeTab}
        setCurrentTab={handleTabChange}
        onOpenNewTx={() => openNewTransaction('EXPENSE')}
        disabled={isUnlockTransitioning}
      />

      {/* Quiet, Minimalist Editorial Footer (§1.B Anti-slop) */}
      <footer className="mt-auto border-t border-[#EDE7DE] dark:border-[#22202E] bg-white/70 dark:bg-[#0E0D13]/70 backdrop-blur-xs py-6 mb-24 md:mb-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#706B82] dark:text-[#9D98AC]">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="font-semibold text-[#16151D] dark:text-white">Financial Tracker</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setShowCashBookModal(true)}
              aria-label={t.footer.openCashBookAria}
              className="min-h-[44px] px-2.5 rounded-xl font-medium text-[#704BEA] dark:text-[#B8B0FF] hover:bg-[#704BEA]/10 dark:hover:bg-[#B8B0FF]/15 transition-colors inline-flex items-center gap-1.5 cursor-pointer btn-tactile focus:outline-none focus-visible:ring-2 focus-visible:ring-[#704BEA]"
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" />
              <span>{t.footer.tagline}</span>
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowDataModal(true)}
              className="min-h-[44px] px-2 hover:text-[#16151D] dark:hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>{t.footer.backupData}</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Transaction Add / Edit Modal */}
      <TransactionModal
        isOpen={showTxModal}
        onClose={() => setShowTxModal(false)}
        onSave={handleSaveTransaction}
        editingTransaction={editingTx}
        initialType={txModalType}
        categories={categories}
        currency={currency}
      />

      {/* Local Data Management & Backup Modal */}
      <OfflineSyncModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        snapshot={currentSnapshot}
        onRestoreBackup={handleRestoreBackup}
        onClearData={handleClearData}
        autoRecordEnabled={autoRecordEnabled}
        onToggleAutoRecord={handleToggleAutoRecord}
        onSyncPendingNotifications={syncPendingNotifications}
        onCheckForUpdate={handleManualCheckUpdate}
      />

      {/* Local Rupiah Cash Book Modal */}
      <CashBookModal
        isOpen={showCashBookModal}
        onClose={() => setShowCashBookModal(false)}
        transactions={transactions}
        categories={categories}
        currency={currency}
        onSaveTransaction={handleSaveTransaction}
        onNotify={(message) => showToast(message, 'info')}
      />

      {/* Local PIN & Biometric Security Settings Modal */}
      <SecuritySettingsModal
        isOpen={showSecurityModal}
        onClose={() => setShowSecurityModal(false)}
        onChangePin={() => {
          setShowSecurityModal(false);
          setIsChangingPin(true);
        }}
        onLockNow={handleLockApp}
      />

      {/* In-App Update Notification Modal */}
      <UpdateModal
        isOpen={showUpdateModal}
        release={availableUpdate}
        currentVersion={APP_VERSION}
        onClose={() => setShowUpdateModal(false)}
        onUpdateNow={(release) => {
          openReleaseUrl(release);
          setShowUpdateModal(false);
        }}
      />

    </div>
  );
}
