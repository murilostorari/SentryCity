import React from 'react';
import { X, Bell, ArrowUpRight, Clock, AlertTriangle, Zap, CloudRain, Construction, Music, PartyPopper, Megaphone, Star, HelpCircle } from 'lucide-react';
import { Incident } from '../types/Incident';
import ResponsiveModal from './ResponsiveModal';

interface RecentAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Incident[];
  isDarkMode: boolean;
  onSelectIncident: (incident: Incident) => void;
}

export default function RecentAlertsModal({ isOpen, onClose, incidents, isDarkMode, onSelectIncident }: RecentAlertsModalProps) {
  return (
    <ResponsiveModal isOpen={isOpen} onClose={onClose} className="max-w-md h-[600px]" isDarkMode={isDarkMode}>
      <div className={`flex items-center justify-between p-4 border-b shrink-0 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">Alertas Recentes</h2>
          <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Últimas 24 horas</span>
        </div>
        <button 
          onClick={onClose}
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
        {incidents.length > 0 ? (
          incidents.map((incident) => (
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
            <p>Nenhum alerta recente</p>
          </div>
        )}
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
      case 'accident': return <AlertTriangle size={16} className="text-white" />;
      case 'power': return <Zap size={16} className="text-white" />;
      case 'weather': return <CloudRain size={16} className="text-white" />;
      case 'pothole': return <Construction size={16} className="text-white" />;
      case 'show': return <Music size={16} className="text-white" />;
      case 'party': return <PartyPopper size={16} className="text-white" />;
      case 'noise': return <Megaphone size={16} className="text-white" />;
      case 'inauguration': return <Star size={16} className="text-white" />;
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
