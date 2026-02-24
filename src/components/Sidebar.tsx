import { Flame, Zap, LayoutDashboard, Grid, Shield, MapPin, BarChart2, ChevronUp, Sidebar as SidebarIcon, X, AlertTriangle, Radio, Activity } from 'lucide-react';

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <div className="w-[280px] bg-white dark:bg-[#161616] border-r border-gray-200 dark:border-[#2C2C2C] flex flex-col h-full z-10 shrink-0 transition-colors duration-300">
      <div className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-black dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-black font-bold">
            <Activity size={20} />
          </div>
          <span className="text-xl font-bold tracking-wide text-gray-900 dark:text-white">UrbanWatch</span>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white transition-colors md:hidden"
        >
          <X size={20} />
        </button>
        <button className="text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white transition-colors hidden md:block">
          <SidebarIcon size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-4 space-y-1">
          <NavItem icon={<AlertTriangle size={18} />} label="Active Incidents" badge="5" badgeColor="bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D]" active />
          <NavItem icon={<Radio size={18} />} label="Live Feed" badge="((•))" badgeColor="bg-green-100 dark:bg-[#064E3B] text-green-600 dark:text-[#10B981]" />
        </div>

        <div className="mt-6 px-4 space-y-1">
          <NavItem icon={<LayoutDashboard size={18} />} label="Overview" />
          <NavItem icon={<Grid size={18} />} label="Heatmaps" />
          <NavItem icon={<Shield size={18} />} label="Resources" />
          <NavItem icon={<MapPin size={18} />} label="Zones" />
          <NavItem icon={<BarChart2 size={18} />} label="Analytics" />
        </div>

        <div className="mt-8 px-4">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-[#666666] mb-4 px-2 tracking-wider">
            <span>RECENT ALERTS</span>
            <ChevronUp size={14} />
          </div>
          <div className="space-y-1">
            <PinnedItem type="ACC" name="Major Collision" value="12m" />
            <PinnedItem type="PWR" name="Power Outage" value="45m" />
            <PinnedItem type="WTH" name="Urban Flooding" value="5m" />
            <PinnedItem type="RD" name="Road Hazard" value="2h" />
          </div>
          <button className="text-gray-500 dark:text-[#666666] text-xs px-2 mt-4 hover:text-black dark:hover:text-white transition-colors">
            View all alerts
          </button>
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge, badgeColor }: any) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-blue-50 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6]' : 'text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white'}`}>
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      {badge && (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function PinnedItem({ type, name, value }: any) {
  return (
    <div className="flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer text-gray-500 dark:text-[#A1A1AA] hover:bg-gray-100 dark:hover:bg-[#1E1E1E] hover:text-black dark:hover:text-white transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-9 h-7 rounded-md border border-gray-200 dark:border-[#333333] flex items-center justify-center text-[10px] font-bold bg-gray-50 dark:bg-[#222]">
          {type}
        </div>
        <span className="text-sm truncate max-w-[120px]">{name}</span>
      </div>
      <span className="text-xs font-mono">{value}</span>
    </div>
  );
}
