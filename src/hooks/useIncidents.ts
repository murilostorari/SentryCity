import { useState, useEffect, useCallback } from 'react';
import { Incident } from '../types/Incident';
import { fetchIncidents, createIncident, CreateIncidentInput } from '../services/incidents';

/**
 * Hook central de incidentes.
 *
 * Agora consome dados reais da tabela `incidents` do Supabase:
 *  - carrega a lista no mount;
 *  - `addIncident` persiste no banco e atualiza o mapa com o registro real;
 *  - `refresh` recarrega os dados sob demanda.
 *
 * A interface pública foi mantida compatível com o restante do app.
 */
export function useIncidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchIncidents();
      setIncidents(data);
    } catch (err: any) {
      setError(err?.message ?? 'Falha ao carregar incidentes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Cria um incidente real no Supabase. Recebe os dados vindos do modal
   * (que usa lat/lng) e os converte para o formato do serviço.
   */
  const addIncident = async (eventData: any): Promise<Incident> => {
    const input: CreateIncidentInput = {
      title: eventData.title,
      description: eventData.description,
      type: eventData.type,
      severity: eventData.severity,
      status: eventData.status ?? 'active',
      latitude: eventData.lat ?? eventData.latitude,
      longitude: eventData.lng ?? eventData.longitude,
      address: eventData.address,
      city: eventData.city,
      state: eventData.state,
      confidence_score: eventData.confidence_score,
    };

    const created = await createIncident(input);
    // Insere no topo da lista para refletir imediatamente no mapa/alertas.
    setIncidents((prev) => [created, ...prev]);
    return created;
  };

  return {
    incidents,
    isLoading,
    error,
    addIncident,
    refresh,
  };
}
