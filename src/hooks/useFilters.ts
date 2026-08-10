import { useState, useMemo } from 'react';
import { Incident } from '../types/Incident';

/**
 * Verifica se um incidente ainda deve aparecer no mapa.
 * Resolvidos ficam visíveis até `expiresAt` (default 24h após resolução);
 * depois disso vão apenas para o histórico (sidebar/alertas).
 */
function isVisibleOnMap(incident: Incident): boolean {
  if (incident.status !== 'resolved') return true;
  if (!incident.expiresAt) return true;
  return incident.expiresAt > Date.now();
}

export function useFilters(incidents: Incident[]) {
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<number>(24);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      // Ciclo de vida: resolved expirado não aparece no mapa
      if (!isVisibleOnMap(incident)) return false;

      if (severityFilter.length > 0 && !severityFilter.includes(incident.severity)) {
        return false;
      }

      if (typeFilter.length > 0 && !typeFilter.includes(incident.type)) {
        return false;
      }

      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && ['cleared', 'resolved'].includes(incident.status)) return false;
        if (statusFilter === 'resolved' && !['cleared', 'resolved'].includes(incident.status)) return false;
      }

      const hoursAgo = (Date.now() - incident.timestamp) / (1000 * 60 * 60);
      if (hoursAgo > timeFilter) return false;

      return true;
    });
  }, [incidents, severityFilter, statusFilter, timeFilter, typeFilter]);

  return {
    filteredIncidents,
    severityFilter,
    setSeverityFilter,
    statusFilter,
    setStatusFilter,
    timeFilter,
    setTimeFilter,
    typeFilter,
    setTypeFilter
  };
}
