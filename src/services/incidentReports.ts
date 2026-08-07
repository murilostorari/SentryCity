/**
 * Serviço de Incident Reports (Relatos Colaborativos)
 * --------------------------------------------------------------------------
 * Camada de acesso à tabela `incident_reports` do Supabase.
 * Gerencia confirmações, negações, resoluções e atualizações de usuários.
 */
import { supabase } from '../lib/supabase';
import { calculateSimpleConfidence } from './confidenceCalculation';

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

/** Dados de frequência por hora (últimas 24h). */
export interface HourlyFrequencyData {
  hour: number; // 0-23
  label: string; // "14:00"
  count: number;
  confirm: number;
  deny: number;
  resolved: number;
  update: number;
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

/** Busca frequência de relatos por hora (últimas 24h). */
export async function fetchHourlyFrequency(incidentId: string): Promise<HourlyFrequencyData[]> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('incident_reports')
    .select('created_at, type')
    .eq('incident_id', incidentId)
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchHourlyFrequency falhou:', error.message);
    throw error;
  }

  // Inicializar array de 24 horas com zeros
  const hourlyData: HourlyFrequencyData[] = Array.from({ length: 24 }, (_, i) => {
    const date = new Date(now);
    date.setHours(date.getHours() - 23 + i, 0, 0, 0);
    const hour = date.getHours();
    const label = `${hour.toString().padStart(2, '0')}:00`;
    return { hour, label, count: 0, confirm: 0, deny: 0, resolved: 0, update: 0 };
  });

  // Agrupar relatos por hora
  (data as IncidentReportRow[]).forEach(row => {
    const reportDate = new Date(row.created_at);
    const hoursDiff = Math.floor((now.getTime() - reportDate.getTime()) / (1000 * 60 * 60));
    const index = 23 - hoursDiff; // 0 = 23h atrás, 23 = agora
    
    if (index >= 0 && index < 24) {
      hourlyData[index].count++;
      hourlyData[index][row.type]++;
    }
  });

  return hourlyData;
}

/** Detalhes de confiança para exibição no frontend. */
export interface ConfidenceDetails {
  score: number;           // 0-1
  percentage: number;      // 0-100
  label: string;           // "Alta", "Média", etc.
  color: string;           // CSS color class
  bg: string;              // CSS bg class
  factors: {
    sourceTrust: number;
    userConfirms: number;
    userDenies: number;
    userResolved: number;
    aiConfidence?: number;
    sourceConfirmationsAvg?: number;
    sourceConfirmationsCount?: number;
  };
}

/** Busca detalhes de confiança de um incidente (para exibição). */
export async function fetchIncidentConfidence(incidentId: string): Promise<ConfidenceDetails> {
  // Buscar fatores necessários
  const [{ data: incident }, { data: source }, { data: reports }, { data: ai }, { data: confirmations }] = await Promise.all([
    supabase.from('incidents').select('confidence_score, source_id').eq('id', incidentId).single(),
    supabase.from('sources').select('trust_score').eq('id', (await supabase.from('incidents').select('source_id').eq('id', incidentId).single()).data?.source_id).single(),
    supabase.from('incident_reports').select('type').eq('incident_id', incidentId),
    supabase.from('ai_analysis').select('confidence').eq('incident_id', incidentId).order('created_at', { ascending: false }).limit(1),
    supabase.from('incident_confirmations').select('similarity_score').eq('incident_id', incidentId).eq('confirmed', true),
  ]);

  const sourceTrust = source?.trust_score ?? 0.5;
  const userConfirms = (reports || []).filter(r => r.type === 'confirm').length;
  const userDenies = (reports || []).filter(r => r.type === 'deny').length;
  const userResolved = (reports || []).filter(r => r.type === 'resolved').length;
  const aiConfidence = ai?.[0]?.confidence;
  const sourceConfirmationsAvg = confirmations?.length ? confirmations.reduce((a, b) => a + (b.similarity_score || 0), 0) / confirmations.length : undefined;
  const sourceConfirmationsCount = confirmations?.length ?? 0;

  // Usar score do banco se disponível, senão calcular
  const score = incident?.confidence_score ?? calculateSimpleConfidence(sourceTrust, userConfirms, userDenies, userResolved);
  const percentage = Math.round(score * 100);

  const labels = [
    { min: 0.8, label: 'Muito Alta', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/30' },
    { min: 0.6, label: 'Alta', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
    { min: 0.4, label: 'Média', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/20' },
    { min: 0.2, label: 'Baixa', color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/20' },
    { min: 0, label: 'Muito Baixa', color: 'text-red-700 dark:text-red-300', bg: 'bg-red-100 dark:bg-red-900/30' },
  ];
  const labelInfo = labels.find(l => score >= l.min) || labels[labels.length - 1];

  return {
    score,
    percentage,
    label: labelInfo.label,
    color: labelInfo.color,
    bg: labelInfo.bg,
    factors: {
      sourceTrust,
      userConfirms,
      userDenies,
      userResolved,
      aiConfidence,
      sourceConfirmationsAvg,
      sourceConfirmationsCount,
    },
  };
}

/** Força recálculo de confiança no banco (chama RPC). */
export async function recalculateConfidence(incidentId: string): Promise<number> {
  const { data, error } = await supabase.rpc('recalculate_incident_confidence', { p_incident_id: incidentId });
  if (error) {
    console.error('recalculateConfidence falhou:', error.message);
    throw error;
  }
  return data as number;
}