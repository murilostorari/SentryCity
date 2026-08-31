/**
 * Serviço de Incidentes
 * --------------------------------------------------------------------------
 * Camada de acesso à tabela `incidents` do Supabase. Converte entre o formato
 * do banco (latitude/longitude, created_at, city, state...) e o tipo `Incident`
 * usado pelo frontend (lat/lng, time, radius, timestamp), preservando o
 * funcionamento do mapa e dos filtros existentes.
 *
 * Inclui deduplicação: quando um novo incidente é criado perto de um existente
 * (≤200m) e do mesmo tipo, o sistema cria um relato "confirm" no existente
 * ao invés de duplicar.
 */
import { supabase } from '../lib/supabase';
import { Incident } from '../types/Incident';
import { createIncidentReport } from './incidentReports';

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
  zip_code: string | null;
  source: string | null;
  confidence_score: number | null;
  reported_at: string | null;
  resolved_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
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
  zip_code?: string;
  source?: string;
  confidence_score?: number;
  created_by?: string;
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
    source: row.source,
    time: formatRelativeTime(timestamp),
    radius: severityToRadius(row.severity),
    timestamp,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    created_by: row.created_by,
  };
}

/** Busca todos os incidentes ordenados do mais recente para o mais antigo. */
export async function fetchIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchIncidents falhou:', error.message);
    throw error;
  }
  return (data as IncidentRow[]).map(mapRowToIncident);
}

/**
 * Cria um incidente no banco e retorna o registro já mapeado para o frontend.
 * O status default é 'active' (evento criado manualmente e vigente).
 */
export async function createIncident(input: CreateIncidentInput): Promise<Incident> {
  let createdBy = input.created_by;
  if (!createdBy) {
    const { data: { user } } = await supabase.auth.getUser();
    createdBy = user?.id ?? null;
  }

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
    zip_code: input.zip_code ?? null,
    source: input.source ?? null,
    confidence_score: input.confidence_score ?? 0,
    created_by: createdBy,
    reported_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('incidents')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('createIncident falhou:', error.message);
    throw error;
  }
  return mapRowToIncident(data as IncidentRow);
}

// ---------------------------------------------------------------------------
// Deduplicação por proximidade
// ---------------------------------------------------------------------------

/** Raio padrão em metros para considerar dois incidentes como "mesmo local". */
const DEFAULT_MERGE_RADIUS_METERS = 200;

/**
 * Busca um incidente ativo do mesmo tipo dentro de um raio em metros.
 * Busca todos os ativos do tipo e calcula distância haversine no cliente.
 */
export async function findNearbyIncident(
  lat: number,
  lng: number,
  type: string,
  radiusMeters: number = DEFAULT_MERGE_RADIUS_METERS,
): Promise<IncidentRow | null> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('type', type)
    .eq('status', 'active');

  if (error) {
    console.error('findNearbyIncident query falhou:', error.message);
    return null;
  }

  const candidates = (data as IncidentRow[]) ?? [];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  let closest: IncidentRow | null = null;
  let closestDist = Infinity;

  for (const candidate of candidates) {
    const dist = haversine(lat, lng, candidate.latitude, candidate.longitude);
    if (dist <= radiusMeters && dist < closestDist) {
      closest = candidate;
      closestDist = dist;
    }
  }

  return closest;
}

/** Resultado de mergeOrCreateIncident. */
export interface MergeResult {
  /** Se true, o relato foi adicionado a um incidente existente (merge). */
  merged: boolean;
  /** Incidente criado ou ao qual o relato foi adicionado. */
  incident: Incident;
  /** Se merged=true, referência ao incidente existente que recebeu o relato. */
  existingIncident?: Incident;
}

/**
 * Tenta fazer merge com um incidente existente do mesmo tipo e proximidade.
 * Se encontrar, cria um relato "confirm" no existente ao invés de criar novo.
 * Se não encontrar, cria o incidente normalmente.
 */
export async function mergeOrCreateIncident(
  input: CreateIncidentInput,
  radiusMeters: number = DEFAULT_MERGE_RADIUS_METERS,
): Promise<MergeResult> {
  const nearby = await findNearbyIncident(
    input.latitude,
    input.longitude,
    input.type,
    radiusMeters,
  );

  if (nearby) {
    // Merge: cria relato de confirmação no incidente existente.
    await createIncidentReport({
      incident_id: nearby.id,
      type: 'confirm',
      comment: input.description ?? `Relato via ${input.source ?? 'Manual'}`,
    });

    const existing = mapRowToIncident(nearby);
    return {
      merged: true,
      incident: existing,
      existingIncident: existing,
    };
  }

  // Nenhum incidente próximo encontrado → cria novo.
  const created = await createIncident(input);
  return {
    merged: false,
    incident: created,
  };
}
