import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import MapArea from './components/MapArea';
import StationDetails from './components/StationDetails';
import NewEventModal from './components/NewEventModal';
import NewsCard from './components/NewsCard';
import RecentAlertsModal from './components/RecentAlertsModal';
import AuthModal from './components/AuthModal';
import NewsIngestionModal from './components/NewsIngestionModal';
import { ToastProvider } from './components/Toast';
import { useIncidents } from './hooks/useIncidents';
import { useFilters } from './hooks/useFilters';
import { useSearch } from './hooks/useSearch';
import { useAuth } from './hooks/useAuth';
import { useIncidentNews } from './hooks/useIncidentNews';
import { useToast } from './components/Toast';
import { Incident } from './types/Incident';

type AuthMode = 'login' | 'signup' | 'reset' | 'newpassword';

export default function App() {
  const { incidents, addIncident, refresh } = useIncidents();
  const {
    filteredIncidents,
    severityFilter, setSeverityFilter,
    statusFilter, setStatusFilter,
    timeFilter, setTimeFilter,
    typeFilter, setTypeFilter
  } = useFilters(incidents);
  const { flyToCoordinates, currentCity, handleSearch: performSearch } = useSearch();
  const { user, profile, isAuthenticated, isLoading, signIn, signUp, signOut, resetPassword, confirmNewPassword, isPasswordRecovery } = useAuth();
  const toast = useToast();
  const [selectedCity, setSelectedCity] = useState<{ lat: number; lng: number; name: string; state: string } | null>(null);

  const filteredIncidentsByCity = useMemo(() => {
    if (!selectedCity) return filteredIncidents;
    const normalizedCity = selectedCity.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return filteredIncidents.filter(incident => {
      const normalizedAddress = (incident.address || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normalizedAddress.includes(normalizedCity);
    });
  }, [filteredIncidents, selectedCity]);

  const [selectedStation, setSelectedStation] = useState<string | null>('INC-001');
  const [showDetails, setShowDetails] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isNewEventModalOpen, setIsNewEventModalOpen] = useState(false);
  const [isNewsModalOpen, setIsNewsModalOpen] = useState(false);
  const [isRecentAlertsModalOpen, setIsRecentAlertsModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>('login');
  const [isNewsIngestionModalOpen, setIsNewsIngestionModalOpen] = useState(false);

  const openAuthModal = (mode: AuthMode = 'login') => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Quando o Supabase detecta um link de redefinição de senha (hash #access_token),
  // emite PASSWORD_RECOVERY → abre o modal para definir nova senha.
  useEffect(() => {
    if (isPasswordRecovery) {
      openAuthModal('newpassword');
    }
  }, [isPasswordRecovery]);

  const handleSelectStation = (id: string | null) => {
    setSelectedStation(id);
    if (!id) setShowDetails(false);
  };

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleNewEvent = async (eventData: any) => {
    try {
      const result = await addIncident(eventData);
      setIsNewEventModalOpen(false);

      if (result.merged) {
        toast.info(
          'Relato adicionado',
          `Evento existente: "${result.existingIncident?.title}" já registra esta ocorrência.`,
        );
      }

      setSelectedStation(result.incident.id);
    } catch (err) {
      console.error('Falha ao criar incidente:', err);
      toast.error('Erro', 'Não foi possível salvar o evento. Verifique a conexão e tente novamente.');
    }
  };

  const handleSearch = async (query: string | { lat: number, lng: number, label?: string, zoom?: number }) => {
    // A busca apenas reposiciona o mapa; os incidentes vêm do Supabase.
    await performSearch(query);
  };

  const handleNewsIngestionCreated = async (mergeResult?: { merged: boolean; incident?: any; existingIncident?: any }) => {
    await refresh();
    if (mergeResult?.merged) {
      toast.info(
        'Relato adicionado',
        `Evento existente: "${mergeResult.existingIncident?.title}" já registra esta ocorrência.`,
      );
    }
  };

  const selectedIncident = incidents.find(i => i.id === selectedStation);
  const { news: selectedIncidentNews } = useIncidentNews(selectedIncident?.id ?? null);

  return (
    <ToastProvider isDarkMode={isDarkMode}>
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
      <NewEventModal
        isOpen={isNewEventModalOpen}
        onClose={() => setIsNewEventModalOpen(false)}
        onSave={handleNewEvent}
        isDarkMode={isDarkMode}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        isDarkMode={isDarkMode}
        initialMode={authModalMode}
        onSignIn={signIn}
        onSignUp={signUp}
        onResetPassword={resetPassword}
        onConfirmNewPassword={confirmNewPassword}
      />

      {/* News Ingestion Modal (Admin) */}
      <NewsIngestionModal
        isOpen={isNewsIngestionModalOpen}
        onClose={() => setIsNewsIngestionModalOpen(false)}
        onCreated={handleNewsIngestionCreated}
        isDarkMode={isDarkMode}
      />

      {/* Recent Alerts Modal */}
      <RecentAlertsModal
        isOpen={isRecentAlertsModalOpen}
        onClose={() => setIsRecentAlertsModalOpen(false)}
        incidents={incidents}
        isDarkMode={isDarkMode}
        onSelectIncident={(incident) => {
          // Só voa até o evento no mapa se ele ainda estiver ativo.
          if (incident.status === 'active') {
            performSearch({ lat: incident.lat, lng: incident.lng, zoom: 15 });
          }
          setSelectedStation(incident.id);
          setShowDetails(true);
        }}
      />

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          onClose={() => setIsSidebarOpen(false)}
          currentCity={currentCity}
          incidents={filteredIncidentsByCity}
          onOpenRecentAlerts={() => setIsRecentAlertsModalOpen(true)}
          isAdmin={profile?.role === 'admin' || profile?.role === 'analyst'}
          onOpenNewsIngestion={() => setIsNewsIngestionModalOpen(true)}
        />
      </div>

      <div className="flex-1 flex flex-col relative w-full">
        <div className="absolute inset-0">
          <MapArea
            incidents={filteredIncidentsByCity}
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
            isAuthenticated={isAuthenticated}
            user={user}
            profile={profile}
            authLoading={isLoading}
            onLogin={() => openAuthModal('login')}
            onSignup={() => openAuthModal('signup')}
            onLogout={signOut}
            currentCity={currentCity}
            onCitySelect={(city) => setSelectedCity(city)}
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
              <StationDetails
                incident={selectedIncident}
                onClose={() => setShowDetails(false)}
                isAuthenticated={isAuthenticated}
                onRequireAuth={() => openAuthModal('login')}
                user={user}
                profile={profile}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* News Card */}
        <AnimatePresence>
          {selectedIncident && selectedIncidentNews.length > 0 && (
            <NewsCard
              news={selectedIncidentNews}
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
  </ToastProvider>
);
}
