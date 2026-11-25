import React from 'react';
import { 
  LayoutDashboard, 
  ReceiptText, 
  Target, 
  BarChart3, 
  Plus
} from 'lucide-react';
import { useLanguage } from '../utils/i18n';

interface AndroidBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onOpenNewTx: () => void;
  disabled?: boolean;
}

export const AndroidBottomNav: React.FC<AndroidBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  onOpenNewTx,
  disabled = false,
}) => {
  const { t } = useLanguage();

  const navItems = [
    { id: 'dashboard', label: t.bottomNav.home, icon: LayoutDashboard },
    { id: 'transactions', label: t.bottomNav.ledger, icon: ReceiptText },
    { id: 'budgets', label: t.bottomNav.budgets, icon: Target },
    { id: 'reports', label: t.bottomNav.analytics, icon: BarChart3 },
  ];

  return (
    <nav 
      aria-label={t.bottomNav.ariaLabel}
      className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] inset-x-0 z-40 px-3 pointer-events-none select-none flex justify-center"
    >
      {/* Treats signature dark floating capsule dock */}
      <div
        className={`${
          disabled ? 'pointer-events-none' : 'pointer-events-auto'
        } bg-[#100E17]/95 backdrop-blur-2xl rounded-full p-1 sm:p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.4)] border border-white/20 flex items-center justify-between gap-0.5 sm:gap-1 w-full max-w-[340px] sm:max-w-sm`}
      >
        
        {/* Left Nav Items */}
        {navItems.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              aria-label={item.label}
              title={item.label}
              className="flex-1 flex flex-col items-center justify-center py-0.5 group focus:outline-none btn-tactile cursor-pointer"
            >
              <div 
                className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
                  isActive
                    ? 'bg-white text-[#100E17] shadow-sm scale-105'
                    : 'text-white/60 group-hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 stroke-[2.2]" />
              </div>
            </button>
          );
        })}

        {/* Center Quick Record FAB */}
        <div className="flex items-center justify-center px-0.5 sm:px-1">
          <button
            onClick={onOpenNewTx}
            title={t.bottomNav.recordNewTx}
            aria-label={t.bottomNav.recordNewTx}
            className="w-9 h-9 sm:w-10 sm:h-10 bg-gradient-to-tr from-[#704BEA] to-[#8A66F5] hover:brightness-110 btn-tactile text-white rounded-full flex items-center justify-center shadow-lg border-2 border-[#100E17] cursor-pointer"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.8]" />
          </button>
        </div>

        {/* Right Nav Items */}
        {navItems.slice(2).map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              aria-label={item.label}
              title={item.label}
              className="flex-1 flex flex-col items-center justify-center py-0.5 group focus:outline-none btn-tactile cursor-pointer"
            >
              <div 
                className={`p-2 rounded-full transition-all duration-200 flex items-center justify-center ${
                  isActive
                    ? 'bg-white text-[#100E17] shadow-sm scale-105'
                    : 'text-white/60 group-hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 stroke-[2.2]" />
              </div>
            </button>
          );
        })}

      </div>
    </nav>
  );
};
