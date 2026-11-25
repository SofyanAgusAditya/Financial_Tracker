import React, { useState } from 'react';
import { 
  Sun, 
  Moon, 
  Database,
  Repeat,
  ChevronDown,
  Sparkles,
  ShieldCheck,
  Lock
} from 'lucide-react';
import { useLanguage } from '../utils/i18n';

interface HeaderProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  isDark: boolean;
  toggleTheme: () => void;
  onOpenDataModal: () => void;
  onOpenSecurityModal: () => void;
  onLockApp: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  setCurrentTab,
  isDark,
  toggleTheme,
  onOpenDataModal,
  onOpenSecurityModal,
  onLockApp,
}) => {
  const { lang, setLang, t } = useLanguage();
  const [toolsDropdownOpen, setToolsDropdownOpen] = useState(false);

  const mainNavItems = [
    { id: 'dashboard', label: t.header.navOverview },
    { id: 'transactions', label: t.header.navLedger },
    { id: 'budgets', label: t.header.navBudgets },
    { id: 'reports', label: t.header.navAnalytics },
  ];

  return (
    <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top,0px)] bg-[#FBF8F2]/95 dark:bg-[#121019]/95 backdrop-blur-md border-b border-[#EDE7DE] dark:border-[#262234] text-[#181522] dark:text-[#F5F3FA] transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 sm:h-16 gap-2 sm:gap-6">
          
          {/* Zone 1: Single Brand Wordmark in Display Typography */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className="flex items-center gap-2 sm:gap-2.5 text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#704BEA] rounded-xl sm:rounded-2xl btn-tactile cursor-pointer min-w-0 max-w-full"
              aria-label="Financial Tracker"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-[#704BEA] to-[#8A66F5] text-white flex items-center justify-center font-black text-xs tracking-wider shadow-sm transition-transform group-hover:scale-105 shrink-0">
                FT
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] sm:text-base font-extrabold tracking-tight text-[#181522] dark:text-white leading-tight truncate">
                  Financial Tracker
                </span>
                <span className="hidden sm:inline text-[10px] text-[#726B82] dark:text-[#A7A0B8] font-semibold tracking-wide">
                  {t.header.brandSubtitle}
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Clean single-line desktop navigation links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 p-1 bg-[#F4EFE6]/70 dark:bg-[#1A1726]/70 rounded-2xl border border-[#E5DDD0]/70 dark:border-[#2C273C]/70">
            {mainNavItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentTab(item.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 btn-tactile cursor-pointer ${
                    isActive
                      ? 'bg-[#121019] text-white dark:bg-[#B8B0FF] dark:text-[#121019] shadow-xs scale-[1.02]'
                      : 'text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#181522] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Functional Controls & Compact Language Switcher */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            
            {/* Compact Language Switcher (ID / EN) */}
            <div
              role="group"
              aria-label={t.header.switchLanguage}
              className="inline-flex items-center p-0.5 rounded-xl sm:rounded-2xl border border-[#E5DDD0] dark:border-[#2E283F] bg-white dark:bg-[#1A1726] shrink-0"
            >
              {(['id', 'en'] as const).map((code) => {
                const isSelected = lang === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={isSelected}
                    className={`min-h-[36px] sm:min-h-[38px] px-1.5 sm:px-2.5 text-[11px] font-bold uppercase rounded-lg sm:rounded-xl transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#121019] text-white dark:bg-[#B8B0FF] dark:text-[#121019] shadow-xs'
                        : 'text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#181522] dark:hover:text-white'
                    }`}
                  >
                    {code.toUpperCase()}
                  </button>
                );
              })}
            </div>

            {/* Tools Dropdown */}
            <div className="relative">
              <button
                onClick={() => setToolsDropdownOpen(!toolsDropdownOpen)}
                className={`min-h-[36px] sm:min-h-[38px] px-2 sm:px-2.5 py-1.5 rounded-xl sm:rounded-2xl text-xs font-semibold flex items-center gap-1 sm:gap-1.5 transition-colors border btn-tactile cursor-pointer ${
                  currentTab === 'recurring'
                    ? 'bg-[#F4EFE6] dark:bg-[#282536] border-[#E5DDD0] dark:border-[#38344D] text-[#181522] dark:text-white'
                    : 'border-[#E5DDD0] dark:border-[#2E283F] bg-white dark:bg-[#1A1726] text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#181522] dark:hover:text-white'
                }`}
                title={t.header.toolsTitle}
                aria-label={t.header.toolsTitle}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#704BEA] dark:text-[#B8B0FF]" />
                <span className="hidden sm:inline">{t.header.tools}</span>
                <ChevronDown className="w-3 h-3 opacity-60 hidden sm:inline" />
              </button>

              {toolsDropdownOpen && (
                <div 
                  className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#1A1726] rounded-2xl border border-[#E5DDD0] dark:border-[#2E283F] shadow-xl py-1.5 z-50 text-xs text-[#181522] dark:text-[#F5F3FA] animate-fadeIn"
                  onMouseLeave={() => setToolsDropdownOpen(false)}
                >
                  <button
                    onClick={() => {
                      setCurrentTab('recurring');
                      setToolsDropdownOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[#FBF8F2] dark:hover:bg-[#252132] transition-colors btn-tactile"
                  >
                    <Repeat className="w-4 h-4 shrink-0 text-[#704BEA] dark:text-[#B8B0FF]" />
                    <span>{t.common.recurringSchedules}</span>
                  </button>

                  <div className="border-t border-[#EDE7DE] dark:border-[#2C273B] my-1" />

                  <button
                    onClick={() => {
                      onOpenDataModal();
                      setToolsDropdownOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[#FBF8F2] dark:hover:bg-[#252132] transition-colors btn-tactile"
                  >
                    <Database className="w-4 h-4 shrink-0 text-[#704BEA] dark:text-[#B8B0FF]" />
                    <span>{t.common.backupData}</span>
                  </button>

                  <button
                    onClick={() => {
                      onOpenSecurityModal();
                      setToolsDropdownOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[#FBF8F2] dark:hover:bg-[#252132] transition-colors btn-tactile"
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0 text-[#704BEA] dark:text-[#B8B0FF]" />
                    <span>{t.common.securityMenu}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Backup & Data Button (hidden on mobile to prevent overflow; available in Tools) */}
            <button
              onClick={onOpenDataModal}
              aria-label={t.common.backupData}
              className="hidden sm:flex p-2 rounded-2xl text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#704BEA] dark:hover:text-[#B8B0FF] border border-[#E5DDD0] dark:border-[#2E283F] bg-white dark:bg-[#1A1726] btn-tactile cursor-pointer"
              title={t.common.backupData}
            >
              <Database className="w-3.5 h-3.5" />
            </button>

            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={t.header.toggleTheme}
              className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#181522] dark:hover:text-white border border-[#E5DDD0] dark:border-[#2E283F] bg-white dark:bg-[#1A1726] btn-tactile cursor-pointer flex items-center justify-center"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-[#544F63]" />}
            </button>

            {/* Compact Lock App Button */}
            <button
              type="button"
              onClick={() => {
                setToolsDropdownOpen(false);
                onLockApp();
              }}
              aria-label={t.header.lockApp}
              title={t.header.lockApp}
              className="min-h-[36px] min-w-[36px] sm:min-h-[38px] sm:min-w-[38px] p-1.5 sm:p-2 rounded-xl sm:rounded-2xl text-[#6D657C] dark:text-[#A7A0B8] hover:text-[#704BEA] dark:hover:text-[#B8B0FF] border border-[#E5DDD0] dark:border-[#2E283F] bg-white dark:bg-[#1A1726] btn-tactile cursor-pointer flex items-center justify-center"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
