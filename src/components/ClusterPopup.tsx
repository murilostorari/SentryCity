import { Zap, AlertTriangle, CloudRain, Construction, X, Music, PartyPopper, Megaphone, Star, HelpCircle, ChevronRight } from 'lucide-react';
import { Incident } from '../types/Incident';

interface ClusterPopupProps {
  incidents: Incident[];
  onClose: () => void;
  onSelectIncident: (id: string) => void;
  isDarkMode: boolean;
}

export default function ClusterPopup({ incidents, onClose, onSelectIncident, isDarkMode }: ClusterPopupProps) {
  const getIcon = (type: string) => {
    switch(type) {
      case 'accident': return <AlertTriangle size={14} className="text-gray-900 dark:text-white" />;
      case 'power': return <Zap size={14} className="text-gray-900 dark:text-white" />;
      case 'weather': return <CloudRain size={14} className="text-gray-900 dark:text-white" />;
      case 'pothole': return <Construction size={14} className="text-gray-900 dark:text-white" />;
      case 'show': return <Music size={14} className="text-gray-900 dark:text-white" />;
      case 'party': return <PartyPopper size={14} className="text-gray-900 dark:text-white" />;
      case 'noise': return <Megaphone size={14} className="text-gray-900 dark:text-white" />;
      case 'inauguration': return <Star size={14} className="text-gray-900 dark:text-white" />;
      default: return <HelpCircle size={14} className="text-gray-900 dark:text-white" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch(severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const translateSeverity = (sev: string) => {
    switch(sev) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return sev;
    }
  };

  const getBorderColor = () => {
    const maxSeverity = incidents.reduce((max, inc) => {
      const order = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
      return (order[inc.severity as keyof typeof order] || 0) > (order[max as keyof typeof order] || 0) ? inc.severity : max;
    }, 'low');

    switch(maxSeverity) {
      case 'critical': return 'border-red-500';
      case 'high': return 'border-orange-500';
      case 'medium': return 'border-yellow-500';
      case 'low': return 'border-green-500';
      default: return 'border-gray-500';
    }
  };

  return (
    <div 
      className={`bg-white dark:bg-[#1E1E1E] border-2 ${getBorderColor()} rounded-xl w-[280px] shadow-2xl cursor-default transition-colors duration-300 relative z-[100] overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-[#333]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
            <span className="text-white text-xs font-bold">{incidents.length}</span>
          </div>
          <span className="text-gray-900 dark:text-white font-semibold text-sm">
            {incidents.length === 1 ? 'Evento' : 'Eventos'}
          </span>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-6 h-6 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      {/* Incidents List */}
      <div className="max-h-[240px] overflow-y-auto">
        {incidents.map((incident, index) => (
          <button
            key={incident.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelectIncident(incident.id);
            }}
            className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors text-left ${
              index < incidents.length - 1 ? 'border-b border-gray-100 dark:border-[#333]' : ''
            }`}
          >
            <div className={`w-8 h-8 rounded-full ${getSeverityColor(incident.severity)} flex items-center justify-center shrink-0`}>
              {getIcon(incident.type)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-gray-900 dark:text-white font-medium text-sm truncate">{incident.title}</div>
              <div className="flex items-center gap-2 text-gray-500 dark:text-[#888888] text-xs">
                <span>{translateSeverity(incident.severity)}</span>
                <span>•</span>
                <span className="truncate">{incident.time}</span>
              </div>
            </div>
            <ChevronRight size={14} className="text-gray-400 dark:text-[#666] shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}