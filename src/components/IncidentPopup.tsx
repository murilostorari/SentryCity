import { Zap, AlertTriangle, CloudRain, Construction, ArrowRight, X, AlertOctagon } from 'lucide-react';
import { Incident } from '../App';

interface IncidentPopupProps {
  incident: Incident;
  onOpenDetails: () => void;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function IncidentPopup({ incident, onOpenDetails, onClose, isDarkMode }: IncidentPopupProps) {
  const getIcon = () => {
    switch(incident.type) {
      case 'accident': return <AlertTriangle size={18} className="text-gray-900 dark:text-white" />;
      case 'power': return <Zap size={18} className="text-gray-900 dark:text-white" />;
      case 'weather': return <CloudRain size={18} className="text-gray-900 dark:text-white" />;
      case 'pothole': return <Construction size={18} className="text-gray-900 dark:text-white" />;
      default: return <AlertOctagon size={18} className="text-gray-900 dark:text-white" />;
    }
  };

  const getSeverityColor = () => {
    switch(incident.severity) {
      case 'critical': return 'bg-red-500 dark:bg-[#EF4444]';
      case 'high': return 'bg-orange-500 dark:bg-[#F97316]';
      case 'medium': return 'bg-yellow-500 dark:bg-[#F59E0B]';
      case 'low': return 'bg-green-500 dark:bg-[#10B981]';
      default: return 'bg-gray-500 dark:bg-[#6B7280]';
    }
  };

  const getBorderColor = () => {
    switch(incident.severity) {
      case 'critical': return 'border-red-500 dark:border-[#EF4444]';
      case 'high': return 'border-orange-500 dark:border-[#F97316]';
      case 'medium': return 'border-yellow-500 dark:border-[#F59E0B]';
      case 'low': return 'border-green-500 dark:border-[#10B981]';
      default: return 'border-gray-500 dark:border-[#6B7280]';
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

  const translateStatus = (status: string) => {
    switch(status) {
      case 'active': return 'Ativo';
      case 'resolved': return 'Resolvido';
      case 'investigating': return 'Investigando';
      default: return status;
    }
  };

  return (
    <div 
      className={`bg-white dark:bg-[#1E1E1E] border-2 ${getBorderColor()} rounded-xl p-4 w-[320px] shadow-2xl cursor-default transition-colors duration-300 relative z-[100]`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-white dark:bg-[#1A1A1A] border-2 flex items-center justify-center shrink-0 ${incident.severity === 'critical' ? 'border-red-500' : 'border-gray-200 dark:border-[#333]'}`}>
            {getIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-gray-900 dark:text-white font-bold text-lg">{incident.id}</span>
              <div className={`w-2 h-2 rounded-full ${getSeverityColor()}`}></div>
            </div>
            <div className="flex items-center gap-1 text-gray-500 dark:text-[#888888] text-xs mt-0.5">
              <AlertOctagon size={12} />
              <span>{incident.title}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="mt-3 mb-4">
        <p className="text-sm text-gray-600 dark:text-[#CCCCCC] line-clamp-2">{incident.description}</p>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-6">
          <div>
            <div className="text-gray-500 dark:text-[#888888] text-xs mb-1">Tempo</div>
            <div className="text-gray-900 dark:text-white font-bold text-sm">{incident.time}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-[#888888] text-xs mb-1">Severidade</div>
            <div className="text-gray-900 dark:text-white font-bold text-sm capitalize">{translateSeverity(incident.severity)}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-[#888888] text-xs mb-1">Status</div>
            <div className="text-gray-900 dark:text-white font-bold text-sm capitalize">{translateStatus(incident.status)}</div>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails();
          }}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-900 dark:text-white hover:bg-blue-500 dark:hover:bg-[#3B82F6] hover:text-white hover:border-blue-500 dark:hover:border-[#3B82F6] border border-gray-200 dark:border-[#333333] transition-all duration-200 group"
        >
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
