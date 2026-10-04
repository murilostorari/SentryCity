import React, { useState } from 'react';
import { X, Bell, ArrowUpRight, Clock, AlertTriangle, Zap, CloudRain, Construction, Music, PartyPopper, Megaphone, Star, HelpCircle, Flame, ShieldAlert, Droplets, Search, SlidersHorizontal } from 'lucide-react';
import { Incident } from '../types/Incident';
import ResponsiveModal from './ResponsiveModal';

interface RecentAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Incident[];
  isDarkMode: boolean;
  onSelectIncident: (incident: Incident) => void;
}

const TIME_FILTERS = [
  { hours: 12, label: '12h' },
  { hours: 24, label: '24h' },
  { hours: 48, label: '48h' },
  { hours: 168, label: '7 dias' },
];

export default function RecentAlertsModal({ isOpen, onClose, incidents, isDarkMode, onSelectIncident }: RecentAlertsModalProps) {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [hours, setHours] = useState(24);

  const activeLabel = TIME_FILTERS.find(f => f.hours === hours)?.label ?? '24h';

  const filtered = (() => {
    const now = Date.now();
    const q = query.trim().toLowerCase();
    return incidents
      .filter(i => now - i.timestamp <= hours * 60 * 60 * 1000)
      .filter(i => !q || `${i.title} ${i.address} ${i.description}`.toLowerCase().includes(q))
      .sort((a, b) => b.timestamp - a.timestamp);
  })();

  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} className="max-w-md h-[600px]" isDarkMode={isDarkMode}>
      <div className={`flex items-center justify-between p-4 pb-2 shrink-0 ${isDarkMode ? '' : ''}`}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">Alertas Recentes</h2>
          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Últimas {activeLabel}</span>
        </div>
        <button 
          onClick={onClose}
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>

      {/* Busca + filtros */}
      <div className="px-4 pb-3 shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`relative flex-1 min-w-0`}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar alerta..."
              className={`w-full pl-8 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${
                isDarkMode
                  ? 'bg-[#2A2A2A] border-[#333] text-white placeholder:text-gray-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400'
              }`}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            aria-label="Filtrar por período"
            className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
              showFilters
                ? 'bg-blue-600 border-blue-600 text-white'
                : isDarkMode
                  ? 'bg-[#2A2A2A] border-[#333] text-gray-300 hover:bg-[#333]'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-2 flex-wrap">
            {TIME_FILTERS.map(f => (
              <button
                key={f.hours}
                onClick={() => setHours(f.hours)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  hours === f.hours
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : isDarkMode
                      ? 'bg-[#2A2A2A] border-[#333] text-gray-300 hover:bg-[#333]'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3 no-scrollbar min-h-0">
        {(() => {
          return filtered.length > 0 ? (
            filtered.map((incident) => (
              <PinnedItem 
                key={incident.id} 
                incident={incident} 
                onClick={() => {
                  onSelectIncident(incident);
                  onClose();
                }}
              />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600">
              <Bell size={48} className="mb-4 opacity-20" />
              <p>{query.trim() ? 'Nenhum resultado para a busca' : 'Nenhum alerta recente'}</p>
            </div>
          );
        })()}
      </div>
    </ResponsiveModal>
  );
}

interface PinnedItemProps {
  incident: Incident;
  onClick: () => void;
  key?: React.Key;
}

function PinnedItem({ incident, onClick }: PinnedItemProps) {
  const getIcon = () => {
    switch(incident.type) {
      case 'accident':
      case 'traffic_accident':
      case 'motorcycle_accident':
        return <AlertTriangle size={16} className="text-white" />;
      case 'power':
      case 'power_outage':
        return <Zap size={16} className="text-white" />;
      case 'weather':
      case 'flood':
        return <Droplets size={16} className="text-white" />;
      case 'fire':
        return <Flame size={16} className="text-white" />;
      case 'pothole':
      case 'infrastructure_damage':
      case 'road_closure':
        return <Construction size={16} className="text-white" />;
      case 'show': return <Music size={16} className="text-white" />;
      case 'party': return <PartyPopper size={16} className="text-white" />;
      case 'noise': return <Megaphone size={16} className="text-white" />;
      case 'inauguration': return <Star size={16} className="text-white" />;
      case 'violence': return <ShieldAlert size={16} className="text-white" />;
      default: return <HelpCircle size={16} className="text-white" />;
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
      onClick={onClick}
      className="flex items-start justify-between px-4 py-4 rounded-xl cursor-pointer bg-gray-50 dark:bg-[#1E1E1E] border border-gray-100 dark:border-[#2A2A2A] hover:border-gray-300 dark:hover:border-[#444] transition-all duration-200 group"
    >
      <div className="flex items-start gap-4 overflow-hidden">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm ${getSeverityColor()}`}>
          {getIcon()}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100 truncate leading-tight group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
            {incident.title}
          </span>
          <div className="flex items-center gap-1 mt-1.5 text-gray-500 dark:text-gray-400">
            <ArrowUpRight size={12} className="shrink-0" />
            <span className="text-xs truncate leading-tight max-w-[200px]">{incident.address}</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 flex items-center gap-1">
          <Clock size={10} />
          {incident.time}
        </span>
      </div>
    </div>
  );
}
