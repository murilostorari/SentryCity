/**
 * Serviço de Ingestão de Notícias (Pipeline OSINT)
 * --------------------------------------------------------------------------
 * Orquestra o fluxo completo de ingestão de uma notícia:
 *  1. Salva o texto original em `raw_reports`;
 *  2. Analisa com a LLM via OpenRouter (`newsAnalysis.ts`);
 *  3. Geocodifica o endereço extraído (`geocoding.ts`);
 *  4. Cria o incidente em `incidents`;
 *  5. Salva a resposta da IA em `ai_analysis` e marca o raw_report como processado.
 */
import { supabase } from '../lib/supabase';
import { analyzeNewsText, getActiveModel, NewsAnalysisResult } from './newsAnalysis';
import { geocodeAddress } from './geocoding';
import { IncidentRow } from './incidents';
import { Incident } from '../types/Incident';

/** Resultado da análise de uma notícia (antes da confirmação do incidente). */
export interface NewsIngestionResult {
  rawReportId: string;
  analysis: NewsAnalysisResult;
  model: string;
  lat: number | null;
  lng: number | null;
  geocodeAddress: string | null;
  /** true quando a IA foi consultada (env configurado); false em modo manual. */
  aiAnalyzed: boolean;
}

/** Dados finais para confirmar a criação do incidente. */
export interface ConfirmIngestionInput {
  rawReportId: string;
  analysis: NewsAnalysisResult;
  model: string;
  lat: number;
  lng: number;
  address: string;
}

/**
 * Etapa 1: salva o texto original e analisa com IA + geocoding.
 * Não cria o incidente — retorna o preview para confirmação.
 */
export async function ingestNewsText(newsText: string): Promise<NewsIngestionResult> {
  if (!newsText || newsText.trim().length < 10) {
    throw new Error('Texto da notícia muito curto para análise.');
  }

  // 1. Salvar o texto original em raw_reports
  const { data: rawReport, error: rawError } = await supabase
    .from('raw_reports')
    .insert({ original_text: newsText, processed: false })
    .select('id')
    .single();

  if (rawError) {
    console.error('ingestNewsText (raw_reports) falhou:', rawError.message);
    throw new Error('Falha ao salvar a notícia original.');
  }

  const rawReportId = rawReport.id as string;

  // 2. Analisar com IA via OpenRouter
  let analysis: NewsAnalysisResult | null = null;
  let aiAnalyzed = false;
  try {
    analysis = await analyzeNewsText(newsText);
    aiAnalyzed = true;
  } catch (error: any) {
    // Sem chave de API (ou falha da LLM): deixa o usuário preencher manualmente.
    console.warn('Análise por IA indisponível:', error?.message ?? error);
    analysis = null;
  }

  // 3. Geocodificar endereço (usa o extraído pela IA, ou o texto inteiro como fallback)
  let lat: number | null = null;
  let lng: number | null = null;
  let displayName: string | null = null;

  const addressQuery = analysis?.address
    ? [analysis.address, analysis.city, analysis.state].filter(Boolean).join(', ')
    : newsText.trim();

  if (addressQuery) {
    const geo = await geocodeAddress(addressQuery);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      displayName = geo.displayName;
    }
  }

  return {
    rawReportId,
    analysis: analysis ?? {
      title: '',
      type: 'other',
      severity: 'medium',
      address: '',
      city: '',
      state: '',
      confidence_score: 0,
    },
    model: getActiveModel(),
    lat,
    lng,
    geocodeAddress: displayName,
    aiAnalyzed,
  };
}

/** Etapa 2: confirma a criação do incidente + salva ai_analysis + marca raw_report. */
export async function confirmIngestion(input: ConfirmIngestionInput): Promise<Incident> {
  // 4. Criar o incidente
  const incidentRow = await createIncidentFromIngestion(input);

  // 5a. Salvar a resposta da IA em ai_analysis
  const { error: aiError } = await supabase.from('ai_analysis').insert({
    incident_id: incidentRow.id,
    model_name: input.model,
    prompt_version: 'v1',
    extracted_type: input.analysis.type,
    extracted_location: input.analysis.address,
    extracted_severity: input.analysis.severity,
    confidence: input.analysis.confidence_score,
    raw_response: input.analysis as unknown as object,
  });

  if (aiError) {
    console.error('confirmIngestion (ai_analysis) falhou:', aiError.message);
    // Não falha a criação do incidente; apenas registra o erro.
  }

  // 5b. Marcar raw_report como processado
  const { error: processedError } = await supabase
    .from('raw_reports')
    .update({ processed: true })
    .eq('id', input.rawReportId);

  if (processedError) {
    console.error('confirmIngestion (raw_reports processed) falhou:', processedError.message);
  }

  return incidentRow;
}

/** Cria o incidente a partir dos dados confirmados (insert + mapeamento). */
async function createIncidentFromIngestion(input: ConfirmIngestionInput): Promise<Incident> {
  const { data, error } = await supabase
    .from('incidents')
    .insert({
      title: input.analysis.title,
      description: input.analysis.title,
      type: input.analysis.type,
      severity: input.analysis.severity,
      status: 'active',
      latitude: input.lat,
      longitude: input.lng,
      address: input.address,
      city: input.analysis.city,
      state: input.analysis.state,
      confidence_score: input.analysis.confidence_score,
      reported_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) {
    console.error('createIncidentFromIngestion falhou:', error.message);
    throw new Error('Falha ao criar o incidente.');
  }
  return mapIngestionRow(data as IncidentRow);
}

/** Mapeamento mínimo da linha criada para o tipo Incident do frontend. */
function mapIngestionRow(row: IncidentRow): Incident {
  const timestamp = new Date(row.created_at).getTime();
  return {
    id: row.id,
    lat: row.latitude,
    lng: row.longitude,
    type: row.type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description ?? '',
    address: [row.address, row.city, row.state].filter(Boolean).join(', '),
    time: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    radius: 100,
    timestamp,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
  };
}
