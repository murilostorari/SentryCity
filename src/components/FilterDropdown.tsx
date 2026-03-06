import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ReactNode } from 'react';

interface FilterDropdownProps {
  label: string;
  icon?: ReactNode;
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
  badge?: ReactNode;
  className?: string;
}

export function FilterDropdown({ label, icon, active, onToggle, children, badge, className }: FilterDropdownProps) {
  return (
    <div className={`relative ${className || ''}`}>
      <button 
        onClick={onToggle}
        className={`flex items-center gap-2 bg-white dark:bg-[#1E1E1E] border ${active ? 'border-blue-500 dark:border-blue-500' : 'border-gray-200 dark:border-[#2C2C2C]'} rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors shadow-sm`}
      >
        {icon}
        <span className="font-medium">{label}</span>
        {badge}
        <ChevronDown size={14} className={`transition-transform ${active ? 'rotate-180' : ''}`} />
      </button>
      
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-full mt-2 left-0 min-w-[12rem] bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg shadow-xl p-2 z-50"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface DropdownItemProps {
  label: string;
  onClick: () => void;
  selected?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function DropdownItem({ label, onClick, selected, icon, className }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md ${className || ''}`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span>{label}</span>
      </div>
      {selected && <Check size={14} className="text-blue-500" />}
    </button>
  );
}
