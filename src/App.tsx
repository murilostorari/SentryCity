import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MapArea from './components/MapArea';
import StationDetails from './components/StationDetails';
import NewEventModal from './components/NewEventModal';
import NewsCard from './components/NewsCard';

export interface Incident {
  id: string;
  lat: number;
  lng: number;
  type: string;
  severity: string;
  status: string;
  title: string;
  description: string;
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
  };
}

// Mock data for incidents
const INITIAL_INCIDENTS: Incident[] = [
  { 
    id: 'INC-001', 
    lat: 52.359, 
    lng: 4.876, 
    type: 'accident', 
    severity: 'critical', 
    status: 'active', 
    title: 'Colisão Grave', 
    description: 'Acidente com múltiplos veículos bloqueando duas faixas.', 
    time: '12m atrás', 
    radius: 300, 
    timestamp: Date.now() - 12 * 60 * 1000,
    news: {
      source: 'G1 Globo',
      title: 'Acidente grave bloqueia trânsito no centro da cidade após colisão múltipla',
      description: 'Uma colisão envolvendo três veículos causou um grande congestionamento na manhã desta terça-feira. Equipes de resgate estão no local para atender as vítimas e liberar a via o mais rápido possível.',
      imageUrl: 'https://picsum.photos/seed/accident/300/200',
      url: 'https://g1.globo.com',
      time: '10 min atrás'
    }
  },
  { 
    id: 'INC-002', 
    lat: 52.362, 
    lng: 4.885, 
    type: 'power', 
    severity: 'high', 
    status: 'active', 
    title: 'Queda de Energia', 
    description: 'Falha de energia em todo o distrito relatada.', 
    time: '45m atrás', 
    radius: 1200, 
    timestamp: Date.now() - 45 * 60 * 1000,
    news: {
      source: 'CNN Brasil',
      title: 'Apagão atinge diversos bairros da zona sul; concessionária investiga causas',
      description: 'Moradores relatam falta de luz desde as 14h. Semáforos apagados causam confusão no trânsito da região.',
      imageUrl: 'https://picsum.photos/seed/power/300/200',
      url: 'https://www.cnnbrasil.com.br',
      time: '40 min atrás'
    }
  },
  { id: 'INC-003', lat: 52.355, lng: 4.890, type: 'pothole', severity: 'medium', status: 'investigating', title: 'Perigo na Estrada', description: 'Buraco profundo causando danos aos pneus.', time: '2h atrás', radius: 50, timestamp: Date.now() - 2 * 60 * 60 * 1000 },
  { id: 'INC-004', lat: 52.365, lng: 4.870, type: 'weather', severity: 'high', status: 'active', title: 'Inundação Urbana', description: 'Inundação na rua devido à chuva forte.', time: '5m atrás', radius: 800, timestamp: Date.now() - 5 * 60 * 1000 },
  { id: 'INC-005', lat: 52.350, lng: 4.880, type: 'accident', severity: 'low', status: 'cleared', title: 'Acidente Leve', description: 'Colisão traseira, liberada para o acostamento.', time: '3h atrás', radius: 100, timestamp: Date.now() - 3 * 60 * 60 * 1000 },
];

export default function App() {
  const [incidents, setIncidents] = useState<Incident[]>(INITIAL_INCIDENTS);
  const [selectedStation, setSelectedStation] = useState<string | null>('INC-001');
  const [showDetails, setShowDetails] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);

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

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
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
            <NewsCard news={selectedIncident.news} isDarkMode={isDarkMode} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
