import React from 'react';

interface TabItemProps {
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
  isDarkMode: boolean;
  key?: string;
}

function TabItem({ label, badge, active, onClick, isDarkMode }: TabItemProps) {
  return (
    <button
      type="button"
      className={`pb-3 text-sm font-medium relative flex items-center gap-2 transition-colors ${active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#888888] hover:text-gray-700 dark:hover:text-[#CCCCCC]'}`}
      onClick={onClick}
    >
      {label}
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isDarkMode ? 'bg-[#172554] text-[#3B82F6]' : 'bg-blue-100 text-blue-600'}`}>
          {badge}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white rounded-t-full"></div>
      )}
    </button>
  );
}

interface ModalTabsProps {
  active: string;
  onChange: (tab: string) => void;
  tabs: { id: string; label: string; badge?: string }[];
  isDarkMode: boolean;
}

/**
 * Abas no mesmo estilo da sheet de detalhes (StationDetails):
 * underline com border-b e indicador ativo. Compartilhadas pelos modais.
 */
export default function ModalTabs({ active, onChange, tabs, isDarkMode }: ModalTabsProps) {
  return (
    <div className={`flex items-center gap-6 border-b ${isDarkMode ? 'border-[#2C2C2C]' : 'border-gray-200'}`}>
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          label={tab.label}
          badge={tab.badge}
          active={active === tab.id}
          onClick={() => onChange(tab.id)}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
}
