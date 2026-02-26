import { motion, AnimatePresence } from 'motion/react';
import { ExternalLink, Clock, Plus } from 'lucide-react';
import NewsModal from './NewsModal';
import { Incident } from '../App';

interface NewsItem {
  source: string;
  title: string;
  description: string;
  imageUrl: string;
  url: string;
  time: string;
}

interface NewsCardProps {
  news: NewsItem[];
  incident: Incident;
  isDarkMode: boolean;
  isModalOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
}

export default function NewsCard({ news, incident, isDarkMode, isModalOpen, onOpenModal, onCloseModal }: NewsCardProps) {
  // Logic for display:
  // Mobile: Show 1 card. If > 1, show +X button.
  // Desktop: Show 2 cards. If > 2, show +X button.
  
  const mobileLimit = 1;
  const desktopLimit = 2;

  const displayNews = news.slice(0, desktopLimit);
  const remainingCount = news.length - desktopLimit;
  const mobileRemainingCount = news.length - mobileLimit;

  return (
    <>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute bottom-8 left-0 right-0 px-4 z-40 flex flex-col md:flex-row gap-3 items-start md:items-end md:justify-center justify-end pointer-events-none"
      >
        {displayNews.map((item, index) => (
          <div 
            key={index}
            className={`
              relative w-[calc(100%-60px)] md:w-[340px] rounded-2xl shadow-xl overflow-hidden flex p-3 gap-3 pointer-events-auto transition-all duration-300
              ${index >= mobileLimit ? 'hidden md:flex' : 'flex'}
              ${isDarkMode ? 'bg-[#1E1E1E]/95 backdrop-blur-md border border-white/10 text-white' : 'bg-white/95 backdrop-blur-md border border-gray-200 text-gray-900'}
            `}
          >
            {/* Square Image with rounded corners */}
            <div className="w-20 h-20 shrink-0 relative">
              <img 
                src={item.imageUrl} 
                alt={item.title} 
                className="absolute inset-0 w-full h-full object-cover rounded-lg"
              />
            </div>
            
            {/* Content */}
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <h3 className="font-bold text-sm leading-tight mb-1 line-clamp-2">
                  {item.title}
                </h3>
                <p className={`text-xs line-clamp-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {item.description}
                </p>
              </div>
              
              <div className="flex items-center justify-between mt-1.5">
                <a 
                  href={item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-500 hover:underline truncate max-w-[100px]"
                >
                  {item.source}
                  <ExternalLink size={10} />
                </a>
                
                <div className={`flex items-center gap-1 text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'} shrink-0`}>
                  <Clock size={10} />
                  <span>{item.time}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* More Sources Button - Desktop */}
        {remainingCount > 0 && (
          <button
            onClick={onOpenModal}
            className={`
              hidden md:flex flex-col items-center justify-center w-[106px] h-[106px] rounded-2xl shadow-xl cursor-pointer pointer-events-auto border
              ${isDarkMode ? 'bg-[#1E1E1E]/95 backdrop-blur-md border-white/10 text-white hover:bg-[#2A2A2A]' : 'bg-white/95 backdrop-blur-md border-gray-200 text-gray-900 hover:bg-gray-50'}
            `}
          >
            <span className="text-xl font-bold">+{remainingCount}</span>
            <span className="text-[10px] font-medium opacity-70">Fontes</span>
          </button>
        )}

        {/* More Sources Button - Mobile */}
        {mobileRemainingCount > 0 && (
          <button
            onClick={onOpenModal}
            className={`
              md:hidden absolute -top-10 left-4 px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2 pointer-events-auto border backdrop-blur-md
              ${isDarkMode ? 'bg-[#1E1E1E]/90 border-white/10 text-white' : 'bg-white/90 border-gray-200 text-gray-900'}
            `}
          >
            <Plus size={14} />
            <span className="text-xs font-bold">+{mobileRemainingCount} Fontes</span>
          </button>
        )}
      </motion.div>

      {/* Modal for all sources */}
      <AnimatePresence>
        {isModalOpen && (
          <NewsModal 
            news={news} 
            incident={incident}
            onClose={onCloseModal} 
            isDarkMode={isDarkMode} 
          />
        )}
      </AnimatePresence>
    </>
  );
}
