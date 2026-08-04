import React, { useState, useRef, useEffect } from 'react';
import { X, Save, ChevronDown, Check, MapPin, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ResponsiveModal from './ResponsiveModal';
import { searchAddressSuggestions, geocodeAddress } from '../services/geocoding';

interface NewEventModalProps {
  onClose: () => void;
  onSave: (event: any) => void;
  isDarkMode: boolean;
}

export default function NewEventModal({ onClose, onSave, isDarkMode }: NewEventModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [type, setType] = useState('accident');
  const [severity, setSeverity] = useState('medium');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLFormElement>(null);

  // Address Autocomplete State
  const [streetSuggestions, setStreetSuggestions] = useState<any[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
  const [showStreetSuggestions, setShowStreetSuggestions] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const streetTimeout = useRef<NodeJS.Timeout | null>(null);
  const cityTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string, kind: 'street' | 'city') => {
    if (query.length < 3) return;

    try {
      const results = await searchAddressSuggestions(
        query,
        kind === 'street' && city ? { city } : undefined
      );
      // O serviço retorna { lat, lng, displayName, raw }; a UI usa display_name/lat/lon.
      const data = results.map((r) => r.raw);

      if (kind === 'street') {
        setStreetSuggestions(data);
        setShowStreetSuggestions(true);
      } else {
        setCitySuggestions(data);
        setShowCitySuggestions(true);
      }
    } catch (error) {
      console.error('[v0] Failed to fetch suggestions', error);
    }
  };

  const handleStreetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setStreet(value);
    setCoordinates(null); // Reset coordinates when user types manually

    if (streetTimeout.current) clearTimeout(streetTimeout.current);
    if (value.length > 2) {
      streetTimeout.current = setTimeout(() => fetchSuggestions(value, 'street'), 500);
    } else {
      setStreetSuggestions([]);
      setShowStreetSuggestions(false);
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCity(value);
    
    if (cityTimeout.current) clearTimeout(cityTimeout.current);
    if (value.length > 2) {
      cityTimeout.current = setTimeout(() => fetchSuggestions(value, 'city'), 500);
    } else {
      setCitySuggestions([]);
      setShowCitySuggestions(false);
    }
  };

  const selectStreet = (suggestion: any) => {
    setStreet(suggestion.display_name.split(',')[0]); // Try to get just the street part
    setCoordinates({
      lat: parseFloat(suggestion.lat),
      lng: parseFloat(suggestion.lon)
    });
    setShowStreetSuggestions(false);

    const addr = suggestion.address || {};
    // Auto-fill city if available and empty
    if (!city && (addr.city || addr.town || addr.village)) {
      setCity(addr.city || addr.town || addr.village);
    }
    // Auto-fill state (sigla) if available and empty
    if (!state && (addr['ISO3166-2-lvl4'] || addr.state)) {
      setState((addr['ISO3166-2-lvl4']?.split('-')[1]) || addr.state || '');
    }
  };

  const selectCity = (suggestion: any) => {
    const addr = suggestion.address || {};
    setCity(addr.city || addr.town || addr.village || suggestion.display_name.split(',')[0]);
    if (addr['ISO3166-2-lvl4'] || addr.state) {
      setState((addr['ISO3166-2-lvl4']?.split('-')[1]) || addr.state || '');
    }
    setShowCitySuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      let finalLat = coordinates?.lat;
      let finalLng = coordinates?.lng;
      let resolvedCity = city;
      let resolvedState = state;

      // Sem coordenadas de uma sugestão, geocodifica o endereço completo.
      if (finalLat == null || finalLng == null) {
        const result = await geocodeAddress(`${street}, ${city}`);
        if (!result) {
          setSubmitError(
            'Não foi possível localizar esse endereço. Selecione uma sugestão ou verifique os dados.'
          );
          setIsSubmitting(false);
          return;
        }
        finalLat = result.lat;
        finalLng = result.lng;
        if (!resolvedCity) resolvedCity = result.city;
        if (!resolvedState) resolvedState = result.state;
      }

      await onSave({
        title,
        description,
        type,
        severity,
        status: 'active',
        lat: finalLat,
        lng: finalLng,
        address: street,
        city: resolvedCity,
        state: resolvedState,
      });
    } catch (error: any) {
      console.error('[v0] Falha ao salvar evento:', error);
      setSubmitError(error?.message ?? 'Erro ao salvar o evento. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const translateType = (t: string) => {
    switch(t) {
      case 'accident': return 'Acidente';
      case 'power': return 'Energia';
      case 'weather': return 'Clima';
      case 'pothole': return 'Buraco';
      case 'show': return 'Show/Concerto';
      case 'party': return 'Festa/Evento';
      case 'noise': return 'Barulho/Reclamação';
      case 'inauguration': return 'Inauguração';
      case 'other': return 'Outro';
      default: return t;
    }
  };

  const translateSeverity = (s: string) => {
    switch(s) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Médio';
      case 'low': return 'Baixo';
      default: return s;
    }
  };

  const toggleDropdown = (name: string) => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  return (
    <ResponsiveModal isOpen={true} onClose={onClose} className="max-w-md" isDarkMode={isDarkMode}>
      <div className={`flex items-center justify-between p-4 border-b shrink-0 ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
        <h2 className="text-lg font-semibold">Novo Evento</h2>
        <button 
          onClick={onClose} 
          className={`hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-colors ${isDarkMode ? 'bg-[#2A2A2A] text-[#888888] hover:text-white hover:bg-[#333333]' : 'bg-gray-100 text-gray-500 hover:text-black hover:bg-gray-200'}`}
        >
          <X size={16} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 no-scrollbar" ref={dropdownRef}>
        <div>
          <label className="block text-sm font-medium mb-1 opacity-70">Título</label>
          <input 
            type="text" 
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
            placeholder="Ex: Acidente na via principal"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 opacity-70">Descrição</label>
          <textarea 
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
            placeholder="Descreva o evento..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1 opacity-70">Rua</label>
            <input 
              type="text" 
              required
              value={street}
              onChange={handleStreetChange}
              className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              placeholder="Nome da rua"
            />
            <AnimatePresence>
              {showStreetSuggestions && streetSuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-full mt-1 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto no-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                >
                  {streetSuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectStreet(suggestion)}
                      className={`w-full text-left px-3 py-2 text-xs rounded-md truncate flex items-center gap-2 ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <MapPin size={12} className="shrink-0 opacity-50" />
                      {suggestion.display_name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium mb-1 opacity-70">Cidade</label>
            <input 
              type="text" 
              required
              value={city}
              onChange={handleCityChange}
              className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] focus:border-blue-500' : 'bg-white border-gray-300 focus:border-blue-500'} outline-none transition-colors`}
              placeholder="Nome da cidade"
            />
            <AnimatePresence>
              {showCitySuggestions && citySuggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-full mt-1 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto no-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                >
                  {citySuggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectCity(suggestion)}
                      className={`w-full text-left px-3 py-2 text-xs rounded-md truncate flex items-center gap-2 ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <MapPin size={12} className="shrink-0 opacity-50" />
                      {suggestion.display_name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium mb-1 opacity-70">Tipo</label>
            <button 
              type="button"
              onClick={() => toggleDropdown('type')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] hover:bg-[#333]' : 'bg-white border-gray-300 hover:bg-gray-50'} transition-colors`}
            >
              <span>{translateType(type)}</span>
              <ChevronDown size={16} className={`transition-transform ${activeDropdown === 'type' ? 'rotate-180' : ''}`} />
            </button>
            
            <AnimatePresence>
              {activeDropdown === 'type' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-full mt-2 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto no-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                >
                  {['accident', 'power', 'weather', 'pothole', 'show', 'party', 'noise', 'inauguration', 'other'].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setType(t);
                        setActiveDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md capitalize ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <span>{translateType(t)}</span>
                      {type === t && <Check size={14} className="text-blue-500" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium mb-1 opacity-70">Severidade</label>
            <button 
              type="button"
              onClick={() => toggleDropdown('severity')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-[#2C2C2C] border-[#444] hover:bg-[#333]' : 'bg-white border-gray-300 hover:bg-gray-50'} transition-colors`}
            >
              <span>{translateSeverity(severity)}</span>
              <ChevronDown size={16} className={`transition-transform ${activeDropdown === 'severity' ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {activeDropdown === 'severity' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-full mt-2 left-0 w-full rounded-lg shadow-xl p-1 z-[60] ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
                >
                  {['low', 'medium', 'high', 'critical'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSeverity(s);
                        setActiveDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md capitalize ${isDarkMode ? 'text-gray-200 hover:bg-[#2A2A2A]' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      <span>{translateSeverity(s)}</span>
                      {severity === s && <Check size={14} className="text-blue-500" />}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {submitError && (
          <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {submitError}
          </p>
        )}

        <div className="pt-4 flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 ${isDarkMode ? 'hover:bg-[#333]' : 'hover:bg-gray-100'} transition-colors`}
          >
            Cancelar
          </button>
          <button 
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSubmitting ? 'Salvando...' : 'Salvar Evento'}
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
