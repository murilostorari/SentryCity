import { motion } from 'motion/react';
import { X, ArrowUp, AlertTriangle, Zap, CloudRain, Construction, Music, PartyPopper, Megaphone, Star, HelpCircle } from 'lucide-react';
import { Incident } from '../types/Incident';

interface OffScreenIndicatorProps {
  incident: Incident;
  angle: number; // Angle in degrees to rotate the arrow
  onClose: () => void;
  onClick: () => void;
  isDarkMode: boolean;
}

export default function OffScreenIndicator({ incident, angle, onClose, onClick, isDarkMode }: OffScreenIndicatorProps) {
  
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
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 20 }}
      className={`
        absolute z-30 flex items-center gap-3 p-2 pr-3 rounded-xl shadow-lg backdrop-blur-md border cursor-pointer
        md:bottom-8 md:left-8 
        bottom-24 left-4 md:top-auto
        ${isDarkMode ? 'bg-[#1E1E1E]/90 border-white/10 text-white' : 'bg-white/90 border-gray-200 text-gray-900'}
      `}
      onClick={onClick}
    >
      {/* Icon Circle */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${getSeverityColor()}`}>
        {getIcon()}
      </div>

      {/* Content */}
      <div className="flex flex-col min-w-[100px] max-w-[160px]">
        <span className="text-xs font-bold truncate leading-tight">{incident.title}</span>
        <div className="flex items-center gap-1 text-[10px] opacity-70 w-full">
          {/* Arrow pointing to location */}
          <div 
            style={{ transform: `rotate(${angle}deg)` }}
            className="transition-transform duration-100 shrink-0"
          >
            <ArrowUp size={10} strokeWidth={3} />
          </div>
          <span className="truncate flex-1">{incident.address}</span>
        </div>
      </div>

      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
