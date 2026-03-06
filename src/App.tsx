import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MapArea from './components/MapArea';
import StationDetails from './components/StationDetails';
import NewEventModal from './components/NewEventModal';
import NewsCard from './components/NewsCard';
import RecentAlertsModal from './components/RecentAlertsModal';

export interface Incident {
  id: string;
  lat: number;
  lng: number;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
  address: string;
  time: string;
  radius: number;
  timestamp: number;
  news?: {
    source: string;
    title: string;
    description: string;
    imageUrl: string;
    url: string;
    time: string;
  }[];
}

// Mock data for incidents
const INITIAL_INCIDENTS: Incident[] = [
  { 
    id: 'INC-001', 
    lat: -21.6820, 
    lng: -51.0737, 
    type: 'accident', 
    severity: 'critical', 
    status: 'active', 
    title: 'Colisão Grave', 
    description: 'Acidente com múltiplos veículos bloqueando duas faixas.', 
    address: 'Av. Rio Branco, 500 - Centro, Adamantina - SP',
    time: '12m atrás', 
    radius: 300, 
    timestamp: Date.now() - 12 * 60 * 1000,
    news: [
      {
        source: 'G1 Presidente Prudente',
        title: 'Acidente grave bloqueia trânsito no centro de Adamantina',
        description: 'Uma colisão envolvendo três veículos causou um grande congestionamento na manhã desta terça-feira. Equipes de resgate estão no local.',
        imageUrl: 'https://picsum.photos/seed/accident/300/200',
        url: 'https://g1.globo.com/sp/presidente-prudente-regiao/',
        time: '10 min atrás'
      }
    ]
  },
  { 
    id: 'INC-002', 
    lat: -21.6850, 
    lng: -51.0700, 
    type: 'power', 
    severity: 'high', 
    status: 'active', 
    title: 'Queda de Energia', 
    description: 'Falha de energia em todo o bairro relatada.', 
    address: 'Rua Osvaldo Cruz, 200 - Vila Cicma, Adamantina - SP',
    time: '45m atrás', 
    radius: 1200, 
    timestamp: Date.now() - 45 * 60 * 1000,
    news: []
  },
  { id: 'INC-003', lat: -21.6880, lng: -51.0750, type: 'pothole', severity: 'medium', status: 'investigating', title: 'Perigo na Estrada', description: 'Buraco profundo causando danos aos pneus.', address: 'Av. Adhemar de Barros, 150 - Centro, Adamantina - SP', time: '2h atrás', radius: 50, timestamp: Date.now() - 2 * 60 * 60 * 1000 },
  { id: 'INC-004', lat: -21.6790, lng: -51.0780, type: 'weather', severity: 'high', status: 'active', title: 'Alagamento', description: 'Ponto de alagamento devido à chuva forte.', address: 'Via de Acesso, km 2 - Adamantina - SP', time: '5m atrás', radius: 800, timestamp: Date.now() - 5 * 60 * 1000 },
  { id: 'INC-005', lat: -21.6810, lng: -51.0720, type: 'accident', severity: 'low', status: 'cleared', title: 'Acidente Leve', description: 'Colisão traseira, liberada.', address: 'Rua Fioravante Spósito, 100 - Centro, Adamantina - SP', time: '3h atrás', radius: 100, timestamp: Date.now() - 3 * 60 * 60 * 1000 },
];

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_INCIDENTS);
  const [selectedStation, setSelectedStation] = useState<string | null>('INC-001');
  const [showDetails, setShowDetails] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [flyToCoordinates, setFlyToCoordinates] = useState<{ lat: number, lng: number, zoom?: number } | null>(null);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [currentCity, setCurrentCity] = useState('Adamantina, SP');
  const [isRecentAlertsModalOpen, setIsRecentAlertsModalOpen] = useState(false);

  // Filter States
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<number>(24); // hours
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

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
    const newEvent: Incident = {
      id: `INC-${Date.now()}`,
      ...eventData,
      timestamp: Date.now(),
      time: 'Agora',
      radius: 100 // Default radius
    };
    setIncidents([newEvent, ...incidents]);
    setIsNewEventModalOpen(false);
    setSelectedStation(newEvent.id); // Select the new event
  };

  const generateMockEvents = (lat: number, lng: number) => {
    const types = ['show', 'party', 'noise', 'inauguration', 'other'];
    const newEvents: Incident[] = Array.from({ length: 5 }).map((_, i) => {
      const type = types[Math.floor(Math.random() * types.length)];
      return {
        id: `LOC-${Date.now()}-${i}`,
        lat: lat + (Math.random() - 0.5) * 0.03,
        lng: lng + (Math.random() - 0.5) * 0.03,
        type,
        severity: Math.random() > 0.7 ? 'high' : 'medium',
        status: 'active',
        title: `Evento Local #${i + 1}`,
        description: `Evento do tipo ${type} detectado nesta região.`,
        address: `Rua Exemplo, ${100 + i * 50} - Bairro Local`,
        time: 'Agora',
        radius: 100 + Math.random() * 300,
        timestamp: Date.now()
      };
    });
    setIncidents(prev => [...newEvents, ...prev]);
  };

  const handleSearch = async (query: string | { lat: number, lng: number, label?: string, zoom?: number }) => {
    if (typeof query === 'object') {
      setFlyToCoordinates({ lat: query.lat, lng: query.lng, zoom: query.zoom || 16 });
      if (query.label) {
        // Extract city name if possible, otherwise use label
        const parts = query.label.split(',');
        setCurrentCity(parts[0]);
      }
      generateMockEvents(query.lat, query.lng);
      return;
    }

    try {
      // Use Nominatim with address details to better detect streets
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1&countrycodes=br`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name, class: osmClass, type: osmType } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        
        const parts = display_name.split(',');
        setCurrentCity(parts[0]);

        // Determine zoom based on type - streets get closer zoom
        const isStreet = osmClass === 'highway' || osmType === 'residential' || osmType === 'secondary' || osmType === 'tertiary' || osmType === 'road';
        const zoom = isStreet ? 17 : 13;

        setFlyToCoordinates({ lat: newLat, lng: newLng, zoom });
        generateMockEvents(newLat, newLng);
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  // Filter Logic
  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      // Severity Filter
      if (severityFilter.length > 0 && !severityFilter.includes(incident.severity)) {
        return false;
      }

      // Type Filter
      if (typeFilter.length > 0 && !typeFilter.includes(incident.type)) {
        return false;
      }

      // Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && ['cleared', 'resolved'].includes(incident.status)) return false;
        if (statusFilter === 'resolved' && !['cleared', 'resolved'].includes(incident.status)) return false;
      }

      // Time Filter (mock logic based on timestamp)
      const hoursAgo = (Date.now() - incident.timestamp) / (1000 * 60 * 60);
      if (hoursAgo > timeFilter) return false;

      return true;
    });
  }, [incidents, severityFilter, statusFilter, timeFilter, typeFilter]);

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
      <AnimatePresence>
        {isNewEventModalOpen && (
          <NewEventModal 
            onClose={() => setIsNewEventModalOpen(false)} 
            onSave={handleNewEvent}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      {/* Recent Alerts Modal */}
      <RecentAlertsModal 
        isOpen={isRecentAlertsModalOpen}
        onClose={() => setIsRecentAlertsModalOpen(false)}
        incidents={incidents}
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
