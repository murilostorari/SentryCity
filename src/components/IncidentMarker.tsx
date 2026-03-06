import { Zap, AlertTriangle, CloudRain, Construction, AlertOctagon, Music, PartyPopper, Megaphone, Star, HelpCircle } from 'lucide-react';
import { Colors } from '../constants/Colors';

interface IncidentMarkerProps {
  isSelected: boolean;
  type: string;
  severity: string;
  isDarkMode: boolean;
  onClick?: () => void;
}

export default function IncidentMarker({ isSelected, type, severity, isDarkMode, onClick }: IncidentMarkerProps) {
  let color = Colors.Status.Medium; // Default blue
  
  if (severity === 'critical') color = Colors.Status.Critical;
  if (severity === 'high') color = Colors.Status.High;
  if (severity === 'medium') color = Colors.Status.High; // Wait, amber is High in Colors, but Medium in logic?
  // Let's align with Colors.ts
  if (severity === 'medium') color = Colors.Status.High; // Colors.Status.High is amber-500 (#F59E0B) which matches previous medium color
  if (severity === 'low') color = Colors.Status.Low;
  if (severity === 'none') color = Colors.IncidentType.Other;

  const fillColor = isSelected ? color : (isDarkMode ? '#1A1A1A' : '#FFFFFF');
  const strokeColor = isSelected ? '#FFFFFF' : color;
  const iconColor = isSelected ? '#FFFFFF' : color;
  const scale = isSelected ? 1.3 : 1;

  // Different icons based on type
  let IconComponent = AlertOctagon;
  if (type === 'accident') IconComponent = AlertTriangle;
  else if (type === 'power') IconComponent = Zap;
  else if (type === 'weather') IconComponent = CloudRain;
  else if (type === 'pothole') IconComponent = Construction;
  else if (type === 'show') IconComponent = Music;
  else if (type === 'party') IconComponent = PartyPopper;
  else if (type === 'noise') IconComponent = Megaphone;
  else if (type === 'inauguration') IconComponent = Star;
  else if (type === 'other') IconComponent = HelpCircle;

  return (
    <div 
      className="relative flex items-center justify-center transition-transform duration-300"
      style={{ 
        transform: `scale(${scale})`,
        width: '36px',
        height: '36px',
        cursor: 'pointer'
      }}
      onClick={onClick}
    >
      {/* Outer Circle */}
      <div 
        className="absolute inset-0 rounded-full border-2 transition-colors duration-300"
        style={{ 
          backgroundColor: fillColor,
          borderColor: strokeColor,
          boxShadow: isSelected ? `0 0 15px ${color}80` : 'none'
        }}
      />
      
      {/* Icon */}
      <IconComponent 
        size={18} 
        className="relative z-10 transition-colors duration-300"
        style={{ color: iconColor }}
      />

      {/* Pulse effect for critical incidents */}
      {severity === 'critical' && !isSelected && (
        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
      )}
    </div>
  );
}
