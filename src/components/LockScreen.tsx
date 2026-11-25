import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Delete,
  Fingerprint,
  KeyRound,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  BiometricSupportInfo,
  PIN_LENGTH,
  authenticateWithBiometric,
  checkBiometricSupport,
  isBiometricEnabled,
  savePinConfig,
  setBiometricEnabled,
  verifyPin,
} from '../utils/security';
import {
  translateBiometryLabel,
  translateServiceMessage,
  useLanguage,
} from '../utils/i18n';

export interface LockScreenProps {
  mode: 'setup' | 'unlock';
  isChangePin?: boolean;
  onSuccess: () => void;
  onCancel?: () => void;
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export const LockScreen: React.FC<LockScreenProps> = ({
  mode,
  isChangePin = false,
  onSuccess,
  onCancel,
}) => {
  const { lang, t } = useLanguage();
  const [step, setStep] = useState<'create' | 'confirm'>('create');
  const [firstPin, setFirstPin] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPromptingBiometric, setIsPromptingBiometric] = useState<boolean>(false);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);
  const [biometricInfo, setBiometricInfo] = useState<BiometricSupportInfo>({
    isAvailable: false,
    isNative: false,
    label: 'Biometrik',
  });
  const [biometricChoice, setBiometricChoice] = useState<boolean>(() =>
    isChangePin ? isBiometricEnabled() : true
  );
  const [biometricConfigured] = useState<boolean>(() => isBiometricEnabled());

  const autoPromptTriggeredRef = useRef<boolean>(false);
  const unlockedRef = useRef<boolean>(false);
  const unlockTimerRef = useRef<number | null>(null);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const isInputLocked = isSubmitting || isPromptingBiometric || isUnlocking;

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = null;
      }
    };
  }, []);

  const triggerUnlockSuccess = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    setIsUnlocking(true);
    setErrorMessage(null);
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
    }
    unlockTimerRef.current = window.setTimeout(() => {
      unlockTimerRef.current = null;
      onSuccessRef.current();
    }, 150);
  }, []);

  const biometricLabel = translateBiometryLabel(biometricInfo.label, lang);

  const handleBiometricAuth = useCallback(async () => {
    if (isPromptingBiometric || isSubmitting || isUnlocking) return;
    setIsPromptingBiometric(true);
    setErrorMessage(null);

    try {
      const result = await authenticateWithBiometric(t.lockScreen.biometricReason);
      if (result.success) {
        triggerUnlockSuccess();
        return;
      }
      if (!result.cancelled && result.error) {
        setErrorMessage(translateServiceMessage(result.error, lang));
      }
    } finally {
      setIsPromptingBiometric(false);
    }
  }, [isPromptingBiometric, isSubmitting, isUnlocking, triggerUnlockSuccess, t.lockScreen.biometricReason, lang]);

  const handleBiometricAuthRef = useRef(handleBiometricAuth);
  handleBiometricAuthRef.current = handleBiometricAuth;

  useEffect(() => {
    let cancelled = false;
    unlockedRef.current = false;
    autoPromptTriggeredRef.current = false;
    if (unlockTimerRef.current !== null) {
      window.clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setStep('create');
    setFirstPin('');
    setPinInput('');
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsUnlocking(false);

    checkBiometricSupport().then((info) => {
      if (cancelled) return;
      setBiometricInfo(info);

      if (
        mode === 'unlock' &&
        info.isAvailable &&
        isBiometricEnabled() &&
        !autoPromptTriggeredRef.current
      ) {
        autoPromptTriggeredRef.current = true;
        void handleBiometricAuthRef.current();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mode, isChangePin]);

  const submitCompletePin = useCallback(
    async (completedPin: string) => {
      if (mode === 'setup') {
        if (step === 'create') {
          setFirstPin(completedPin);
          setPinInput('');
          setErrorMessage(null);
          setStep('confirm');
          return;
        }

        if (completedPin !== firstPin) {
          setErrorMessage(t.lockScreen.mismatchError);
          setPinInput('');
          return;
        }

        setIsSubmitting(true);
        try {
          await savePinConfig(
            completedPin,
            biometricInfo.isAvailable ? biometricChoice : false
          );
          triggerUnlockSuccess();
        } catch {
          setErrorMessage(t.lockScreen.savePinError);
          setPinInput('');
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      setIsSubmitting(true);
      try {
        const valid = await verifyPin(completedPin);
        if (valid) {
          triggerUnlockSuccess();
        } else {
          setErrorMessage(t.lockScreen.wrongPinError);
          setPinInput('');
        }
      } catch {
        setErrorMessage(t.lockScreen.verifyError);
        setPinInput('');
      } finally {
        setIsSubmitting(false);
      }
    },
    [mode, step, firstPin, biometricInfo.isAvailable, biometricChoice, triggerUnlockSuccess, t.lockScreen]
  );

  const appendDigit = useCallback(
    (digit: string) => {
      if (isInputLocked || pinInput.length >= PIN_LENGTH) return;
      const next = `${pinInput}${digit}`;
      setPinInput(next);
      setErrorMessage(null);

      if (next.length === PIN_LENGTH) {
        void submitCompletePin(next);
      }
    },
    [isInputLocked, pinInput, submitCompletePin]
  );

  const removeLastDigit = useCallback(() => {
    if (isInputLocked || pinInput.length === 0) return;
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMessage(null);
  }, [isInputLocked, pinInput.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        appendDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        removeLastDigit();
      } else if (event.key === 'Escape' && onCancel && !isInputLocked) {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [appendDigit, removeLastDigit, onCancel, isInputLocked]);

  const title =
    mode === 'setup'
      ? step === 'create'
        ? isChangePin
          ? t.lockScreen.createNewPin
          : t.lockScreen.secureWallet
        : t.lockScreen.confirmNewPin
      : 'Financial Tracker';

  const subtitle =
    mode === 'setup'
      ? step === 'create'
        ? t.lockScreen.setupSubtitle
        : t.lockScreen.confirmSubtitle
      : biometricConfigured && biometricInfo.isAvailable
        ? t.lockScreen.unlockSubtitleBiometric(biometricLabel)
        : t.lockScreen.unlockSubtitlePin;

  const showUnlockBiometric =
    mode === 'unlock' && biometricConfigured && biometricInfo.isAvailable;

  return (
    <div className="min-h-[100dvh] w-full overflow-y-auto overflow-x-hidden bg-[#FBF8F2] dark:bg-[#121019] text-[#181522] dark:text-[#F5F3FA] flex flex-col items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] select-none touch-manipulation">
      {/* Top Bar */}
      <div className="w-full max-w-[360px] flex items-center justify-between min-h-[44px]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#704BEA] to-[#8A66F5] text-white flex items-center justify-center font-black text-xs tracking-wider shadow-xs shrink-0">
            FT
          </div>
          <span className="text-xs font-bold tracking-tight text-[#706B82] dark:text-[#9D98AC] truncate">
            {t.lockScreen.localSecurity}
          </span>
        </div>

        {onCancel && (
          <button
            type="button"
            disabled={isInputLocked}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }}
            className="min-h-[44px] px-3 text-xs font-semibold text-[#706B82] dark:text-[#9D98AC] hover:text-[#16151D] dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer touch-manipulation select-none disabled:opacity-50"
          >
            {t.common.cancel}
          </button>
        )}
      </div>

      {/* Center Header & PIN Dots */}
      <div className="w-full max-w-[360px] flex flex-col items-center text-center my-auto py-2 sm:py-3">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-[#704BEA] to-[#8A66F5] text-white flex items-center justify-center shadow-md mb-3 sm:mb-4">
          {mode === 'setup' ? (
            <ShieldCheck className="w-6 h-6" />
          ) : (
            <Lock className="w-6 h-6" />
          )}
        </div>

        <h1 className="text-xl font-extrabold tracking-tight text-[#16151D] dark:text-white">
          {title}
        </h1>
        <p className="text-xs text-[#706B82] dark:text-[#9D98AC] mt-1.5 max-w-[290px]">
          {subtitle}
        </p>

        {/* 6-Digit PIN Indicators */}
        <div
          className="flex items-center justify-center gap-3 sm:gap-3.5 my-4 sm:my-5"
          aria-label={t.lockScreen.pinProgressAria(
            isUnlocking ? PIN_LENGTH : pinInput.length,
            PIN_LENGTH
          )}
        >
          {Array.from({ length: PIN_LENGTH }, (_, idx) => {
            const filled = isUnlocking || idx < pinInput.length;
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                  filled
                    ? 'bg-[#704BEA] dark:bg-[#B8B2FF] scale-110 shadow-xs'
                    : 'border-2 border-[#D2C9BA] dark:border-[#3A3450] bg-transparent'
                }`}
              />
            );
          })}
        </div>

        {/* Fixed-height Feedback Slot */}
        <div className="min-h-[20px] px-2 text-xs font-medium text-rose-600 dark:text-rose-400">
          {errorMessage ?? (isSubmitting ? t.lockScreen.verifyingPin : '')}
        </div>

        {/* Biometric Option Card in Setup Mode */}
        {mode === 'setup' && (
          <div className="w-full max-w-[320px] mt-3 p-3 rounded-2xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] flex items-center justify-between gap-3 text-left shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FAF7F2] dark:bg-[#252230] text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#16151D] dark:text-white truncate">
                  {t.lockScreen.enableBiometric(biometricLabel)}
                </div>
                <div className="text-[11px] text-[#706B82] dark:text-[#9D98AC] truncate">
                  {biometricInfo.isAvailable
                    ? t.lockScreen.biometricAvailableHint
                    : t.lockScreen.biometricAndroidHint}
                </div>
              </div>
            </div>

            {biometricInfo.isAvailable ? (
              <button
                type="button"
                role="switch"
                aria-checked={biometricChoice}
                aria-label={t.lockScreen.enableBiometric(biometricLabel)}
                onClick={() => setBiometricChoice((prev) => !prev)}
                className="min-w-[48px] min-h-[44px] flex items-center justify-end shrink-0 cursor-pointer"
              >
                <span
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                    biometricChoice
                      ? 'bg-[#704BEA] dark:bg-[#B8B2FF]'
                      : 'bg-[#DDD7CD] dark:bg-[#2D2A3B]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white dark:bg-[#121019] shadow-xs transition-transform ${
                      biometricChoice ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-[#FAF7F2] dark:bg-[#252230] text-[#706B82] dark:text-[#9D98AC] shrink-0">
                Android
              </span>
            )}
          </div>
        )}

        {/* Quick Biometric Button in Unlock Mode */}
        {showUnlockBiometric && (
          <button
            type="button"
            disabled={isInputLocked}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleBiometricAuth();
            }}
            className="mt-2 max-w-full min-h-[44px] px-4 py-2 text-xs font-bold text-[#704BEA] dark:text-[#B8B2FF] bg-[#704BEA]/10 dark:bg-[#B8B2FF]/15 hover:bg-[#704BEA]/15 dark:hover:bg-[#B8B2FF]/20 rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer touch-manipulation select-none disabled:opacity-50"
          >
            <Fingerprint className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {isPromptingBiometric
                ? t.lockScreen.waitingVerification
                : t.lockScreen.unlockWithBiometric(biometricLabel)}
            </span>
          </button>
        )}
      </div>

      {/* Large Touch-Friendly Numeric Keypad */}
      <div className="w-full max-w-[300px] sm:max-w-[320px] pb-1">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {KEYPAD_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={isInputLocked}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                appendDigit(digit);
              }}
              className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px] rounded-2xl text-xl font-bold tabular-nums text-[#16151D] dark:text-white bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] shadow-xs hover:bg-[#FAF7F2] dark:hover:bg-[#22202E] active:scale-95 active:bg-[#F1ECE3] dark:active:bg-[#252230] transition-all flex items-center justify-center cursor-pointer touch-manipulation select-none disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          {/* Bottom-Left Slot */}
          {showUnlockBiometric ? (
            <button
              type="button"
              disabled={isInputLocked}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleBiometricAuth();
              }}
              aria-label={t.lockScreen.unlockWithBiometric(biometricLabel)}
              className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px] rounded-2xl bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] shadow-xs hover:bg-[#FAF7F2] dark:hover:bg-[#22202E] active:scale-95 transition-all flex items-center justify-center cursor-pointer touch-manipulation select-none disabled:opacity-50"
            >
              <Fingerprint className="w-6 h-6 text-[#704BEA] dark:text-[#B8B2FF]" />
            </button>
          ) : mode === 'setup' && step === 'confirm' ? (
            <button
              type="button"
              disabled={isInputLocked}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStep('create');
                setFirstPin('');
                setPinInput('');
                setErrorMessage(null);
              }}
              className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px] rounded-2xl text-xs font-semibold text-[#706B82] dark:text-[#9D98AC] hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center cursor-pointer touch-manipulation select-none disabled:opacity-50"
            >
              {t.lockScreen.repeat}
            </button>
          ) : (
            <div aria-hidden="true" className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px]" />
          )}

          {/* Digit 0 */}
          <button
            type="button"
            disabled={isInputLocked}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              appendDigit('0');
            }}
            className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px] rounded-2xl text-xl font-bold tabular-nums text-[#16151D] dark:text-white bg-white dark:bg-[#181720] border border-[#EAE5DC] dark:border-[#262432] shadow-xs hover:bg-[#FAF7F2] dark:hover:bg-[#22202E] active:scale-95 active:bg-[#F1ECE3] dark:active:bg-[#252230] transition-all flex items-center justify-center cursor-pointer touch-manipulation select-none disabled:opacity-50"
          >
            0
          </button>

          {/* Delete Digit */}
          <button
            type="button"
            disabled={pinInput.length === 0 || isInputLocked}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              removeLastDigit();
            }}
            aria-label={t.lockScreen.deleteDigitAria}
            className="min-h-[48px] h-[52px] sm:min-h-[56px] sm:h-[56px] rounded-2xl text-[#706B82] dark:text-[#9D98AC] bg-white/70 dark:bg-[#181720]/70 border border-[#EAE5DC] dark:border-[#262432] hover:text-[#16151D] dark:hover:text-white active:scale-95 transition-all flex items-center justify-center cursor-pointer touch-manipulation select-none disabled:opacity-40"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChangePin: () => void;
  onLockNow: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  onChangePin,
  onLockNow,
}) => {
  const { lang, t } = useLanguage();
  const [biometricEnabled, setBiometricEnabledState] = useState<boolean>(() =>
    isBiometricEnabled()
  );
  const [biometricInfo, setBiometricInfo] = useState<BiometricSupportInfo>({
    isAvailable: false,
    isNative: false,
    label: 'Biometrik',
  });
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  const biometricLabel = translateBiometryLabel(biometricInfo.label, lang);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setBiometricEnabledState(isBiometricEnabled());
    setFeedback(null);

    checkBiometricSupport().then((info) => {
      if (!cancelled) setBiometricInfo(info);
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleBiometric = async () => {
    if (!biometricInfo.isAvailable || isBusy) return;
    setFeedback(null);

    if (biometricEnabled) {
      setBiometricEnabled(false);
      setBiometricEnabledState(false);
      setFeedback({
        type: 'success',
        message: t.lockScreen.biometricDisabledSuccess,
      });
      return;
    }

    setIsBusy(true);
    try {
      const auth = await authenticateWithBiometric(
        t.lockScreen.confirmBiometricPrompt(biometricLabel)
      );
      if (auth.success) {
        setBiometricEnabled(true);
        setBiometricEnabledState(true);
        setFeedback({
          type: 'success',
          message: t.lockScreen.biometricEnabledSuccess(biometricLabel),
        });
      } else if (!auth.cancelled && auth.error) {
        setFeedback({
          type: 'error',
          message: translateServiceMessage(auth.error, lang),
        });
      }
    } finally {
      setIsBusy(false);
    }
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
        aria-label={t.lockScreen.settingsTitle}
        className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#181720] rounded-t-[28px] sm:rounded-3xl border border-[#EAE5DC] dark:border-[#262432] shadow-2xl p-4 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4"
      >
        <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 rounded-full bg-[#DED6CA] dark:bg-[#3A3450] sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F1ECE3] dark:border-[#252230]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#FAF7F2] dark:bg-[#252230] text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[#16151D] dark:text-white truncate">
                {t.lockScreen.settingsTitle}
              </h3>
              <p className="text-xs text-[#706B82] dark:text-[#9D98AC] truncate">
                {t.lockScreen.settingsSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.lockScreen.settingsCloseAria}
            className="min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl text-[#706B82] hover:text-[#16151D] dark:hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Cards */}
        <div className="space-y-3">
          <div className="p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#16151D] dark:text-white truncate">
                  {t.lockScreen.pinActiveTitle}
                </div>
                <div className="text-[11px] text-[#706B82] dark:text-[#9D98AC] truncate">
                  {t.lockScreen.pinActiveDesc}
                </div>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shrink-0">
              {t.lockScreen.statusActive}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#704BEA]/15 text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#16151D] dark:text-white truncate">
                  {t.lockScreen.biometricTitle(biometricLabel)}
                </div>
                <div className="text-[11px] text-[#706B82] dark:text-[#9D98AC]">
                  {biometricInfo.isAvailable
                    ? biometricEnabled
                      ? t.lockScreen.biometricEnabledDesc
                      : t.lockScreen.biometricDisabledDesc
                    : t.lockScreen.biometricUnavailableDesc}
                </div>
              </div>
            </div>

            {biometricInfo.isAvailable ? (
              <button
                type="button"
                role="switch"
                aria-checked={biometricEnabled}
                aria-label={t.lockScreen.biometricTitle(biometricLabel)}
                disabled={isBusy}
                onClick={() => void handleToggleBiometric()}
                className="min-w-[48px] min-h-[44px] flex items-center justify-end shrink-0 cursor-pointer disabled:opacity-50"
              >
                <span
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                    biometricEnabled
                      ? 'bg-[#704BEA] dark:bg-[#B8B2FF]'
                      : 'bg-[#DDD7CD] dark:bg-[#2D2A3B]'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-white dark:bg-[#121019] shadow-xs transition-transform ${
                      biometricEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            ) : (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white dark:bg-[#181720] border border-[#DDD7CD] dark:border-[#2D2A3B] text-[#706B82] dark:text-[#9D98AC] shrink-0">
                {t.lockScreen.unavailableBadge}
              </span>
            )}
          </div>
        </div>

        {/* Feedback Banner */}
        {feedback && (
          <div
            role="status"
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            )}
            <span className="min-w-0 break-words">{feedback.message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={onChangePin}
            className="w-full min-h-[44px] px-4 py-2.5 text-xs font-bold bg-[#121118] text-white dark:bg-[#B8B2FF] dark:text-[#121118] hover:bg-[#252230] dark:hover:bg-[#A8A0FC] rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 btn-tactile cursor-pointer"
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span>{t.lockScreen.changePinBtn}</span>
          </button>

          <button
            type="button"
            onClick={onLockNow}
            className="w-full min-h-[44px] px-4 py-2.5 text-xs font-semibold text-[#16151D] dark:text-[#F4F2F8] bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] hover:bg-[#F1ECE3] dark:hover:bg-[#262432] rounded-xl transition-colors flex items-center justify-center gap-2 btn-tactile cursor-pointer"
          >
            <Lock className="w-4 h-4 shrink-0 text-[#704BEA] dark:text-[#B8B2FF]" />
            <span>{t.lockScreen.lockNowBtn}</span>
          </button>
        </div>

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
