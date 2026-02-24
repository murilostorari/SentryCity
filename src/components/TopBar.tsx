import { Search, Check, BarChart, Calendar, Train, Target, RotateCw, Moon, Sun, Menu, Filter, Bell } from 'lucide-react';

export default function TopBar({ onMenuClick, isDarkMode, toggleTheme }: { onMenuClick?: () => void, isDarkMode?: boolean, toggleTheme?: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 md:p-6 pointer-events-auto bg-transparent">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-gray-500 dark:text-[#888888] md:hidden shadow-sm"
        >
          <Menu size={20} />
        </button>

        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#666666]" size={16} />
          <input 
            type="text" 
            placeholder="Search incidents, locations..." 
            className="bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#2C2C2C] rounded-lg pl-10 pr-16 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#666666] focus:outline-none focus:border-blue-500 dark:focus:border-[#444444] w-[320px] transition-colors shadow-sm"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="bg-gray-100 dark:bg-[#262626] text-gray-500 dark:text-[#888888] text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#333333]">/</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden md:flex items-center gap-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-white hover:bg-gray-50 dark:hover:bg-[#262626] transition-colors shadow-sm">
          <div className="w-4 h-4 rounded bg-red-500 dark:bg-[#EF4444] flex items-center justify-center">
            <Check size={12} className="text-white" />
          </div>
          <span className="font-medium">Critical only</span>
        </button>

        <div className="hidden lg:flex items-center bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg p-1 shadow-sm">
          <button className="p-1.5 text-blue-600 dark:text-[#3B82F6] bg-blue-50 dark:bg-[#172554] rounded-md"><BarChart size={16} /></button>
          <button className="p-1.5 text-gray-400 dark:text-[#888888] hover:text-gray-900 dark:hover:text-white transition-colors"><Filter size={16} /></button>
          <div className="w-px h-4 bg-gray-200 dark:bg-[#333333] mx-1"></div>
          <button className="px-2 text-sm text-gray-700 dark:text-white flex items-center gap-1 hover:text-blue-600 dark:hover:text-[#3B82F6] transition-colors">
            Live <span className="w-2 h-2 rounded-full bg-green-500 ml-1 animate-pulse"></span>
          </button>
        </div>

        <button 
          onClick={toggleTheme}
          className="p-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-gray-500 dark:text-[#888888] hover:text-gray-900 dark:hover:text-white transition-colors shadow-sm"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button className="p-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-gray-500 dark:text-[#888888] hover:text-gray-900 dark:hover:text-white transition-colors shadow-sm hidden sm:block relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-[#1E1E1E]"></span>
        </button>

        <button className="px-4 py-2 bg-blue-600 dark:bg-[#3B82F6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors shadow-sm">
          New Report
        </button>

        <div className="w-9 h-9 bg-gray-900 dark:bg-[#333] rounded-lg flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity shadow-sm border border-gray-200 dark:border-[#444]">
          OS
        </div>
      </div>
    </div>
  );
}
