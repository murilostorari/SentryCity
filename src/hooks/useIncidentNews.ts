import { useState, useEffect } from 'react';
import { fetchIncidentNews } from '../services/incidentNews';
import { IncidentNewsItem } from '../types/Incident';

/** Carrega as fontes de notícias de um incidente sempre que ele é selecionado. */
export function useIncidentNews(incidentId: string | null) {
  const [news, setNews] = useState<IncidentNewsItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setNews([]);
    if (!incidentId) return;

    let cancelled = false;
    setIsLoading(true);

    fetchIncidentNews(incidentId)
      .then((items) => {
        if (!cancelled) setNews(items);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  return { news, isLoading };
}
