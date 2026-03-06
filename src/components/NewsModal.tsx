import { X, ExternalLink, Clock, AlertTriangle, Zap, Music, PartyPopper, Volume2, Ribbon, HelpCircle } from 'lucide-react';
import { Incident } from '../types/Incident';
import ResponsiveModal from './ResponsiveModal';

interface NewsItem {
  source: string;
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  time: string;
}

interface NewsModalProps {
  news: NewsItem[];
  incident: Incident;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function NewsModal({ news, incident, onClose, isDarkMode }: NewsModalProps) {
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'accident': return <AlertTriangle size={24} className="text-white" />;
      case 'power': return <Zap size={24} className="text-white" />;
      case 'show': return <Music size={24} className="text-white" />;
      case 'party': return <PartyPopper size={24} className="text-white" />;
      case 'noise': return <Volume2 size={24} className="text-white" />;
      case 'inauguration': return <Ribbon size={24} className="text-white" />;
      default: return <HelpCircle size={24} className="text-white" />;
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch(severity) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-blue-500';
    }
  };

  const getSeverityLabel = (severity?: string) => {
    switch(severity) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return 'Desconhecido';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch(status) {
      case 'active': return 'Ativo';
      case 'resolved': return 'Resolvido';
      case 'investigating': return 'Investigando';
      default: return status;
    }
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} className="max-w-2xl max-h-[85vh] flex flex-col" isDarkMode={isDarkMode}>
      {/* Header with Title and Close Button */}
      <div className={`p-4 border-b ${isDarkMode ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between shrink-0`}>
        <h2 className="text-lg font-bold">Todas as Fontes</h2>
        <button 
          onClick={onClose} 
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>

      {/* Incident Details Card (Styled exactly like IncidentPopup) */}
      <div className="p-4 pb-0 shrink-0">
        <div className={`border-2 rounded-xl p-4 w-full shadow-sm relative ${isDarkMode ? 'bg-[#1E1E1E] border-[#333]' : 'bg-white border-gray-200'}`}>
            <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shrink-0 ${incident.severity === 'critical' ? 'border-red-500' : (isDarkMode ? 'bg-[#1A1A1A] border-[#333]' : 'bg-white border-gray-200')}`}>
                {getIcon(incident.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-lg truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{incident.title}</span>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${getSeverityColor(incident.severity)}`}></div>
                </div>
                <div className={`flex items-center gap-1 text-xs mt-0.5 min-w-0 ${isDarkMode ? 'text-[#888888]' : 'text-gray-500'}`}>
                  <AlertTriangle size={12} className="shrink-0" />
                  <span className="truncate">{incident.address}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="mt-3 mb-4">
            <p className={`text-sm line-clamp-2 ${isDarkMode ? 'text-[#CCCCCC]' : 'text-gray-600'}`}>{incident.description}</p>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-6">
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-[#888888]' : 'text-gray-500'}`}>Tempo</div>
                <div className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{incident.time}</div>
              </div>
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-[#888888]' : 'text-gray-500'}`}>Severidade</div>
                <div className={`font-bold text-sm capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{getSeverityLabel(incident.severity)}</div>
              </div>
              <div>
                <div className={`text-xs mb-1 ${isDarkMode ? 'text-[#888888]' : 'text-gray-500'}`}>Status</div>
                <div className={`font-bold text-sm capitalize ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{getStatusLabel(incident.status)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* News List */}
      <div className="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
        <h3 className="text-sm font-semibold opacity-70 mb-2 px-1">Fontes Relacionadas ({news.length})</h3>
        {news.map((item, index) => (
          <div 
            key={index} 
            className={`relative flex gap-4 p-3 rounded-xl border transition-colors group ${isDarkMode ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
          >
            <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden relative">
              <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
            </div>
            
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <h3 className="font-bold text-sm leading-tight mb-1 line-clamp-2 group-hover:text-blue-500 transition-colors">
                  {item.title}
                </h3>
                <p className={`text-xs line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {item.description}
                </p>
              </div>
              
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs font-bold text-blue-500 flex items-center gap-1">
                  {item.source}
                  <ExternalLink size={10} />
                </span>
                <div className="flex items-center gap-1 text-xs opacity-60">
                  <Clock size={10} />
                  <span>{item.time}</span>
                </div>
              </div>
              
              {/* Link covers only the news item card */}
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}
