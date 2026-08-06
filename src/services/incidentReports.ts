/**
 * Serviço de Incident Reports (Relatos Colaborativos)
 * --------------------------------------------------------------------------
 * Camada de acesso à tabela `incident_reports` do Supabase.
 * Gerencia confirmações, negações, resoluções e atualizações de usuários.
 */
import { supabase } from '../lib/supabase';

export type ReportType = 'confirm' | 'deny' | 'resolved' | 'update';

/** Linha crua retornada pela tabela `incident_reports`. */
export interface IncidentReportRow {
  id: string;
  incident_id: string;
  user_id: string | null;
  type: ReportType;
  comment: string | null;
  created_at: string;
}

/** Dados para criar um novo relato. */
export interface CreateIncidentReportInput {
  incident_id: string;
  type: ReportType;
  comment?: string;
}

/** Contadores agregados por tipo. */
export interface ReportCounts {
  confirm: number;
  deny: number;
  resolved: number;
  update: number;
  total: number;
}

/** Item unificado para timeline (incident_timeline + incident_reports). */
export interface TimelineItem {
  id: string;
  type: 'system' | 'user_report';
  event_type: string;
  description: string;
  created_at: string;
  report_type?: ReportType;
  comment?: string;
  user_id?: string | null;
}

/** Mapeia tipo do relato para label amigável. */
export function getReportTypeLabel(type: ReportType): string {
  switch (type) {
    case 'confirm': return 'Confirmou ocorrência';
    case 'deny': return 'Negou ocorrência';
    case 'resolved': return 'Informou resolução';
    case 'update': return 'Atualizou informações';
    default: return type;
  }
}

/** Mapeia tipo do relato para cor/estilo. */
export function getReportTypeStyle(type: ReportType): { bg: string; text: string; icon: string } {
  switch (type) {
    case 'confirm':
      return { bg: 'bg-green-100 dark:bg-[#1D3A2D]', text: 'text-green-700 dark:text-[#10B981]', icon: '✓' };
    case 'deny':
      return { bg: 'bg-red-100 dark:bg-[#3A1D1D]', text: 'text-red-700 dark:text-[#EF4444]', icon: '✕' };
    case 'resolved':
      return { bg: 'bg-blue-100 dark:bg-[#172554]', text: 'text-blue-700 dark:text-[#3B82F6]', icon: '✓' };
    case 'update':
      return { bg: 'bg-amber-100 dark:bg-[#3A351D]', text: 'text-amber-700 dark:text-[#F59E0B]', icon: '✎' };
    default:
      return { bg: 'bg-gray-100 dark:bg-[#2A2A2A]', text: 'text-gray-700 dark:text-[#888888]', icon: '•' };
  }
}

/** Formata timestamp em texto relativo (ex: "12m atrás"). */
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

/** Busca todos os relatos de um incidente. */
export async function fetchIncidentReports(incidentId: string): Promise<IncidentReportRow[]> {
  const { data, error } = await supabase
    .from('incident_reports')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetchIncidentReports falhou:', error.message);
    throw error;
  }
  return data as IncidentReportRow[];
}

/** Cria um novo relato para um incidente. */
export async function createIncidentReport(input: CreateIncidentReportInput): Promise<IncidentReportRow> {
  const payload = {
    incident_id: input.incident_id,
    type: input.type,
    comment: input.comment ?? null,
    user_id: null, // null por enquanto (sem auth), preenchido automaticamente quando auth estiver pronto
  };

  const { data, error } = await supabase
    .from('incident_reports')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    console.error('createIncidentReport falhou:', error.message);
    throw error;
  }
  return data as IncidentReportRow;
}

/** Busca contadores agregados por tipo para um incidente. */
export async function getReportCounts(incidentId: string): Promise<ReportCounts> {
  const { data, error } = await supabase
    .from('incident_reports')
    .select('type')
    .eq('incident_id', incidentId);

  if (error) {
    console.error('getReportCounts falhou:', error.message);
    throw error;
  }

  const counts: ReportCounts = { confirm: 0, deny: 0, resolved: 0, update: 0, total: 0 };
  (data as IncidentReportRow[]).forEach(row => {
    counts[row.type]++;
    counts.total++;
  });
  return counts;
}

/** Busca timeline unificada: incident_timeline + incident_reports. */
export async function fetchUnifiedTimeline(incidentId: string): Promise<TimelineItem[]> {
  // Buscar eventos do sistema (incident_timeline)
  const { data: systemEvents, error: sysError } = await supabase
    .from('incident_timeline')
    .select('id, event_type, description, created_at')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false });

  if (sysError) {
    console.error('fetchUnifiedTimeline (system) falhou:', sysError.message);
  }

  // Buscar relatos de usuários (incident_reports)
  const { data: userReports, error: usrError } = await supabase
    .from('incident_reports')
    .select('id, type, comment, created_at, user_id')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false });

  if (usrError) {
    console.error('fetchUnifiedTimeline (user) falhou:', usrError.message);
  }

  // Combinar e ordenar por created_at desc
  const systemItems: TimelineItem[] = (systemEvents || []).map(e => ({
    id: e.id,
    type: 'system' as const,
    event_type: e.event_type,
    description: e.description,
    created_at: e.created_at,
  }));

  const userItems: TimelineItem[] = (userReports || []).map(r => ({
    id: r.id,
    type: 'user_report' as const,
    event_type: r.type,
    description: getReportTypeLabel(r.type) + (r.comment ? `: ${r.comment}` : ''),
    created_at: r.created_at,
    report_type: r.type,
    comment: r.comment,
    user_id: r.user_id,
  }));

  const allItems = [...systemItems, ...userItems].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return allItems;
}