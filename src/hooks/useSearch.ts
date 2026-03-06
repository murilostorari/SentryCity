import { useState } from 'react';

interface SearchResult {
  lat: number;
  lng: number;
  zoom?: number;
  label?: string;
}

export function useSearch() {
  const [flyToCoordinates, setFlyToCoordinates] = useState<SearchResult | null>(null);
  const [currentCity, setCurrentCity] = useState('Adamantina, SP');

  const handleSearch = async (query: string | SearchResult) => {
    if (typeof query === 'object') {
      setFlyToCoordinates({ lat: query.lat, lng: query.lng, zoom: query.zoom || 16 });
      if (query.label) {
        const parts = query.label.split(',');
        setCurrentCity(parts[0]);
      }
      return { lat: query.lat, lng: query.lng };
    }

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1&countrycodes=br`);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const { lat, lon, display_name, class: osmClass, type: osmType } = data[0];
        const newLat = parseFloat(lat);
        const newLng = parseFloat(lon);
        
        const parts = display_name.split(',');
        setCurrentCity(parts[0]);

        const isStreet = osmClass === 'highway' || osmType === 'residential' || osmType === 'secondary' || osmType === 'tertiary' || osmType === 'road';
        const zoom = isStreet ? 17 : 13;

        setFlyToCoordinates({ lat: newLat, lng: newLng, zoom });
        return { lat: newLat, lng: newLng };
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
    return null;
  };

  return {
    flyToCoordinates,
    currentCity,
    handleSearch
  };
}
