import { useState } from 'react';
import { Flame, Zap, LayoutDashboard, Grid, Shield, MapPin, BarChart2, ChevronUp, Sidebar as SidebarIcon, X, AlertTriangle, Radio, Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.div 
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="bg-white dark:bg-[#161616] border-r border-gray-200 dark:border-[#2C2C2C] flex flex-col h-full z-10 shrink-0 transition-colors duration-300 relative"
    >
      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black font-bold shrink-0">
            <Activity size={20} />
          </div>
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xl font-bold tracking-wide text-gray-900 dark:text-white whitespace-nowrap"
            >
              SentryCity
            </motion.span>
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

      <div className="flex-1 overflow-y-auto py-2 overflow-x-hidden">
        <div className="px-4 space-y-1">
          <NavItem icon={<AlertTriangle size={18} />} label="Incidentes Ativos" badge="5" badgeColor="bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D]" active isCollapsed={isCollapsed} />
          <NavItem icon={<Radio size={18} />} label="Transmissão Ao Vivo" badge="((•))" badgeColor="bg-green-100 dark:bg-[#064E3B] text-green-600 dark:text-[#10B981]" isCollapsed={isCollapsed} />
        </div>

        <div className="mt-6 px-4 space-y-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Visão Geral" isCollapsed={isCollapsed} />
          <NavItem icon={<Grid size={18} />} label="Mapas de Calor" isCollapsed={isCollapsed} />
          <NavItem icon={<Shield size={18} />} label="Recursos" isCollapsed={isCollapsed} />
          <NavItem icon={<MapPin size={18} />} label="Zonas" isCollapsed={isCollapsed} />
          <NavItem icon={<BarChart2 size={18} />} label="Análise" isCollapsed={isCollapsed} />
        </div>

        <div className="mt-8 px-4">
          {!isCollapsed && (
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-[#666666] mb-4 px-2 tracking-wider whitespace-nowrap">
              <span>ALERTAS RECENTES</span>
              <ChevronUp size={14} />
            </div>
          )}
          <div className="space-y-1">
            <PinnedItem type="ACD" name="Colisão Grave" value="12m" isCollapsed={isCollapsed} />
            <PinnedItem type="ENR" name="Queda de Energia" value="45m" isCollapsed={isCollapsed} />
            <PinnedItem type="CLT" name="Inundação Urbana" value="5m" isCollapsed={isCollapsed} />
            <PinnedItem type="EST" name="Perigo na Estrada" value="2h" isCollapsed={isCollapsed} />
          </div>
          {!isCollapsed && (
            <button className="text-gray-500 dark:text-[#666666] text-xs px-2 mt-4 hover:text-black dark:hover:text-white transition-colors whitespace-nowrap">
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
      className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-3'} py-2.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-blue-50 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6]' : 'text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white'}`}
      title={isCollapsed ? label : ''}
    >
      <div className="flex items-center gap-3">
        {icon}
        {!isCollapsed && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
      </div>
      {!isCollapsed && badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function PinnedItem({ type, name, value, isCollapsed }: any) {
  return (
    <div 
      className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'justify-between px-2'} py-2 rounded-lg cursor-pointer text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white transition-colors`}
      title={isCollapsed ? name : ''}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-7 rounded-md border border-gray-200 dark:border-[#333333] flex items-center justify-center text-[10px] font-bold bg-gray-50 dark:bg-[#222] shrink-0">
          {type}
        </div>
        {!isCollapsed && <span className="text-sm truncate max-w-[120px]">{name}</span>}
      </div>
      {!isCollapsed && <span className="text-xs font-mono">{value}</span>}
    </div>
  );
}
