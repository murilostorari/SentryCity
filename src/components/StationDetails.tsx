import { useState } from 'react';
import { X, Copy, Info, ChevronDown, ChevronUp, AlertTriangle, Clock, MapPin, Shield, Activity, Users } from 'lucide-react';
import { BarChart, Bar, ResponsiveContainer, AreaChart, Area, CartesianGrid, YAxis } from 'recharts';

const timelineData = Array.from({ length: 24 }).map((_, i) => ({
  time: `${i}:00`,
  value: Math.random() * 100 + (i > 10 && i < 18 ? 50 : 0),
  isNow: i === 18
}));

const severityData = Array.from({ length: 24 }).map((_, i) => ({
  time: `${i}:00`,
  value: 30 + Math.random() * 40 + (i > 15 ? 20 : 0)
}));

export default function StationDetails({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('Details');

  return (
    <div className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-xl shadow-2xl h-full flex flex-col overflow-hidden transition-colors duration-300">
      {/* Header */}
      <div className="p-5 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">INC-001</h2>
              <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-[#3A1D1D] text-red-600 dark:text-[#E54D4D] text-xs font-bold uppercase tracking-wide">Critical</span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500 dark:text-[#888888] text-sm">
              <MapPin size={12} />
              <span>Jan Luijkenstraat 11, Amsterdam</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-gray-200 dark:border-[#2C2C2C]">
          <Tab label="Details" active={activeTab === 'Details'} onClick={() => setActiveTab('Details')} />
          <Tab label="Timeline" active={activeTab === 'Timeline'} badge="New" onClick={() => setActiveTab('Timeline')} />
          <Tab label="Resources" active={activeTab === 'Resources'} onClick={() => setActiveTab('Resources')} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5">
        {activeTab === 'Details' && <DetailsTab />}
        {activeTab === 'Timeline' && <TimelineTab />}
      </div>
    </div>
  );
}

function Tab({ label, active, badge, onClick }: any) {
  return (
    <button 
      className={`pb-3 text-sm font-medium relative flex items-center gap-2 transition-colors ${active ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-[#888888] hover:text-gray-700 dark:hover:text-[#CCCCCC]'}`}
      onClick={onClick}
    >
      {label}
      {badge && (
        <span className="bg-blue-100 dark:bg-[#172554] text-blue-600 dark:text-[#3B82F6] text-[10px] px-1.5 py-0.5 rounded-full font-bold">
          {badge}
        </span>
      )}
      {active && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-black dark:bg-white rounded-t-full"></div>
      )}
    </button>
  );
}

function DetailsTab() {
  return (
    <div className="space-y-6">
      <div className="bg-red-50 dark:bg-[#3A1D1D] border border-red-200 dark:border-[#4A2525] rounded-lg p-3 flex items-start gap-3 text-red-700 dark:text-[#E54D4D] text-sm">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <div>
          <span className="font-bold block mb-0.5">High Priority Incident</span>
          <span className="opacity-90">Multiple reports received. Emergency services dispatched.</span>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Report Frequency</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        <div className="h-[140px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={timelineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="value" fill="#EF4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-xs text-gray-400 dark:text-[#666666] mt-2">
            <span>-24h</span>
            <span>Now</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Incident Information</h3>
        <div className="space-y-4">
          <DetailRow label="Type" value="Major Collision" />
          <DetailRow label="Source" value="OSINT / Twitter" />
          <DetailRow label="Status" value={<span className="text-red-600 dark:text-[#EF4444] flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-[#EF4444] animate-pulse"></div>Active</span>} />
          <DetailRow label="ID" value={<div className="flex items-center justify-between w-full"><span>INC-001-2024</span><Copy size={14} className="text-gray-400 dark:text-[#666666] cursor-pointer hover:text-black dark:hover:text-white transition-colors" /></div>} hasInfo />
          <DetailRow label="Severity" value="Level 4 (Critical)" />
          <DetailRow label="Reported" value={<span className="flex items-center gap-1.5"><Clock size={14} /> 12 mins ago</span>} hasInfo />
          <DetailRow label="Impact" value="Traffic blocked (2 lanes)" />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, hasInfo }: any) {
  return (
    <div className="flex items-start justify-between text-sm">
      <div className="text-gray-500 dark:text-[#888888] flex items-center gap-1.5 w-1/3">
        {label}
        {hasInfo && <Info size={12} className="text-gray-400 dark:text-[#444444]" />}
      </div>
      <div className="text-gray-900 dark:text-white w-2/3 text-right flex justify-end">{value}</div>
    </div>
  );
}

function TimelineTab() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-1.5 mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Severity Trend</h3>
          <Info size={14} className="text-gray-400 dark:text-[#666666]" />
        </div>
        <div className="h-[140px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={severityData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSeverity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" className="dark:stroke-[#2C2C2C]" />
              <YAxis orientation="right" tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Area type="monotone" dataKey="value" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#colorSeverity)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 dark:border-[#2C2C2C] pb-6">
        <div>
          <div className="text-gray-500 dark:text-[#888888] text-[10px] font-bold tracking-wider uppercase mb-1">Reports</div>
          <div className="text-2xl font-medium text-gray-900 dark:text-white">42</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-[#888888] text-xs font-bold tracking-wider uppercase mb-1">Confidence</div>
          <div className="text-2xl font-medium text-gray-900 dark:text-white">98%</div>
        </div>
        <div>
          <div className="text-gray-500 dark:text-[#888888] text-xs font-bold tracking-wider uppercase mb-1">Est. Clear</div>
          <div className="text-2xl font-medium text-gray-900 dark:text-white">2h</div>
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-[#666666] tracking-wider mb-4 uppercase">Live Updates</h3>
        <div className="space-y-2">
          <TimelineItem time="12m ago" source="Twitter" content="Major accident reported at Jan Luijkenstraat. Avoid area." status="critical" />
          <TimelineItem time="15m ago" source="Waze" content="Heavy traffic detected. Speed 5km/h." status="warning" />
          <TimelineItem time="20m ago" source="Sensor" content="Noise anomaly detected (Crash signature)." status="info" />
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ time, source, content, status }: any) {
  const statusColors = {
    critical: 'bg-red-500 dark:bg-[#EF4444]',
    warning: 'bg-orange-500 dark:bg-[#F59E0B]',
    info: 'bg-blue-500 dark:bg-[#3B82F6]',
  };

  return (
    <div className="bg-gray-50 dark:bg-[#262626] border border-transparent rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColors[status as keyof typeof statusColors]}`}></span>
          <span className="text-xs font-bold text-gray-700 dark:text-white">{source}</span>
        </div>
        <span className="text-[10px] text-gray-400 dark:text-[#666666]">{time}</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-[#CCCCCC]">{content}</p>
    </div>
  );
}
