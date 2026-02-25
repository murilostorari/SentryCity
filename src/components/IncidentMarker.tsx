import { Zap, AlertTriangle, CloudRain, Construction, AlertOctagon } from 'lucide-react';

interface IncidentMarkerProps {
  isSelected: boolean;
  type: string;
  severity: string; // Changed from status to severity for color coding
  isDarkMode: boolean;
  onClick?: () => void;
}

export default function IncidentMarker({ isSelected, type, severity, isDarkMode, onClick }: IncidentMarkerProps) {
  let color = isDarkMode ? '#3B82F6' : '#3B82F6'; // Default blue
  
  if (severity === 'critical') color = '#EF4444'; // Red
  if (severity === 'high') color = '#F97316'; // Orange
  if (severity === 'medium') color = '#F59E0B'; // Amber
  if (severity === 'low') color = '#10B981'; // Green
  if (severity === 'none') color = '#6B7280'; // Gray

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
