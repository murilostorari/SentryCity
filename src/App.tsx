import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MapArea from './components/MapArea';
import StationDetails from './components/StationDetails';

export default function App() {
  const [selectedStation, setSelectedStation] = useState<string | null>('NL00P010082');
  const [showDetails, setShowDetails] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleSelectStation = (id: string | null) => {
    setSelectedStation(id);
    if (!id) setShowDetails(false);
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-[#111111] text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex-1 flex flex-col relative w-full">
        <MapArea 
          onSelectStation={handleSelectStation} 
          selectedStation={selectedStation} 
          onOpenDetails={() => setShowDetails(true)}
          showDetails={showDetails}
          isDarkMode={isDarkMode}
        />
        
        <div className="absolute top-0 left-0 right-0 pointer-events-none z-10">
          <TopBar 
            onMenuClick={() => setIsSidebarOpen(true)} 
            isDarkMode={isDarkMode} 
            toggleTheme={toggleTheme} 
          />
        </div>

        <AnimatePresence>
          {showDetails && selectedStation && (
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-20 right-0 bottom-0 md:right-6 md:bottom-6 w-full md:w-[380px] pointer-events-auto z-30"
            >
              <StationDetails onClose={() => setShowDetails(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
