import { useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, X, AlertTriangle, Bell } from 'lucide-react';
import { motion } from 'motion/react';
import { Incident } from '../App';

interface SidebarProps {
  onClose?: () => void;
  currentCity?: string;
  incidents?: Incident[];
  onOpenRecentAlerts?: () => void;
}

export default function Sidebar({ onClose, currentCity = "Adamantina, SP", incidents = [], onOpenRecentAlerts }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      <motion.div 
        animate={{ width: isCollapsed ? 80 : 320 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="bg-white dark:bg-[#161616] border-r border-gray-200 dark:border-[#2C2C2C] flex flex-col h-full z-10 shrink-0 transition-colors duration-300 relative"
      >
        <div className="p-6 flex items-center h-[88px] relative overflow-hidden">
          <div className="flex items-center gap-3 absolute left-6 top-6">
            <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black font-bold shrink-0 shadow-sm z-20 relative">
              <Activity size={20} />
            </div>
            <motion.div 
              initial={{ opacity: 1 }}
              animate={{ opacity: isCollapsed ? 0 : 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col whitespace-nowrap"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium tracking-wide">Localização Atual</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[180px]" title={currentCity}>
                {currentCity}
              </span>
            </motion.div>
          </div>
          
          {!isCollapsed && (
            <button 
              onClick={onClose}
              className="absolute right-6 top-8 text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white transition-colors md:hidden"
            >
              <X size={20} />
            </button>
          )}
        </div>
        
        {/* Collapse Button (Desktop) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333] rounded-full flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white shadow-sm z-20 hidden md:flex"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="flex-1 overflow-y-auto py-2 overflow-x-hidden custom-scrollbar">
          <div className="px-4 space-y-2">
            <NavItem 
              icon={<AlertTriangle size={20} />} 
              label="Incidentes Ativos" 
              badge={incidents.length.toString()} 
              badgeColor="bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D]" 
              active 
              isCollapsed={isCollapsed} 
            />
            
            <button 
              onClick={onOpenRecentAlerts}
              className={`w-full flex items-center h-12 rounded-xl cursor-pointer transition-all duration-200 text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white relative overflow-hidden group`}
              title={isCollapsed ? "Alertas Recentes" : ''}
            >
              <div className="absolute left-3 flex items-center justify-center w-6 h-6">
                <Bell size={20} />
              </div>
              <motion.span 
                animate={{ opacity: isCollapsed ? 0 : 1, x: isCollapsed ? -10 : 0 }}
                className="absolute left-12 text-sm font-semibold whitespace-nowrap"
              >
                Alertas Recentes
              </motion.span>
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function NavItem({ icon, label, active, badge, badgeColor, isCollapsed }: any) {
  return (
    <div 
      className={`w-full flex items-center h-12 rounded-xl cursor-pointer transition-all duration-200 ${active ? 'bg-blue-50 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6] shadow-sm' : 'text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white'} relative overflow-hidden`}
      title={isCollapsed ? label : ''}
    >
      <div className="absolute left-3 flex items-center justify-center w-6 h-6">
        {icon}
      </div>
      
      <motion.span 
        animate={{ opacity: isCollapsed ? 0 : 1, x: isCollapsed ? -10 : 0 }}
        className="absolute left-12 text-sm font-semibold whitespace-nowrap"
      >
        {label}
      </motion.span>
      
      {badge && (
        <motion.span 
          animate={{ opacity: isCollapsed ? 0 : 1, scale: isCollapsed ? 0 : 1 }}
          className={`absolute right-3 text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}
        >
          {badge}
        </motion.span>
      )}
    </div>
  );
}
