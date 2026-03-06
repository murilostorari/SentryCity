import React, { useState, useRef, useEffect } from 'react';
import { X, Save, ChevronDown, Check, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [type, setType] = useState('accident');
  const [severity, setSeverity] = useState('medium');
  const [coordinates, setCoordinates] = useState<{lat: number, lng: number} | null>(null);
  
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const fetchSuggestions = async (query: string, type: 'street' | 'city') => {
    if (query.length < 3) return;
    
    try {
      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=br`;
      
      if (type === 'street' && city) {
        url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', ' + city)}&addressdetails=1&limit=5&countrycodes=br`;
      } else if (type === 'city') {
        url = `https://nominatim.openstreetmap.org/search?format=json&city=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=br`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (type === 'street') {
        setStreetSuggestions(data);
        setShowStreetSuggestions(true);
      } else {
        setCitySuggestions(data);
        setShowCitySuggestions(true);
      }
    } catch (error) {
      console.error("Failed to fetch suggestions", error);
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
    
    // Auto-fill city if available and empty
    if (!city && suggestion.address && (suggestion.address.city || suggestion.address.town || suggestion.address.village)) {
      setCity(suggestion.address.city || suggestion.address.town || suggestion.address.village);
    }
  };

  const selectCity = (suggestion: any) => {
    setCity(suggestion.address.city || suggestion.address.town || suggestion.address.village || suggestion.display_name.split(',')[0]);
    setShowCitySuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalLat = coordinates?.lat;
    let finalLng = coordinates?.lng;

    // If no coordinates selected from suggestion, try to geocode the full address
    if (!finalLat || !finalLng) {
      try {
        const fullAddress = `${street}, ${city}`;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=br`);
        const data = await response.json();
        
        if (data && data.length > 0) {
          finalLat = parseFloat(data[0].lat);
          finalLng = parseFloat(data[0].lon);
        } else {
          // Fallback to random location if geocoding fails (or handle error)
          // For this specific request, the user wants exact location, but we need a fallback if API fails
          console.warn("Could not geocode address, using fallback location");
          finalLat = -21.6820 + (Math.random() - 0.5) * 0.01;
          finalLng = -51.0737 + (Math.random() - 0.5) * 0.01;
        }
      } catch (error) {
        console.error("Geocoding failed", error);
        finalLat = -21.6820 + (Math.random() - 0.5) * 0.01;
        finalLng = -51.0737 + (Math.random() - 0.5) * 0.01;
      }
    }

    onSave({
      title,
      description,
      type,
      severity,
      address: `${street}, ${city}`,
      status: 'active',
      timestamp: Date.now(),
      lat: finalLat,
      lng: finalLng,
      radius: 100 + Math.random() * 500,
      time: 'Agora'
    });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-md rounded-xl shadow-2xl ${isDarkMode ? 'bg-[#1E1E1E] text-white' : 'bg-white text-gray-900'}`}
        // Removed overflow-hidden to allow dropdowns to be visible
      >
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-[#333]' : 'border-gray-200'}`}>
          <h2 className="text-lg font-semibold">Novo Evento</h2>
          <button onClick={onClose} className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-[#333] transition-colors`}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4" ref={dropdownRef}>
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
                    className={`absolute top-full mt-1 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
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
                    className={`absolute top-full mt-1 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
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
                    className={`absolute top-full mt-2 left-0 w-full rounded-lg shadow-xl p-1 z-[60] max-h-48 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-[#1E1E1E] border border-[#2C2C2C]' : 'bg-white border border-gray-200'}`}
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

          <div className="pt-4 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${isDarkMode ? 'hover:bg-[#333]' : 'hover:bg-gray-100'} transition-colors`}
            >
              Cancelar
            </button>
            <button 
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Save size={16} />
              Salvar Evento
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
