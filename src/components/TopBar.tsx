import { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Search, Check, Moon, Sun, Menu, Filter, Clock, AlertTriangle, Activity, Tag, LogIn, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FilterDropdown, DropdownItem } from './FilterDropdown';
import UserMenu from './UserMenu';
import { User } from '@supabase/supabase-js';
import { Profile } from '../types/Profile';

interface TopBarProps {
  onMenuClick?: () => void,
  isDarkMode?: boolean,
  toggleTheme?: () => void,
  severityFilter?: string[],
  setSeverityFilter?: (filters: string[]) => void,
  statusFilter?: string,
  setStatusFilter?: (status: string) => void,
  timeFilter?: number,
  setTimeFilter?: (hours: number) => void,
  typeFilter?: string[],
  setTypeFilter?: (filters: string[]) => void,
  onNewEvent?: () => void,
  onSearch?: (query: string | { lat: number, lng: number, label?: string, zoom?: number }) => void,
  isAuthenticated?: boolean,
  user?: User | null,
  profile?: Profile | null,
  authLoading?: boolean,
  onLogin?: () => void,
  onSignup?: () => void,
  onLogout?: () => void,
  currentCity?: string,
  onCitySelect?: (city: { lat: number, lng: number, name: string, state: string }) => void,
}

interface CitySuggestion {
  lat: number;
  lng: number;
  name: string;
  state: string;
  displayName: string;
}

export default function TopBar({
  onMenuClick,
  isDarkMode,
  toggleTheme,
  severityFilter,
  setSeverityFilter,
  statusFilter,
  setStatusFilter,
  timeFilter,
  setTimeFilter,
  typeFilter,
  setTypeFilter,
  onNewEvent,
  onSearch,
  isAuthenticated,
  user,
  profile,
  authLoading,
  onLogin,
  onSignup,
  onLogout,
  currentCity = 'Adamantina, SP',
  onCitySelect,
}: TopBarProps) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [selectedCityLabel, setSelectedCityLabel] = useState(currentCity);
  const [loadingCities, setLoadingCities] = useState(false);
  const cityTimeout = useRef<NodeJS.Timeout | null>(null);
  const cityAbortController = useRef<AbortController | null>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);

  const searchCities = async (query: string) => {
    if (query.length < 2) {
      setCitySuggestions([]);
      return;
    }
    setLoadingCities(true);
    if (cityAbortController.current) cityAbortController.current.abort();
    const controller = new AbortController();
    cityAbortController.current = controller;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=8&countrycodes=br&featuretype=city`,
        { signal: controller.signal, headers: { Accept: 'application/json' } }
      );
      if (!response.ok) return;
      const data = await response.json();
      const suggestions: CitySuggestion[] = data
        .filter((item: any) => {
          const addr = item.address || {};
          return addr.city || addr.town || addr.village || addr.municipality || addr.state;
        })
        .map((item: any) => {
          const addr = item.address || {};
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          const state = addr.state || '';
          return {
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            name: city,
            state: state,
            displayName: item.display_name,
          };
        });
      setCitySuggestions(suggestions);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error("City search failed:", error);
    } finally {
      setLoadingCities(false);
    }
  };

  useEffect(() => {
    if (citySearchQuery.length > 1) {
      if (cityTimeout.current) clearTimeout(cityTimeout.current);
      cityTimeout.current = setTimeout(() => {
        searchCities(citySearchQuery);
        setShowCityDropdown(true);
      }, 300);
    } else {
      setCitySuggestions([]);
      setShowCityDropdown(false);
    }
    return () => {
      if (cityTimeout.current) clearTimeout(cityTimeout.current);
    };
  }, [citySearchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityInputRef.current && !cityInputRef.current.closest('.city-search-wrapper')?.contains(event.target as Node)) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCitySelect = (suggestion: CitySuggestion) => {
    const label = `${suggestion.name}, ${suggestion.state}`;
    setSelectedCityLabel(label);
    setCitySearchQuery(label);
    setShowCityDropdown(false);
    if (onCitySelect) {
      onCitySelect(suggestion);
    }
    if (onSearch) {
      onSearch({
        lat: suggestion.lat,
        lng: suggestion.lng,
        label: label,
        zoom: 13
      });
    }
  };

  const handleSearch = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      const query = citySearchQuery;
      if (query.length > 2) {
        try {
          const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`);
          const data = await response.json();
          if (data.features && data.features.length > 0) {
            const feature = data.features[0];
            const name = [feature.properties.name, feature.properties.city, feature.properties.country].filter(Boolean).join(', ');
            onSearch({
              lat: feature.geometry.coordinates[1],
              lng: feature.geometry.coordinates[0],
              label: name
            });
          } else {
            onSearch(query);
          }
        } catch (error) {
          console.error("Search failed:", error);
          onSearch(query);
        }
      } else {
        onSearch(query);
      }
      setShowCityDropdown(false);
    }
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const handleSeverityToggle = (severity: string) => {
    if (!severityFilter || !setSeverityFilter) return;
    if (severityFilter.includes(severity)) {
      setSeverityFilter(severityFilter.filter(s => s !== severity));
    } else {
      setSeverityFilter([...severityFilter, severity]);
    }
  };

  const handleSelectAllSeverity = () => {
    if (!setSeverityFilter) return;
    const allSeverities = ['critical', 'high', 'medium', 'low'];
    if (severityFilter?.length === allSeverities.length) {
      setSeverityFilter([]);
    } else {
      setSeverityFilter(allSeverities);
    }
  };

  const handleTypeToggle = (type: string) => {
    if (!typeFilter || !setTypeFilter) return;
    if (typeFilter.includes(type)) {
      setTypeFilter(typeFilter.filter(t => t !== type));
    } else {
      setTypeFilter([...typeFilter, type]);
    }
  };

  const handleSelectAllTypes = () => {
    if (!setTypeFilter) return;
    const allTypes = ['accident', 'power', 'weather', 'pothole', 'show', 'party', 'noise', 'inauguration', 'other'];
    if (typeFilter?.length === allTypes.length) {
      setTypeFilter([]);
    } else {
      setTypeFilter(allTypes);
    }
  };

  const translateSeverity = (sev: string) => {
    switch(sev) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return sev;
    }
  };

  const translateStatus = (status: string) => {
    switch(status) {
      case 'all': return 'Todos';
      case 'active': return 'Ativos';
      case 'resolved': return 'Resolvidos';
      default: return status;
    }
  };

  const translateType = (type: string) => {
    switch(type) {
      case 'accident': return 'Acidente';
      case 'power': return 'Energia';
      case 'weather': return 'Clima';
      case 'pothole': return 'Buraco';
      case 'show': return 'Show';
      case 'party': return 'Festa';
      case 'noise': return 'Barulho';
      case 'inauguration': return 'Inauguração';
      case 'other': return 'Outro';
      default: return type;
    }
  };

  const allTypes = ['accident', 'power', 'weather', 'pothole', 'show', 'party', 'noise', 'inauguration', 'other'];
  const allSeverities = ['critical', 'high', 'medium', 'low'];

  return (
    <div className="flex items-center justify-between p-4 md:p-6 pointer-events-auto bg-transparent">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="p-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-gray-500 dark:text-[#888888] md:hidden shadow-sm"
        >
          <Menu size={20} />
        </button>

        <div className="hidden md:block city-search-wrapper">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#666666]" size={16} />
            <input
              ref={cityInputRef}
              type="text"
              placeholder="Buscar cidade..."
              value={citySearchQuery}
              onChange={(e) => setCitySearchQuery(e.target.value)}
              onKeyDown={handleSearch}
              onFocus={() => {
                if (citySuggestions.length > 0 || citySearchQuery.length > 1) {
                  setShowCityDropdown(true);
                }
              }}
              className="bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#2C2C2C] rounded-lg pl-10 pr-16 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#666666] focus:outline-none focus:border-blue-500 dark:focus:border-[#444444] w-[300px] transition-colors shadow-sm"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <span className="bg-gray-100 dark:bg-[#262626] text-gray-500 dark:text-[#888888] text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#333333]">/</span>
            </div>

            <AnimatePresence>
              {showCityDropdown && (citySuggestions.length > 0 || loadingCities) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full mt-2 left-0 w-full bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg shadow-xl p-2 z-[60] max-h-64 overflow-y-auto no-scrollbar"
                >
                  {loadingCities ? (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-[#888888] flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Carregando...
                    </div>
                  ) : (
                    citySuggestions.map((city, index) => (
                      <button
                        key={`${city.name}-${city.state}-${index}`}
                        onClick={() => handleCitySelect(city)}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md flex items-center justify-between"
                      >
                        <span>{city.displayName}</span>
                        {selectedCityLabel === `${city.name}, ${city.state}` && <Check size={14} className="text-blue-500" />}
                      </button>
                    ))
                  )}
                  {!loadingCities && citySuggestions.length === 0 && citySearchQuery.length > 1 && (
                    <div className="px-3 py-2 text-sm text-gray-500 dark:text-[#888888]">
                      Nenhuma cidade encontrada
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Type Filter */}
        <div className="hidden md:block">
          <FilterDropdown
            label="Tipo"
            icon={<Tag size={16} className="text-gray-500 dark:text-[#888888]" />}
            active={activeDropdown === 'type'}
            onToggle={() => toggleDropdown('type')}
            className={typeFilter?.length ? 'border-blue-500' : ''}
          >
            <DropdownItem
              label="Selecionar Todos"
              onClick={handleSelectAllTypes}
              selected={typeFilter?.length === allTypes.length}
              className="font-semibold border-b border-gray-100 dark:border-[#333] mb-1"
            />
            {allTypes.map((type) => (
              <DropdownItem
                key={type}
                label={translateType(type)}
                onClick={() => handleTypeToggle(type)}
                selected={typeFilter?.includes(type)}
              />
            ))}
          </FilterDropdown>
        </div>

        {/* Severity Filter */}
        <div className="hidden md:block">
          <FilterDropdown
            label="Severidade"
            icon={
              <div className="w-4 h-4 rounded bg-red-500 dark:bg-[#EF4444] flex items-center justify-center">
                <AlertTriangle size={10} className="text-white" />
              </div>
            }
            active={activeDropdown === 'severity'}
            onToggle={() => toggleDropdown('severity')}
            className={severityFilter?.length ? 'border-red-500' : ''}
          >
            <DropdownItem
              label="Selecionar Todos"
              onClick={handleSelectAllSeverity}
              selected={severityFilter?.length === allSeverities.length}
              className="font-semibold border-b border-gray-100 dark:border-[#333] mb-1"
            />
            {allSeverities.map((sev) => (
              <DropdownItem
                key={sev}
                label={translateSeverity(sev)}
                onClick={() => handleSeverityToggle(sev)}
                selected={severityFilter?.includes(sev)}
              />
            ))}
          </FilterDropdown>
        </div>

        {/* Time Filter */}
        <div className="hidden lg:block">
          <FilterDropdown
            label={timeFilter === 24 ? '24h' : `${timeFilter}h`}
            icon={<Clock size={16} className="text-gray-500 dark:text-[#888888]" />}
            active={activeDropdown === 'time'}
            onToggle={() => toggleDropdown('time')}
          >
            {[1, 6, 12, 24, 48].map((hours) => (
              <DropdownItem
                key={hours}
                label={`Últimas ${hours}h`}
                onClick={() => {
                  setTimeFilter?.(hours);
                  setActiveDropdown(null);
                }}
                selected={timeFilter === hours}
              />
            ))}
          </FilterDropdown>
        </div>

        {/* Status Filter */}
        <div className="hidden lg:block">
          <FilterDropdown
            label={translateStatus(statusFilter || 'all')}
            icon={<Activity size={16} className="text-gray-500 dark:text-[#888888]" />}
            active={activeDropdown === 'status'}
            onToggle={() => toggleDropdown('status')}
          >
            {['all', 'active', 'resolved'].map((status) => (
              <DropdownItem
                key={status}
                label={translateStatus(status)}
                onClick={() => {
                  setStatusFilter?.(status);
                  setActiveDropdown(null);
                }}
                selected={statusFilter === status}
              />
            ))}
          </FilterDropdown>
        </div>

        <button
          onClick={toggleTheme}
          className="p-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-gray-500 dark:text-[#888888] hover:text-gray-900 dark:hover:text-white transition-colors shadow-sm"
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          onClick={onNewEvent}
          className="px-4 py-2 bg-blue-600 dark:bg-[#3B82F6] text-white rounded-lg text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors shadow-sm"
        >
          Novo Evento
        </button>

        {isAuthenticated && user ? (
          <UserMenu
            user={user}
            profile={profile ?? null}
            isDarkMode={!!isDarkMode}
            onLogout={() => onLogout?.()}
          />
        ) : authLoading ? (
          <div className="w-16 h-9 rounded-lg bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] shadow-sm flex items-center justify-center">
            <Loader2 size={14} className="animate-spin text-gray-400 dark:text-[#666666]" />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onSignup}
              className="hidden sm:block px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors shadow-sm"
            >
              Criar conta
            </button>
            <button
              onClick={onLogin}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 dark:bg-[#3B82F6] text-white rounded-lg text-sm font-medium hover:bg-gray-800 dark:hover:bg-blue-500 transition-colors shadow-sm"
            >
              <LogIn size={14} />
              Entrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}