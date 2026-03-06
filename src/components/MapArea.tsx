import { useState, useMemo, useRef, useEffect } from 'react';
import { Layers, Box, Plus, Minus } from 'lucide-react';
import Map, { Marker, Popup, Source, Layer, MapRef } from 'react-map-gl/maplibre';
import type { FillLayerSpecification, LineLayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'motion/react';
import { Incident } from '../types/Incident';
import IncidentMarker from './IncidentMarker';
import IncidentPopup from './IncidentPopup';
import OffScreenIndicator from './OffScreenIndicator';

// Carto basemap styles (free to use without API key for dev/demo)
const DARK_MAP_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const LIGHT_MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Helper to create GeoJSON for circles (zones)
const createGeoJSONCircle = (center: [number, number], radiusInKm: number, points = 64) => {
  const coords = {
    latitude: center[1],
    longitude: center[0]
  };

  const km = radiusInKm;

  const ret = [];
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  let theta, x, y;
  for (let i = 0; i < points; i++) {
    theta = (i / points) * (2 * Math.PI);
    x = distanceX * Math.cos(theta);
    y = distanceY * Math.sin(theta);

    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [ret]
    }
  };
};

export default function MapArea({ 
  incidents,
  onSelectStation, 
  selectedStation,
  onOpenDetails,
  showDetails,
  isDarkMode,
  flyToCoordinates,
  isNewsModalOpen
}: { 
  incidents: Incident[],
  onSelectStation: (id: string | null) => void, 
  selectedStation: string | null,
  onOpenDetails: () => void,
  showDetails: boolean,
  isDarkMode: boolean,
  flyToCoordinates?: { lat: number, lng: number, zoom?: number } | null,
  isNewsModalOpen?: boolean
}) {
  const mapRef = useRef<MapRef>(null);
  const [is3D, setIs3D] = useState(true);
  
  // Off-screen indicator state
  const [isOffScreen, setIsOffScreen] = useState(false);
  const [bearingToIncident, setBearingToIncident] = useState(0);

  // Find selected incident object
  const selectedIncidentData = incidents.find(s => s.id === selectedStation);

  // Handle map movement to update off-screen indicator
  const handleMapMove = () => {
    if (!mapRef.current || !selectedIncidentData) {
      setIsOffScreen(false);
      return;
    }

    const map = mapRef.current.getMap();
    const bounds = map.getBounds();
    const incidentLngLat = { lng: selectedIncidentData.lng, lat: selectedIncidentData.lat };

    // Check if incident is in view
    const inView = bounds.contains(incidentLngLat);
    setIsOffScreen(!inView);

    if (!inView) {
      // Calculate bearing for arrow
      const center = map.getCenter();
      const centerPixel = map.project(center);
      const targetPixel = map.project(incidentLngLat);
      
      // Calculate angle in radians
      const angleRad = Math.atan2(targetPixel.y - centerPixel.y, targetPixel.x - centerPixel.x);
      
      // Convert to degrees and adjust for arrow pointing up (add 90 degrees)
      // atan2 returns angle from X axis (Right). ArrowUp points Up (-Y).
      // So 0 deg (Right) should rotate arrow 90 deg.
      // Wait, let's simplify:
      // If target is to the Right (0 deg), arrow should point Right (90 deg rotation).
      // If target is Up (-90 deg), arrow should point Up (0 deg rotation).
      // Formula: (angleRad * 180 / Math.PI) + 90
      const angleDeg = (angleRad * 180 / Math.PI) + 90;
      setBearingToIncident(angleDeg);
    }
  };

  // Update indicator when selection changes
  useEffect(() => {
    handleMapMove();
  }, [selectedStation, selectedIncidentData]);

  // Handle FlyTo
  useEffect(() => {
    if (flyToCoordinates && mapRef.current) {
      mapRef.current.flyTo({
        center: [flyToCoordinates.lng, flyToCoordinates.lat],
        zoom: flyToCoordinates.zoom || 13,
        duration: 2000,
        essential: true
      });
    }
  }, [flyToCoordinates]);
  
  // State for affected area animation
  const [activeArea, setActiveArea] = useState<any>(null);
  const [areaOpacity, setAreaOpacity] = useState(0);

  // Handle affected area transitions
  useEffect(() => {
    if (selectedStation && selectedIncidentData) {
      // Immediate update for responsiveness
      const newArea = createGeoJSONCircle(
        [selectedIncidentData.lng, selectedIncidentData.lat], 
        selectedIncidentData.radius / 1000 // Convert meters to km
      );
      setActiveArea(newArea);
      // Small delay to ensure render happens before opacity transition
      requestAnimationFrame(() => setAreaOpacity(1));
    } else {
      // Deselect - fade out
      setAreaOpacity(0);
      const timer = setTimeout(() => {
        setActiveArea(null);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [selectedStation, selectedIncidentData]);

  // Define static zones
  const highRiskZone = useMemo(() => createGeoJSONCircle([-51.0700, -21.6850], 0.4), []);
  const weatherZone = useMemo(() => createGeoJSONCircle([-51.0780, -21.6790], 0.6), []);

  // Handle 2D/3D toggle
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        pitch: is3D ? 45 : 0,
        bearing: is3D ? -10 : 0,
        duration: 1000
      });
    }
  }, [is3D]);

  const getSeverityColor = (severity?: string) => {
    switch(severity) {
      case 'critical': return '#EF4444';
      case 'high': return '#F97316';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#3B82F6';
    }
  };

  return (
    <div className="absolute inset-0 bg-gray-100 dark:bg-[#0D0D0D] overflow-hidden transition-colors duration-300">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: -51.0737,
          latitude: -21.6820,
          zoom: 13,
          pitch: 45, // Initial 3D perspective
          bearing: -10
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={isDarkMode ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        attributionControl={false}
        onClick={() => onSelectStation(null)}
        onMove={handleMapMove}
      >
        {/* Off-Screen Indicator */}
        <AnimatePresence>
          {selectedIncidentData && isOffScreen && (
            <OffScreenIndicator
              incident={selectedIncidentData}
              angle={bearingToIncident}
              onClose={() => onSelectStation(null)}
              onClick={() => {
                mapRef.current?.flyTo({
                  center: [selectedIncidentData.lng, selectedIncidentData.lat],
                  zoom: 14,
                  duration: 1500
                });
              }}
              isDarkMode={isDarkMode}
            />
          )}
        </AnimatePresence>

        {/* Custom Controls Container */}
        <div className="absolute bottom-8 right-[10px] z-10 flex flex-col gap-2">
          {/* 2D/3D Toggle */}
          <button
            onClick={() => setIs3D(!is3D)}
            className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333] w-10 h-10 flex items-center justify-center rounded-md shadow-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors"
            title={is3D ? "Mudar para 2D" : "Mudar para 3D"}
          >
            {is3D ? <Layers size={20} /> : <Box size={20} />}
          </button>

          {/* Zoom Controls */}
          <div className="flex flex-col bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333] rounded-md shadow-md overflow-hidden">
            <button
              onClick={() => mapRef.current?.zoomIn()}
              className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors border-b border-gray-200 dark:border-[#333]"
              title="Aumentar Zoom"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => mapRef.current?.zoomOut()}
              className="w-10 h-10 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors"
              title="Diminuir Zoom"
            >
              <Minus size={20} />
            </button>
          </div>
        </div>

        {/* Static Zones Layers */}
        <Source id="high-risk-zone" type="geojson" data={highRiskZone as any}>
          <Layer
            id="high-risk-fill"
            type="fill"
            paint={{
              'fill-color': '#EF4444',
              'fill-opacity': 0.1
            }}
          />
          <Layer
            id="high-risk-line"
            type="line"
            paint={{
              'line-color': '#EF4444',
              'line-width': 2,
              'line-opacity': 0.5,
              'line-dasharray': [2, 2]
            }}
          />
        </Source>

        <Source id="weather-zone" type="geojson" data={weatherZone as any}>
          <Layer
            id="weather-fill"
            type="fill"
            paint={{
              'fill-color': '#3B82F6',
              'fill-opacity': 0.05
            }}
          />
          <Layer
            id="weather-line"
            type="line"
            paint={{
              'line-color': '#3B82F6',
              'line-width': 1,
              'line-opacity': 0.5,
              'line-dasharray': [4, 4]
            }}
          />
        </Source>

        {/* Dynamic Affected Area Layer */}
        {activeArea && (
          <Source id="active-area" type="geojson" data={activeArea}>
            <Layer
              id="active-area-fill"
              type="fill"
              paint={{
                'fill-color': getSeverityColor(selectedIncidentData?.severity),
                'fill-opacity': areaOpacity * 0.2,
                'fill-opacity-transition': { duration: 300 }
              }}
            />
            <Layer
              id="active-area-line"
              type="line"
              paint={{
                'line-color': getSeverityColor(selectedIncidentData?.severity),
                'line-width': 2,
                'line-opacity': areaOpacity * 0.8,
                'line-opacity-transition': { duration: 300 }
              }}
            />
          </Source>
        )}

        {/* Incident Markers */}
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            longitude={incident.lng}
            latitude={incident.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelectStation(incident.id);
            }}
            style={{ cursor: 'pointer', zIndex: selectedStation === incident.id ? 50 : 1 }}
          >
            <IncidentMarker 
              isSelected={selectedStation === incident.id} 
              type={incident.type} 
              severity={incident.severity}
              isDarkMode={isDarkMode} 
            />
          </Marker>
        ))}

        {/* Popup with AnimatePresence for exit animations */}
        <AnimatePresence mode="wait">
          {selectedStation && selectedIncidentData && !showDetails && !isNewsModalOpen && (
            <Popup
              key={selectedStation} // Key is crucial for AnimatePresence to detect changes
              longitude={selectedIncidentData.lng}
              latitude={selectedIncidentData.lat}
              anchor="bottom"
              offset={24}
              closeButton={false}
              closeOnClick={false}
              className="custom-popup"
              maxWidth="320px"
            >
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                onClick={(e) => e.stopPropagation()}
                className="relative z-[100]" // Ensure high z-index
              >
                <IncidentPopup 
                  incident={selectedIncidentData} 
                  onOpenDetails={onOpenDetails} 
                  onClose={() => onSelectStation(null)}
                  isDarkMode={isDarkMode}
                />
              </motion.div>
            </Popup>
          )}
        </AnimatePresence>
      </Map>
    </div>
  );
}
