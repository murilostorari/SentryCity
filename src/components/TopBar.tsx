import { useState, useRef, ChangeEvent, KeyboardEvent } from 'react';
import { Search, Check, BarChart, Calendar, Train, Target, RotateCw, Moon, Sun, Menu, Filter, Bell, ChevronDown, Clock, AlertTriangle, Activity, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { FilterDropdown, DropdownItem } from './FilterDropdown';

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
  onSearch
}: { 
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
  onSearch?: (query: string | { lat: number, lng: number, label?: string, zoom?: number }) => void
}) {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const handleSearch = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      if (abortController.current) abortController.current.abort();

      if (searchQuery.length > 2) {
        try {
          const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=1`);
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
             onSearch(searchQuery);
          }
        } catch (error) {
          console.error("Search failed:", error);
          onSearch(searchQuery);
        }
      } else {
        onSearch(searchQuery);
      }
      setShowSuggestions(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }

    if (value.length > 2) {
      searchTimeout.current = setTimeout(async () => {
        const controller = new AbortController();
        abortController.current = controller;

        try {
          const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&addressdetails=1&limit=5&countrycodes=br`);
          const data = await response.json();
          
          const suggestions = data.map((feature: any) => {
            const isStreet = feature.class === 'highway' || feature.type === 'residential' || feature.type === 'secondary' || feature.type === 'tertiary';
            return {
              display_name: feature.display_name,
              lat: feature.lat,
              lng: feature.lon,
              zoom: isStreet ? 17 : 13
            };
          });
          
          setSuggestions(suggestions);
          setShowSuggestions(true);
        } catch (error: any) {
          if (error.name === 'AbortError') return;
          
          setSuggestions([
            { display_name: 'Av. Paulista, São Paulo, Brasil', lat: -23.5614, lng: -46.6565, zoom: 16 },
            { display_name: 'Av. Copacabana, Rio de Janeiro, Brasil', lat: -22.9694, lng: -43.1868, zoom: 16 },
            { display_name: 'Esplanada dos Ministérios, Brasília, Brasil', lat: -15.7975, lng: -47.8618, zoom: 15 }
          ]);
          setShowSuggestions(true);
        }
      }, 1000);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: any) => {
    setSearchQuery(suggestion.display_name);
    setShowSuggestions(false);
    if (onSearch) {
      onSearch({
        lat: typeof suggestion.lat === 'string' ? parseFloat(suggestion.lat) : suggestion.lat,
        lng: typeof suggestion.lng === 'string' ? parseFloat(suggestion.lng) : suggestion.lng,
        label: suggestion.display_name,
        zoom: suggestion.zoom || 16
      });
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

        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#666666]" size={16} />
          <input 
            type="text" 
            placeholder="Buscar incidentes, locais..." 
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleSearch}
            className="bg-white dark:bg-[#161616] border border-gray-200 dark:border-[#2C2C2C] rounded-lg pl-10 pr-16 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#666666] focus:outline-none focus:border-blue-500 dark:focus:border-[#444444] w-[320px] transition-colors shadow-sm"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <span className="bg-gray-100 dark:bg-[#262626] text-gray-500 dark:text-[#888888] text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-[#333333]">/</span>
          </div>

          <AnimatePresence>
            {showSuggestions && suggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-full mt-2 left-0 w-full bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#2C2C2C] rounded-lg shadow-xl p-2 z-50"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md truncate"
                  >
                    {suggestion.display_name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
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

        <div className="w-9 h-9 bg-gray-900 dark:bg-[#333] rounded-lg flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity shadow-sm border border-gray-200 dark:border-[#444]">
          OS
        </div>
      </div>
    </div>
  );
}
