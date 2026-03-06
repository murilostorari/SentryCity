import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MapArea from './components/MapArea';
import StationDetails from './components/StationDetails';
import NewEventModal from './components/NewEventModal';
import NewsCard from './components/NewsCard';
import RecentAlertsModal from './components/RecentAlertsModal';
import { useIncidents } from './hooks/useIncidents';
import { useFilters } from './hooks/useFilters';
import { useSearch } from './hooks/useSearch';
import { Incident } from './types/Incident';

export default function App() {
  const { incidents, addIncident, generateMockEvents } = useIncidents();
  const { 
    filteredIncidents, 
    severityFilter, setSeverityFilter, 
    statusFilter, setStatusFilter, 
    timeFilter, setTimeFilter, 
    typeFilter, setTypeFilter 
  } = useFilters(incidents);
  const { flyToCoordinates, currentCity, handleSearch: performSearch } = useSearch();

  const [selectedStation, setSelectedStation] = useState<string | null>('INC-001');
  const [showDetails, setShowDetails] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isRecentAlertsModalOpen, setIsRecentAlertsModalOpen] = useState(false);

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

  const handleNewEvent = (eventData: any) => {
    const newEvent = addIncident(eventData);
    setIsNewEventModalOpen(false);
    setSelectedStation(newEvent.id);
  };

  const handleSearch = async (query: string | { lat: number, lng: number, label?: string, zoom?: number }) => {
    const result = await performSearch(query);
    if (result) {
      generateMockEvents(result.lat, result.lng);
    }
  };

  const selectedIncident = incidents.find(i => i.id === selectedStation);

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

      {/* New Event Modal */}
      {isNewEventModalOpen && (
        <NewEventModal 
          onClose={() => setIsNewEventModalOpen(false)} 
          onSave={handleNewEvent}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Recent Alerts Modal */}
      <RecentAlertsModal 
        isOpen={isRecentAlertsModalOpen}
        onClose={() => setIsRecentAlertsModalOpen(false)}
        incidents={incidents}
        isDarkMode={isDarkMode}
        onSelectIncident={(incident) => {
          flyToCoordinates(incident.lat, incident.lng, 15);
          setSelectedStation(incident.id);
          setShowDetails(true);
        }}
      />

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar 
          onClose={() => setIsSidebarOpen(false)} 
          currentCity={currentCity}
          incidents={incidents}
          onOpenRecentAlerts={() => setIsRecentAlertsModalOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col relative w-full">
        <div className="absolute inset-0">
          <MapArea 
            incidents={filteredIncidents}
            onSelectStation={handleSelectStation} 
            selectedStation={selectedStation} 
            onOpenDetails={() => setShowDetails(true)}
            showDetails={showDetails}
            isDarkMode={isDarkMode}
            flyToCoordinates={flyToCoordinates}
            isNewsModalOpen={isNewsModalOpen}
          />
        </div>
        
        <div className="absolute top-0 left-0 right-0 pointer-events-none z-10">
          <TopBar 
            onMenuClick={() => setIsSidebarOpen(true)} 
            isDarkMode={isDarkMode} 
            toggleTheme={toggleTheme}
            severityFilter={severityFilter}
            setSeverityFilter={setSeverityFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            timeFilter={timeFilter}
            setTimeFilter={setTimeFilter}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            onNewEvent={() => setIsNewEventModalOpen(true)}
            onSearch={handleSearch}
          />
        </div>

        <AnimatePresence>
          {showDetails && selectedStation && selectedIncident && (
            <motion.div 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-20 right-0 bottom-0 md:right-6 md:bottom-6 w-full md:w-[380px] pointer-events-auto z-30"
            >
              <StationDetails incident={selectedIncident} onClose={() => setShowDetails(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* News Card */}
        <AnimatePresence>
          {selectedIncident && selectedIncident.news && (
            <NewsCard 
              news={selectedIncident.news} 
              incident={selectedIncident}
              isDarkMode={isDarkMode} 
              isModalOpen={isNewsModalOpen}
              onOpenModal={() => setIsNewsModalOpen(true)}
              onCloseModal={() => setIsNewsModalOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
