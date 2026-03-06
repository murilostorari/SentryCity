import { useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, X, AlertTriangle, Zap, CloudRain, Construction, Music, PartyPopper, Megaphone, Star, HelpCircle, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { Incident } from '../App';

interface SidebarProps {
  onClose?: () => void;
  currentCity?: string;
  incidents?: Incident[];
}

export default function Sidebar({ onClose, currentCity = "Adamantina, SP", incidents = [] }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.div 
      animate={{ width: isCollapsed ? 80 : 320 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="bg-white dark:bg-[#161616] border-r border-gray-200 dark:border-[#2C2C2C] flex flex-col h-full z-10 shrink-0 transition-colors duration-300 relative"
    >
      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-black dark:bg-white rounded-xl flex items-center justify-center text-white dark:text-black font-bold shrink-0 shadow-sm">
            <Activity size={20} />
          </div>
          {!isCollapsed && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
            >
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">Localização Atual</span>
              <span className="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[180px]" title={currentCity}>
                {currentCity}
              </span>
            </motion.div>
          )}
        </div>
        {!isCollapsed && (
          <button 
            onClick={onClose}
            className="text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white transition-colors md:hidden"
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
        <div className="px-4 space-y-1">
          <NavItem 
            icon={<AlertTriangle size={18} />} 
            label="Incidentes Ativos" 
            badge={incidents.length.toString()} 
            badgeColor="bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D]" 
            active 
            isCollapsed={isCollapsed} 
          />
        </div>

        <div className="mt-8 px-4">
          {!isCollapsed && (
            <div className="flex items-center justify-between text-xs font-bold text-gray-400 dark:text-[#666666] mb-4 px-2 tracking-wider uppercase">
              <span>Alertas Recentes</span>
            </div>
          )}
          <div className="space-y-3">
            {incidents.slice(0, 6).map((incident) => (
              <PinnedItem key={incident.id} incident={incident} isCollapsed={isCollapsed} />
            ))}
          </div>
          {!isCollapsed && incidents.length > 6 && (
            <button className="text-gray-500 dark:text-[#666666] text-xs px-2 mt-4 hover:text-black dark:hover:text-white transition-colors whitespace-nowrap font-medium">
              Ver todos os alertas
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function NavItem({ icon, label, active, badge, badgeColor, isCollapsed }: any) {
  return (
    <div 
      className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-3 rounded-xl cursor-pointer transition-all duration-200 ${active ? 'bg-blue-50 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6] shadow-sm' : 'text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white'}`}
      title={isCollapsed ? label : ''}
    >
      <div className="flex items-center gap-3">
        {icon}
        {!isCollapsed && <span className="text-sm font-semibold whitespace-nowrap">{label}</span>}
      </div>
      {!isCollapsed && badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function PinnedItem({ incident, isCollapsed }: { incident: Incident, isCollapsed: boolean }) {
  const getIcon = () => {
    switch(incident.type) {
      case 'accident': return <AlertTriangle size={14} className="text-white" />;
      case 'power': return <Zap size={14} className="text-white" />;
      case 'weather': return <CloudRain size={14} className="text-white" />;
      case 'pothole': return <Construction size={14} className="text-white" />;
      case 'show': return <Music size={14} className="text-white" />;
      case 'party': return <PartyPopper size={14} className="text-white" />;
      case 'noise': return <Megaphone size={14} className="text-white" />;
      case 'inauguration': return <Star size={14} className="text-white" />;
      default: return <HelpCircle size={14} className="text-white" />;
    }
  };

  const getSeverityColor = () => {
    switch(incident.severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <div 
      className={`flex items-start ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-3 rounded-xl cursor-pointer bg-gray-50 dark:bg-[#1E1E1E] border border-gray-100 dark:border-[#2A2A2A] hover:border-gray-300 dark:hover:border-[#444] transition-all duration-200 group`}
      title={isCollapsed ? incident.title : ''}
    >
      <div className="flex items-start gap-3 overflow-hidden">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${getSeverityColor()}`}>
          {getIcon()}
        </div>
        {!isCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate leading-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
              {incident.title}
            </span>
            <div className="flex items-center gap-1 mt-1 text-gray-500 dark:text-gray-400">
              <ArrowUpRight size={10} className="shrink-0" />
              <span className="text-[10px] truncate leading-tight max-w-[140px]">{incident.address}</span>
            </div>
          </div>
        )}
      </div>
      {!isCollapsed && (
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 shrink-0 mt-0.5">
          {incident.time}
        </span>
      )}
    </div>
  );
}
