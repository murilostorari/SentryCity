import { useState, useMemo, useRef, useEffect } from 'react';
import { Zap, AlertTriangle, CloudRain, Construction, ArrowRight, X, AlertOctagon, Layers, Box } from 'lucide-react';
import Map, { Marker, Popup, NavigationControl, Source, Layer, MapRef } from 'react-map-gl/maplibre';
import type { FillLayerSpecification, LineLayerSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'motion/react';

// Mock data for incidents
const INCIDENTS = [
  { id: 'INC-001', lat: 52.359, lng: 4.876, type: 'accident', status: 'critical', title: 'Major Collision', description: 'Multi-vehicle accident blocking two lanes.', time: '12m ago' },
  { id: 'INC-002', lat: 52.362, lng: 4.885, type: 'power', status: 'active', title: 'Power Outage', description: 'District-wide power failure reported.', time: '45m ago' },
  { id: 'INC-003', lat: 52.355, lng: 4.890, type: 'pothole', status: 'investigating', title: 'Road Hazard', description: 'Deep pothole causing tire damage.', time: '2h ago' },
  { id: 'INC-004', lat: 52.365, lng: 4.870, type: 'weather', status: 'warning', title: 'Urban Flooding', description: 'Street flooding due to heavy rain.', time: '5m ago' },
  { id: 'INC-005', lat: 52.350, lng: 4.880, type: 'accident', status: 'cleared', title: 'Minor Crash', description: 'Rear-end collision, cleared to shoulder.', time: '3h ago' },
];

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
  onSelectStation, 
  selectedStation,
  onOpenDetails,
  showDetails,
  isDarkMode
}: { 
  onSelectStation: (id: string | null) => void, 
  selectedStation: string | null,
  onOpenDetails: () => void,
  showDetails: boolean,
  isDarkMode: boolean
}) {
  const mapRef = useRef<MapRef>(null);
  const [is3D, setIs3D] = useState(true);

  // Find selected incident object
  const selectedIncidentData = INCIDENTS.find(s => s.id === selectedStation);

  // Define zones
  const highRiskZone = useMemo(() => createGeoJSONCircle([4.885, 52.362], 0.4), []);
  const weatherZone = useMemo(() => createGeoJSONCircle([4.870, 52.365], 0.6), []);

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

  return (
    <div className="absolute inset-0 bg-gray-100 dark:bg-[#0D0D0D] overflow-hidden transition-colors duration-300">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: 4.876,
          latitude: 52.359,
          zoom: 13,
          pitch: 45, // Initial 3D perspective
          bearing: -10
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={isDarkMode ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        attributionControl={false}
        onClick={() => onSelectStation(null)}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {/* 2D/3D Toggle Control */}
        <div className="absolute bottom-24 right-[10px] z-10">
          <button
            onClick={() => setIs3D(!is3D)}
            className="bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333] p-2 rounded-md shadow-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors"
            title={is3D ? "Switch to 2D View" : "Switch to 3D View"}
          >
            {is3D ? <Layers size={20} /> : <Box size={20} />}
          </button>
        </div>

        {/* Zones Layers */}
        <Source id="high-risk-zone" type="geojson" data={highRiskZone as any}>
          <Layer
            id="high-risk-fill"
            type="fill"
            paint={{
              'fill-color': '#EF4444',
              'fill-opacity': 0.15
            }}
          />
          <Layer
            id="high-risk-line"
            type="line"
            paint={{
              'line-color': '#EF4444',
              'line-width': 2,
              'line-opacity': 0.8
            }}
          />
        </Source>

        <Source id="weather-zone" type="geojson" data={weatherZone as any}>
          <Layer
            id="weather-fill"
            type="fill"
            paint={{
              'fill-color': '#3B82F6',
              'fill-opacity': 0.1
            }}
          />
          <Layer
            id="weather-line"
            type="line"
            paint={{
              'line-color': '#3B82F6',
              'line-width': 1,
              'line-opacity': 0.8,
              'line-dasharray': [2, 2]
            }}
          />
        </Source>

        {/* Incident Markers */}
        {INCIDENTS.map((incident) => (
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
              status={incident.status} 
              isDarkMode={isDarkMode} 
            />
          </Marker>
        ))}

        {/* Popup with AnimatePresence for exit animations */}
        <AnimatePresence mode="wait">
          {selectedStation && selectedIncidentData && !showDetails && (
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
              >
                <IncidentPopup 
                  incident={selectedIncidentData} 
                  onOpenDetails={onOpenDetails} 
                  onClose={() => onSelectStation(null)}
                />
              </motion.div>
            </Popup>
          )}
        </AnimatePresence>
      </Map>
    </div>
  );
}

function IncidentMarker({ isSelected, type, status, isDarkMode }: { isSelected: boolean, type: string, status: string, isDarkMode: boolean }) {
  let color = isDarkMode ? '#3B82F6' : '#3B82F6'; // Default blue
  
  if (status === 'critical') color = '#EF4444'; // Red
  if (status === 'warning') color = '#F59E0B'; // Orange
  if (status === 'investigating') color = '#10B981'; // Green
  if (status === 'cleared') color = '#6B7280'; // Gray

  const fillColor = isSelected ? color : (isDarkMode ? '#1A1A1A' : '#FFFFFF');
  const strokeColor = isSelected ? '#FFFFFF' : color;
  const iconColor = isSelected ? '#FFFFFF' : color;
  const scale = isSelected ? 1.3 : 1;

  // Different icons based on type
  let IconComponent = AlertOctagon;
  if (type === 'accident') IconComponent = AlertTriangle;
  else if (type === 'power') IconComponent = Zap;
  else if (type === 'weather') IconComponent = CloudRain;
  else if (type === 'pothole') IconComponent = Construction;

  return (
    <div 
      className="relative flex items-center justify-center transition-transform duration-300"
      style={{ 
        transform: `scale(${scale})`,
        width: '36px',
        height: '36px'
      }}
    >
      {/* Outer Circle */}
      <div 
        className="absolute inset-0 rounded-full border-2 transition-colors duration-300"
        style={{ 
          backgroundColor: fillColor,
          borderColor: strokeColor,
          boxShadow: isSelected ? `0 0 15px ${color}80` : 'none'
        }}
      />
      
      {/* Icon */}
      <IconComponent 
        size={18} 
        className="relative z-10 transition-colors duration-300"
        style={{ color: iconColor }}
      />

      {/* Pulse effect for critical incidents */}
      {status === 'critical' && !isSelected && (
        <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20" />
      )}
    </div>
  );
}

function IncidentPopup({ incident, onOpenDetails, onClose }: { incident: any, onOpenDetails: () => void, onClose: () => void }) {
  const getIcon = () => {
    switch(incident.type) {
      case 'accident': return <AlertTriangle size={18} className="text-gray-900 dark:text-white" />;
      case 'power': return <Zap size={18} className="text-gray-900 dark:text-white" />;
      case 'weather': return <CloudRain size={18} className="text-gray-900 dark:text-white" />;
      case 'pothole': return <Construction size={18} className="text-gray-900 dark:text-white" />;
      default: return <AlertOctagon size={18} className="text-gray-900 dark:text-white" />;
    }
  };

  const getStatusColor = () => {
    switch(incident.status) {
      case 'critical': return 'bg-red-500 dark:bg-[#EF4444]';
      case 'warning': return 'bg-orange-500 dark:bg-[#F59E0B]';
      case 'active': return 'bg-blue-500 dark:bg-[#3B82F6]';
      case 'investigating': return 'bg-green-500 dark:bg-[#10B981]';
      default: return 'bg-gray-500 dark:bg-[#6B7280]';
    }
  };

  return (
    <div 
      className="bg-white dark:bg-[#1E1E1E] border border-blue-500 dark:border-[#3B82F6] rounded-xl p-4 w-[320px] shadow-2xl cursor-default transition-colors duration-300 relative"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full bg-white dark:bg-[#1A1A1A] border-2 flex items-center justify-center shrink-0 ${incident.status === 'critical' ? 'border-red-500' : 'border-gray-200 dark:border-[#333]'}`}>
            {getIcon()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-gray-900 dark:text-white font-bold text-lg">{incident.id}</span>
              <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
            </div>
            <div className="flex items-center gap-1 text-gray-500 dark:text-[#888888] text-xs mt-0.5">
              <AlertOctagon size={12} />
              <span>{incident.title}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-500 dark:text-[#888888] hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-[#333333] transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      
      <div className="mt-3 mb-4">
        <p className="text-sm text-gray-600 dark:text-[#CCCCCC] line-clamp-2">{incident.description}</p>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-6">
          <div>
            <div className="text-gray-500 dark:text-[#888888] text-xs mb-1">Time</div>
            <div className="text-gray-900 dark:text-white font-bold text-sm">{incident.time}</div>
          </div>
          <div>
            <div className="text-gray-500 dark:text-[#888888] text-xs mb-1">Status</div>
            <div className="text-gray-900 dark:text-white font-bold text-sm capitalize">{incident.status}</div>
          </div>
        </div>
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetails();
          }}
          className="w-10 h-10 rounded-full bg-gray-100 dark:bg-[#2A2A2A] flex items-center justify-center text-gray-900 dark:text-white hover:bg-blue-500 dark:hover:bg-[#3B82F6] hover:text-white hover:border-blue-500 dark:hover:border-[#3B82F6] border border-gray-200 dark:border-[#333333] transition-all duration-200 group"
        >
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
