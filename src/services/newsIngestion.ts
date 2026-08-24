/**
 * Serviço de Ingestão de Notícias (Pipeline OSINT)
 * --------------------------------------------------------------------------
 * Orquestra o fluxo completo de ingestão de uma notícia:
 *  1. Salva o texto original em `raw_reports`;
 *  2. Analisa com a LLM via OpenRouter (`newsAnalysis.ts`);
 *  3. Geocodifica a localização extraída (`geocoding.ts`) usando apenas
 *     street + neighborhood + city + state;
 *  4. Cria o incidente em `incidents`;
 *  5. Salva a resposta da IA em `ai_analysis` e marca o raw_report como processado.
 *
 * Arquitetura preparada para ingestão por URL: `ingestNewsUrl` recebe uma URL,
 * extrai o texto via `fetchArticleText` (scraping ainda não implementado) e
 * reutiliza o mesmo pipeline de análise.
 */
import { supabase } from '../lib/supabase';
import {
  analyzeNewsText,
  buildGeocodeQueryByPrecision,
  formatLocation,
  getActiveModel,
  NewsAnalysisResult,
} from './newsAnalysis';
import { geocodeAddress } from './geocoding';
import { extractArticleFromUrl } from './articleExtractor';
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
  /** Fonte/dominio extraído da URL (quando disponível). */
  sourceName?: string;
}

/** Dados finais para confirmar a criação do incidente. */
export interface ConfirmIngestionInput {
  rawReportId: string;
  analysis: NewsAnalysisResult;
  model: string;
  source?: string;
  lat: number;
  lng: number;
  address: string;
}

interface IngestInput {
  text: string;
  originalUrl?: string;
  sourceName?: string;
  articleTitle?: string;
  articleDescription?: string;
  imageUrl?: string | null;
  publishedAt?: string | null;
}/**
 * Etapa 1: salva o texto original e analisa com IA + geocoding.
 * Não cria o incidente — retorna o preview para confirmação.
 */
export async function ingestNewsText(newsText: string): Promise<NewsIngestionResult> {
  return runIngestion({ text: newsText });
}

/**
 * Etapa 1 (URL): extrai o artigo via Jina e segue o pipeline normal.
 * A URL, o texto extraído, a fonte e o título são salvos em raw_reports.
 */
export async function ingestNewsUrl(url: string): Promise<NewsIngestionResult> {
  if (!url || !/^https?:\/\/\S+$/i.test(url.trim())) {
    throw new Error('URL inválida.');
  }
  const article = await extractArticleFromUrl(url);
  return runIngestion({
    text: article.content,
    originalUrl: url,
    sourceName: article.sourceName,
    articleTitle: article.title,
    articleDescription: article.description,
    imageUrl: article.imageUrl,
    publishedAt: article.publishedAt,
  });
}

/**
 * Extrai o texto de uma notícia a partir de uma URL via Jina Reader API.
 */
export async function fetchArticleText(url: string): Promise<string> {
  const article = await extractArticleFromUrl(url);
  return article.content;
}

async function runIngestion({
  text,
  originalUrl,
  sourceName,
  articleTitle,
  articleDescription,
  imageUrl,
  publishedAt,
}: IngestInput): Promise<NewsIngestionResult> {
  const t0 = performance.now();

  if (!text || text.trim().length < 10) {
    throw new Error('Texto da notícia muito curto para análise.');
  }

  // 1. Salvar o texto original em raw_reports (com campos extras quando disponíveis)
  const { data: rawReport, error: rawError } = await supabase
    .from('raw_reports')
    .insert({
      original_text: text,
      original_url: originalUrl ?? null,
      source_name: sourceName ?? null,
      title: articleTitle ?? null,
      description: articleDescription ?? null,
      image_url: imageUrl ?? null,
      published_at: publishedAt ?? null,
      processed: false,
    })
    .select('id')
    .single();

  if (rawError) {
    console.error('ingestNewsText (raw_reports) falhou:', rawError.message);
    throw new Error('Falha ao salvar a notícia original.');
  }

  const rawReportId = rawReport.id as string;

  // 2. Analisar com IA via OpenRouter
  const tAi = performance.now();
  let analysis: NewsAnalysisResult | null = null;
  let aiAnalyzed = false;
  try {
    analysis = await analyzeNewsText(text);
    aiAnalyzed = true;
  } catch (error: any) {
    // Sem chave de API (ou falha da LLM): deixa o usuário preencher manualmente.
    console.warn('Análise por IA indisponível:', error?.message ?? error);
    analysis = null;
  }
  const aiMs = performance.now() - tAi;

  // 3. Geocodificar usando precisão da localização
  const tGeo = performance.now();
  let lat: number | null = null;
  let lng: number | null = null;
  let displayName: string | null = null;

  const geocodeQuery = analysis
    ? buildGeocodeQueryByPrecision(analysis.location, analysis.location_precision)
    : '';

  if (geocodeQuery) {
    const geo = await geocodeAddress(geocodeQuery);
    if (geo) {
      lat = geo.lat;
      lng = geo.lng;
      displayName = geo.displayName;
      // Preenche o CEP a partir do geocoding quando a IA não retornou.
      if (analysis && !analysis.location.zip_code && geo.zipCode) {
        analysis.location.zip_code = geo.zipCode;
      }
    }
  }
  const geocodeMs = performance.now() - tGeo;
  const totalMs = performance.now() - t0;

  console.log(
    `[Ingestão] AI: ${aiMs.toFixed(0)}ms | Geocoding: ${geocodeMs.toFixed(0)}ms | Total: ${totalMs.toFixed(0)}ms`
  );

  return {
    rawReportId,
    analysis: analysis ?? {
      title: '',
      description: '',
      type: 'other',
      severity: 'medium',
      confidence_score: 0,
      location_precision: 'unknown',
      location: {
        street: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
        zip_code: '',
        cross_street: '',
        reference: '',
      },
    },
    model: getActiveModel(),
    lat,
    lng,
    geocodeAddress: displayName,
    aiAnalyzed,
    sourceName: sourceName ?? undefined,
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
    prompt_version: 'v2',
    extracted_type: input.analysis.type,
    extracted_location: formatLocation(input.analysis.location),
    extracted_severity: input.analysis.severity,
    location_precision: input.analysis.location_precision,
    confidence: input.analysis.confidence_score,
    raw_response: input.analysis as unknown as object,
  });

  if (aiError) {
    console.error('confirmIngestion (ai_analysis) falhou:', aiError.message);
    // Não falha a criação do incidente; apenas registra o erro.
  }

  // 5b. Vincular raw_report ao incidente + marcar como processado
  const { error: processedError } = await supabase
    .from('raw_reports')
    .update({ processed: true, incident_id: incidentRow.id })
    .eq('id', input.rawReportId);

  if (processedError) {
    console.error('confirmIngestion (raw_reports processed) falhou:', processedError.message);
  }

  return incidentRow;
}

/** Cria o incidente a partir dos dados confirmados (insert + mapeamento). */
async function createIncidentFromIngestion(input: ConfirmIngestionInput): Promise<Incident> {
  const loc = input.analysis.location;
  let createdBy: string | null = null;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) createdBy = user.id;

  const { data, error } = await supabase
    .from('incidents')
    .insert({
      title: input.analysis.title,
      description: input.analysis.description || input.analysis.title,
      type: input.analysis.type,
      severity: input.analysis.severity,
      status: 'active',
      latitude: input.lat,
      longitude: input.lng,
      address: formatLocation(loc),
      city: loc.city || null,
      state: loc.state || null,
      zip_code: loc.zip_code || null,
      source: input.source ?? null,
      confidence_score: input.analysis.confidence_score,
      created_by: createdBy,
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
    source: row.source,
    time: new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    radius: 100,
    timestamp,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    created_by: row.created_by,
  };
}
