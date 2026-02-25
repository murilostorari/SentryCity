import { motion } from 'motion/react';
import { ExternalLink, Clock } from 'lucide-react';

interface NewsCardProps {
  news: {
    source: string;
    title: string;
    description: string;
    imageUrl: string;
    url: string;
    time: string;
  };
  isDarkMode: boolean;
}

export default function NewsCard({ news, isDarkMode }: NewsCardProps) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className={`absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl rounded-xl shadow-2xl overflow-hidden z-40 flex ${isDarkMode ? 'bg-[#1E1E1E] text-white' : 'bg-white text-gray-900'}`}
    >
      <div className="w-1/3 min-w-[120px] max-w-[180px] relative">
        <img 
          src={news.imageUrl} 
          alt={news.title} 
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-base md:text-lg leading-tight mb-1 line-clamp-2">
            {news.title}
          </h3>
          <p className={`text-xs md:text-sm line-clamp-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {news.description}
          </p>
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-[#333]">
          <a 
            href={news.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {news.source}
            <ExternalLink size={10} />
          </a>
          
          <div className={`flex items-center gap-1.5 text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            <Clock size={10} />
            <span>{news.time}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
