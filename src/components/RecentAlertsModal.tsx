import { X, Bell, ArrowUpRight, Clock, AlertTriangle, Zap, CloudRain, Construction, Music, PartyPopper, Megaphone, Star, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Incident } from '../App';

interface RecentAlertsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Incident[];
}

export default function RecentAlertsModal({ isOpen, onClose, incidents }: RecentAlertsModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[60] backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 m-auto w-full max-w-md h-[600px] bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#2C2C2C] rounded-2xl shadow-2xl z-[70] flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-gray-200 dark:border-[#2C2C2C] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Bell size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Alertas Recentes</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Últimas 24 horas</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-lg transition-colors text-gray-500 dark:text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {incidents.length > 0 ? (
                incidents.map((incident) => (
                  <PinnedItem key={incident.id} incident={incident} />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-600">
                  <Bell size={48} className="mb-4 opacity-20" />
                  <p>Nenhum alerta recente</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PinnedItem({ incident }: { incident: Incident }) {
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
