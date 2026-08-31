import { useState, useEffect, useCallback } from 'react';
import { Incident } from '../types/Incident';
import { fetchIncidents, mergeOrCreateIncident, CreateIncidentInput, MergeResult } from '../services/incidents';

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
   * Cria um incidente ou faz merge com um existente do mesmo tipo e proximidade.
   * Retorna o resultado completo para que o caller saiba se houve merge.
   */
  const addIncident = async (eventData: any): Promise<MergeResult> => {
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
      zip_code: eventData.zip_code,
      source: eventData.source,
      confidence_score: eventData.confidence_score,
    };

    const result = await mergeOrCreateIncident(input);

    if (result.merged) {
      // Recarrega a lista para refletir o novo relato no incidente existente.
      await refresh();
    } else {
      // Insere o novo incidente no topo da lista.
      setIncidents((prev) => [result.incident, ...prev]);
    }

    return result;
  };

  return {
    incidents,
    isLoading,
    error,
    addIncident,
    refresh,
  };
}
