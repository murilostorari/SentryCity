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

// ---------------------------------------------------------------------------
// Lifecycle: auto-resolução & interação do usuário
// ---------------------------------------------------------------------------

/** Horas de inatividade antes de auto-resolver, por tipo de incidente. */
export const AUTO_RESOLVE_HOURS: Record<string, number> = {
  accident: 72,
  traffic_accident: 72,
  motorcycle_accident: 72,
  power: 72,
  power_outage: 72,
  weather: 48,
  flood: 48,
  fire: 48,
  pothole: 168,
  infrastructure_damage: 168,
  road_closure: 48,
  violence: 72,
  show: 168,
  party: 48,
  noise: 48,
  inauguration: 24,
  other: 24,
};

/** Horas que um incidente 'resolved' fica visível no mapa depois de resolvido. */
export const RESOLVED_VISIBILITY_HOURS: Record<string, number> = {
  accident: 48,
  traffic_accident: 48,
  motorcycle_accident: 48,
  power: 48,
  power_outage: 48,
  weather: 24,
  flood: 24,
  fire: 48,
  pothole: 168,
  infrastructure_damage: 168,
  road_closure: 24,
  violence: 48,
  show: 72,
  party: 24,
  noise: 24,
  inauguration: 12,
  other: 24,
};

/** Retorna as horas de auto-resolução para um tipo (default 24h). */
export function getAutoResolveHours(type: string): number {
  return AUTO_RESOLVE_HOURS[type] ?? 24;
}

/** Retorna as horas de visibilidade pós-resolução para um tipo (default 24h). */
export function getResolvedVisibilityHours(type: string): number {
  return RESOLVED_VISIBILITY_HOURS[type] ?? 24;
}

/**
 * Calcula o timestamp (ms) em que o incidente será auto-resolvido.
 * O timer é baseado na ÚLTIMA atividade (criação ou relato mais recente) +
 * auto_resolve_hours do tipo — espelha o comportamento de
 * auto_resolve_inactive_incidents() no banco (atividade recente mantém ativo).
 */
export function getAutoResolveDeadline(incident: Incident, lastActivityMs?: number): number | null {
  const hours = getAutoResolveHours(incident.type);
  const last = Math.max(incident.timestamp, lastActivityMs ?? 0);
  return last + hours * 3600 * 1000;
}

/** Horas restantes antes da auto-resolução (número positivo ou 0). */
export function getHoursUntilAutoResolve(incident: Incident, lastActivityMs?: number): number {
  if (incident.status === 'resolved') return 0;
  const deadline = getAutoResolveDeadline(incident, lastActivityMs);
  if (!deadline) return 0;
  return Math.max(0, (deadline - Date.now()) / (1000 * 60 * 60));
}

/**
 * Usuário confirma que o incidente ainda está ativo.
 * Insere um relato 'confirm' para renovar o timer de auto-resolução.
 * Requer usuário autenticado.
 */
export async function bumpIncidentActivity(incidentId: string): Promise<void> {
  const { error } = await supabase.rpc('bump_incident_activity', {
    p_incident_id: incidentId,
  });

  if (error) {
    console.error('bumpIncidentActivity falhou:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Marca o incidente como 'resolved' (staff only — admin/analyst).
 * Ativa os triggers existentes de resolved_at/expires_at (migration 0008).
 */
export async function resolveIncident(incidentId: string): Promise<void> {
  const { error } = await supabase.rpc('resolve_incident', {
    p_incident_id: incidentId,
  });

  if (error) {
    console.error('resolveIncident falhou:', error.message);
    throw new Error(error.message);
  }
}

/**
 * Chama a função que resolve incidentes inativos automaticamente.
 * Ideal para ser chamada por uma Edge Function ou pg_cron periodicamente.
 */
export async function runAutoResolveJob(): Promise<number> {
  const { data, error } = await supabase.rpc('auto_resolve_inactive_incidents');

  if (error) {
    console.error('auto_resolve_inactive_incidents falhou:', error.message);
    throw new Error(error.message);
  }
  return data as number;
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

export interface FindNearbyOptions {
  /** Idade máxima do incidente em horas para ser elegível a merge (default 24h). */
  maxAgeHours?: number;
  /** Título do evento a ser criado para verificação de sobreposição temática. */
  title?: string;
  /** Precisão da localização: 'city' e 'unknown' não fazem merge por distância. */
  precision?: string;
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas',
  'a', 'o', 'as', 'os', 'e', 'ou', 'para', 'pra', 'com', 'sem',
  'um', 'uma', 'uns', 'umas', 'por', 'pelo', 'pela', 'pelos', 'pelas',
  'se', 'que', 'ao', 'aos', 'à', 'às', 'este', 'esta', 'neste', 'nesta'
]);

function extractKeywords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function hasTitleOverlap(titleA: string, titleB: string): boolean {
  const wordsA = new Set(extractKeywords(titleA));
  const wordsB = extractKeywords(titleB);
  for (const w of wordsB) {
    if (wordsA.has(w)) return true;
  }
  return false;
}

/**
 * Busca um incidente ativo do mesmo tipo dentro de um raio em metros.
 * Busca todos os ativos do tipo criados nas últimas maxAgeHours (default 24h)
 * e calcula distância haversine no cliente.
 */
export async function findNearbyIncident(
  lat: number,
  lng: number,
  type: string,
  radiusMeters: number = DEFAULT_MERGE_RADIUS_METERS,
  options?: FindNearbyOptions,
): Promise<IncidentRow | null> {
  // Se a precisão for a nível de município ou desconhecida, NÃO faz merge por distância
  // (coordenadas do centro da cidade gerariam falso positivo para todo o município).
  if (options?.precision === 'city' || options?.precision === 'unknown') {
    return null;
  }

  const maxAgeHours = options?.maxAgeHours ?? 24;
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('type', type)
    .eq('status', 'active')
    .gte('created_at', cutoff);

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
      if (options?.title && !hasTitleOverlap(options.title, candidate.title)) {
        continue;
      }
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
    { title: input.title },
  );

  if (nearby) {
    // Merge: cria relato de confirmação no incidente existente.
    // Tolerante a falhas (ex.: usuário é o criador do incidente e o banco
    // bloqueia confirmar o próprio incidente) — o merge segue mesmo assim.
    try {
      await createIncidentReport(
        {
          incident_id: nearby.id,
          type: 'confirm',
          comment: input.description ?? `Relato via ${input.source ?? 'Manual'}`,
        },
        { allowUpsert: true },
      );
    } catch (err) {
      console.warn('merge: relato de confirmação ignorado:', (err as Error)?.message);
    }

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
