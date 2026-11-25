import React, { useEffect } from 'react';
import { ArrowRight, ExternalLink, Sparkles, X } from 'lucide-react';
import { getDateLocale, useLanguage } from '../utils/i18n';
import { APP_VERSION, ReleaseUpdateInfo } from '../utils/updateChecker';

export interface UpdateModalProps {
  isOpen: boolean;
  release: ReleaseUpdateInfo | null;
  currentVersion?: string;
  onClose: () => void;
  onUpdateNow: (release: ReleaseUpdateInfo) => void;
}

function formatReleaseNotesLines(rawNotes: string): Array<{ isBullet: boolean; text: string }> {
  return rawNotes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^[-*_]{3,}$/.test(line))
    .map((line) => {
      if (/^[-*•]\s+/.test(line)) {
        return {
          isBullet: true,
          text: line.replace(/^[-*•]\s+/, '').trim(),
        };
      }
      return {
        isBullet: false,
        text: line.replace(/^#{1,6}\s+/, '').trim(),
      };
    })
    .filter((entry) => entry.text.length > 0);
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  release,
  currentVersion = APP_VERSION,
  onClose,
  onUpdateNow,
}) => {
  const { lang, t } = useLanguage();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !release) return null;

  let publishedLabel: string | null = null;
  if (release.publishedAt) {
    const parsedDate = new Date(release.publishedAt);
    if (!Number.isNaN(parsedDate.getTime())) {
      publishedLabel = parsedDate.toLocaleDateString(getDateLocale(lang), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  }

  const parsedNoteLines = release.notes ? formatReleaseNotesLines(release.notes) : [];

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
        aria-label={t.updateModal.title}
        className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-[#181720] rounded-t-[28px] sm:rounded-3xl border border-[#EAE5DC] dark:border-[#262432] shadow-2xl p-4 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 space-y-4"
      >
        <div className="mx-auto -mt-1 mb-1 h-1.5 w-10 rounded-full bg-[#DED6CA] dark:bg-[#3A3450] sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F1ECE3] dark:border-[#252230]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#704BEA]/15 dark:bg-[#B8B2FF]/15 text-[#704BEA] dark:text-[#B8B2FF] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[#16151D] dark:text-white truncate">
                {t.updateModal.title}
              </h3>
              <p className="text-xs text-[#706B82] dark:text-[#9D98AC] truncate">
                {t.updateModal.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.updateModal.closeAria}
            className="min-w-[44px] min-h-[44px] -my-2 -mr-2 flex items-center justify-center rounded-xl text-[#706B82] hover:text-[#16151D] dark:hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Version Comparison Card */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#704BEA] dark:text-[#B8B2FF]">
              {t.updateModal.versionLabel}
            </span>
            {publishedLabel && (
              <span className="text-[11px] font-mono text-[#706B82] dark:text-[#9D98AC]">
                {t.updateModal.publishedPrefix(publishedLabel)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono tabular-nums">
            <span className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#181720] border border-[#DDD7CD] dark:border-[#2D2A3B] text-xs font-semibold text-[#706B82] dark:text-[#9D98AC]">
              v{currentVersion}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-[#704BEA] dark:text-[#B8B2FF] shrink-0" />
            <span className="px-2.5 py-1 rounded-lg bg-[#704BEA] text-white dark:bg-[#B8B2FF] dark:text-[#121118] text-xs font-extrabold shadow-xs">
              v{release.version}
            </span>
          </div>

          <div className="text-sm font-bold text-[#16151D] dark:text-white break-words">
            {release.title}
          </div>
        </div>

        {/* Release Notes */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#EAE5DC] dark:border-[#2D2A3B] space-y-2">
          <div className="text-xs font-bold text-[#16151D] dark:text-white">
            {t.updateModal.releaseNotesTitle}
          </div>
          <div className="max-h-48 overflow-y-auto pr-1 space-y-1.5 text-xs leading-relaxed text-[#5B5670] dark:text-[#C5C0D4]">
            {parsedNoteLines.length > 0 ? (
              parsedNoteLines.map((item, idx) =>
                item.isBullet ? (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#704BEA] dark:bg-[#B8B2FF] shrink-0" />
                    <span className="min-w-0 break-words">{item.text}</span>
                  </div>
                ) : (
                  <p key={idx} className="break-words">
                    {item.text}
                  </p>
                )
              )
            ) : (
              <p>{t.updateModal.noReleaseNotes}</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row-reverse gap-2 pt-1">
          <button
            type="button"
            onClick={() => onUpdateNow(release)}
            className="w-full sm:flex-1 min-h-[44px] px-4 py-2.5 text-xs font-bold bg-[#704BEA] hover:bg-[#5E38DB] text-white dark:bg-[#B8B2FF] dark:text-[#121118] dark:hover:bg-[#A8A0FC] rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 btn-tactile cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            <span>{t.updateModal.updateNowBtn}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 text-xs font-semibold text-[#706B82] dark:text-[#9D98AC] bg-[#FAF7F2] dark:bg-[#1E1D27] border border-[#DDD7CD] dark:border-[#2D2A3B] hover:bg-[#F1ECE3] dark:hover:bg-[#262432] rounded-xl transition-colors cursor-pointer"
          >
            {t.updateModal.laterBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
