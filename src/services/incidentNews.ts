/**
 * Serviço de Fontes de Notícias por Incidente
 * --------------------------------------------------------------------------
 * Busca na view pública `incident_news` os metadados das notícias vinculadas
 * a um incidente (via raw_reports.incident_id), para popular os cards de
 * fontes no mapa e no modal "Todas as Fontes".
 */
import { supabase } from '../lib/supabase';
import { IncidentNewsItem } from '../types/Incident';
import { formatRelativeTime } from './incidents';

interface IncidentNewsRow {
  id: string;
  incident_id: string;
  source_name: string | null;
  title: string | null;
  description: string | null;
  original_url: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

/** Busca as fontes de notícias vinculadas a um incidente. */
export async function fetchIncidentNews(incidentId: string): Promise<IncidentNewsItem[]> {
  const { data, error } = await supabase
    .from('incident_news')
    .select('*')
    .eq('incident_id', incidentId)
    .limit(20);

  if (error) {
    console.error('fetchIncidentNews falhou:', error.message);
    return [];
  }

  return (data as IncidentNewsRow[] ?? []).map((row) => ({
    source: row.source_name ?? 'Fonte',
    title: row.title ?? 'Notícia',
    description: row.description ?? '',
    imageUrl: row.image_url ?? '',
    url: row.original_url ?? '',
    time: formatRelativeTime(new Date(row.published_at ?? row.created_at).getTime()),
  }));
}
