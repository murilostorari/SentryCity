/**
 * Serviço de Incidentes
 * --------------------------------------------------------------------------
 * Camada de acesso à tabela `incidents` do Supabase. Converte entre o formato
 * do banco (latitude/longitude, created_at, city, state...) e o tipo `Incident`
 * usado pelo frontend (lat/lng, time, radius, timestamp), preservando o
 * funcionamento do mapa e dos filtros existentes.
 */
import { supabase } from '../lib/supabase';
import { Incident } from '../types/Incident';

/** Linha crua retornada pela tabela `incidents`. */
export interface IncidentRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  severity: string;
  status: string;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  state: string | null;
  confidence_score: number | null;
  reported_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Dados aceitos ao criar um incidente a partir do frontend. */
export interface CreateIncidentInput {
  title: string;
  description?: string;
  type: string;
  severity: string;
  status?: string;
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
  state?: string;
  confidence_score?: number;
}

/** Raio (em metros) sugerido para exibição no mapa conforme a severidade. */
function severityToRadius(severity: string): number {
  switch (severity) {
    case 'critical':
      return 800;
    case 'high':
      return 500;
    case 'medium':
      return 250;
    default:
      return 100;
  }
}

/** Formata um timestamp em texto relativo em português (ex: "12m atrás"). */
export function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'Agora';
  if (min < 60) return `${min}m atrás`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

/** Converte uma linha do banco para o tipo `Incident` do frontend. */
export function mapRowToIncident(row: IncidentRow): Incident {
  const timestamp = new Date(row.created_at).getTime();
  const fullAddress = [row.address, row.city, row.state]
    .filter(Boolean)
    .join(', ');

  return {
    id: row.id,
    lat: row.latitude,
    lng: row.longitude,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description ?? '',
    address: fullAddress,
    time: formatRelativeTime(timestamp),
    radius: severityToRadius(row.severity),
    timestamp,
  };
}

/** Busca todos os incidentes ordenados do mais recente para o mais antigo. */
export async function fetchIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[v0] fetchIncidents falhou:', error.message);
    throw error;
  }
  return (data as IncidentRow[]).map(mapRowToIncident);
}

/**
 * Cria um incidente no banco e retorna o registro já mapeado para o frontend.
 * O status default é 'active' (evento criado manualmente e vigente).
 */
export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  const payload = {
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    severity: input.severity,
    status: input.status ?? 'active',
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    confidence_score: input.confidence_score ?? 0,
    reported_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('incidents')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('[v0] createIncident falhou:', error.message);
    throw error;
  }
  return mapRowToIncident(data as IncidentRow);
}
