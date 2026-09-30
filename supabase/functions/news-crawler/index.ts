// Edge Function: news-crawler
// --------------------------------------------------------------------------
// Crawler OSINT autônomo que:
//   1. Lê feeds RSS configurados
//   2. Filtra com IA (relevância) — stage 1 (barato)
//   3. Extrai artigo via Jina Reader — apenas se relevante
//   4. Analisa com LLM (qwen/llama) — stage 2
//   5. Geocodifica (Nominatim / Photon)
//   6. Cria ou faz merge de incidente
//   7. Salva log da execução
//
// Schedule: pg_cron ou cron-job.org (POST para esta URL)
// Secrets: GROQ_API_KEY (obrigatório), JINA_READER_API_KEY (opcional)
// --------------------------------------------------------------------------

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/functions-js";

// ---------- CORS ----------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// ---------- Tipos ----------
interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  content: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface RelevanceFilterResult {
  relevant: boolean;
  reason: string;
  incident_type: string | null;
}

interface NewsLocation {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  cross_street: string;
  reference: string;
}

interface NewsAnalysisResult {
  title: string;
  description: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  location: NewsLocation;
  location_precision: 'exact' | 'street' | 'neighborhood' | 'city' | 'unknown';
}

interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  city: string;
  state: string;
  zipCode?: string;
}

// ---------- Constantes ----------
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const JINA_BASE = "https://r.jina.ai";
const JINA_SEARCH = "https://s.jina.ai";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const PHOTON_BASE = "https://photon.komoot.io/api";
const MAX_ARTICLES_PER_FEED = 25;
const MAX_RELEVANT_PER_RUN = 10;
const REQUEST_DELAY_MS = 1200; // respeita Nominatim 1 req/s

// ---------- Prompt da IA (mesmo do newsAnalysis.ts) ----------
const SYSTEM_PROMPT = `Você é um analista de OSINT especializado em incidentes urbanos.
Receberá o texto de uma notícia e deve extrair as informações do incidente descrito.
Responda SOMENTE com um objeto JSON válido, sem texto adicional, no formato:
{
  "title": "título curto e objetivo do incidente",
  "description": "resumo curto do incidente (1-2 frases)",
  "type": "um de: accident, power, weather, pothole, show, party, noise, inauguration, other",
  "severity": "um de: low, medium, high, critical",
  "confidence_score": número entre 0 e 1 indicando sua confiança na extração,
  "location": {
    "street": "nome do logradouro (ex: Rua Tiradentes, Avenida Paulista), ou vazio se não houver",
    "number": "número do imóvel, ou vazio se não houver",
    "complement": "complemento (apto, bloco, lote, casa 2), ou vazio se não houver",
    "neighborhood": "bairro, ou vazio se não houver",
    "city": "cidade",
    "state": "sigla do estado (ex: SP), ou vazio",
    "zip_code": "CEP, ou vazio se não houver",
    "cross_street": "rua transversal/cruzamento, ou vazio",
    "reference": "ponto de referência próximo (ex: próximo ao mercado, atrás da escola), ou vazio"
  },
  "location_precision": "um de: exact, street, neighborhood, city, unknown"
}

REGRAS DE LOCALIZAÇÃO:
- Quando o texto citar um cruzamento no formato "Rua X cruzamento com Rua Y" ou "Rua X com Rua Y":
  a primeira rua citada (X) é o endereço principal e vai em "street";
  a segunda rua citada (Y) vai em "cross_street".
- Nunca combine as duas ruas no campo "street".
- Se a notícia indicar o local apenas por bairro ou ponto de referência, preencha apenas os campos disponíveis.

REGRAS DE PRECISÃO (location_precision):
- "exact": endereço completo com rua + número (ex: "Rua Augusta, 1200, São Paulo")
- "street": rua mencionada mas sem número (ex: "Rua Tiradentes, bairro Centro")
- "neighborhood": apenas bairro mencionado (ex: "no bairro da Liberdade")
- "city": apenas cidade mencionada (ex: "em São Paulo", "na capital")
- "unknown": nenhum dado de localização confiável (ex: "no interior", "em um hospital não identificado")
- Se houver ponto de referência específico (hospital, teatro, praça), tente extrair o nome e classifique como "street" ou "neighborhood" conforme o dado disponível.`;

const RELEVANCE_FILTER_PROMPT = `Você é um filtro de relevância OSINT para monitoramento de incidentes urbanos.
Receberá o TÍTULO e DESCRIÇÃO de uma notícia. Determine SE RAPIDO se é sobre um incidente urbano relevante.

CONSIDERAR RELEVANTE se menciona: acidentes de trânsito, falta de energia/elétrica,
chuvas fortes/alagamentos, buracos nas ruas, violência/assaltos em sequência, vazamentos,
interdições de vias, eventos que impactam mobilidade urbana, inaugurações.

NÃO relevante: política eleitoral, entretenimento, celebridades, esportes, economia
sem impacto urbano direto, notícias internacionais sem localização brasileira.

Responda SOMENTE JSON: {"relevant":true|false,"type":"accident|power|weather|pothole|show|party|noise|inauguration|other|null","reason":"breve texto em português"}`;

// ---------- Utilitários ----------
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hashUrl(url: string): string {
  // SHA-256 using Web Crypto API (available in Deno Edge Runtime)
  const data = new TextEncoder().encode(url);
  const hashBuffer = new ArrayBuffer(32);
  const hashArray = new Uint8Array(hashBuffer);
  const crypto = globalThis.crypto.subtle;
  return crypto.digest("SHA-256", data).then((buf) => {
    const arr = Array.from(new Uint8Array(buf));
    return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
  }).then((hex) => {
    // synchronous fallback: store in a global, but better to await
    return hex;
  });
}

async function computeHash(url: string): Promise<string> {
  const data = new TextEncoder().encode(url);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssXml(xmlString: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const items = doc.querySelectorAll("item");
  const results: RssItem[] = [];

  for (const item of items) {
    const title = item.querySelector("title")?.textContent?.trim() ?? "";
    const link = item.querySelector("link")?.textContent?.trim() ?? "";
    const description = item.querySelector("description")?.textContent?.trim() ?? "";
    const pubDate = item.querySelector("pubDate")?.textContent?.trim() ?? "";
    const guid = item.querySelector("guid")?.textContent?.trim() ?? link;
    const content = item.querySelector("content\\:encoded")?.textContent?.trim() ?? "";

    if (title && link) {
      results.push({
        title,
        link,
        description: stripHtml(description),
        pubDate,
        guid: guid || link,
        content: stripHtml(content),
      });
    }
  }

  return results;
}

async function fetchRssFeed(feedUrl: string): Promise<RssItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      "User-Agent": "SentryCity-OSINT-Crawler/1.0 (+https://sentrycity.app)",
      Accept: "application/xml,application/rss+xml,text/xml;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch RSS: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  return parseRssXml(xml);
}

// ---------- Jina Search (web search — for sites without RSS) ----------
async function searchJina(query: string): Promise<SearchResult[]> {
  const jinaKey = Deno.env.get("JINA_API_KEY") || Deno.env.get("JINA_SEARCH_API_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/html",
    "User-Agent": "SentryCity-OSINT-Crawler/1.0 (+https://sentrycity.app)",
  };
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;

  const res = await fetch(JINA_SEARCH, {
    method: "POST",
    headers,
    body: JSON.stringify({
      q: query,
      gl: "BR",
      hl: "pt-BR",
      num: 15,
    }),
  });

  if (!res.ok) {
    throw new Error(`Jina Search failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return parseJinaSearchResults(html);
}

function parseJinaSearchResults(html: string): SearchResult[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  // Jina Search wraps each result in an anchor; filter out internal links
  const anchors = doc.querySelectorAll("a[href^='http']");
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href") || "";
    if (!href || seen.has(href)) continue;
    if (href.includes("jina.ai") || href.includes("r.jina.ai") || href.includes("s.jina.ai")) continue;

    seen.add(href);
    const titleEl = anchor.querySelector("h3, h2, strong, .result-title, [class*='title']");
    const snippetEl = anchor.querySelector("p, .snippet, .description, .result-snippet");
    const title = (titleEl?.textContent || anchor.textContent || "").trim().substring(0, 300);
    const snippet = (snippetEl?.textContent || "").trim().substring(0, 500);

    if (title && href) {
      results.push({ title, url: href, snippet });
    }
    if (results.length >= 15) break;
  }

  return results;
}

// ---------- AI Relevance Filter (Stage 1) ----------
async function filterRelevance(
  title: string,
  description: string,
  apiKey: string,
  model: string = "qwen/qwen3.8-27b"
): Promise<RelevanceFilterResult | null> {
  const content = `${title}\n\n${description}`.substring(0, 1000);

  let res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: RELEVANCE_FILTER_PROMPT },
        { role: "user", content: content },
      ],
      temperature: 0.1,
      max_tokens: 128,
      response_format: { type: "json_object" },
    }),
  });

  // Fallback sem JSON mode se o modelo não suportar
  if (!res.ok && res.status >= 400 && res.status < 500) {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: RELEVANCE_FILTER_PROMPT },
          { role: "user", content: content },
        ],
        temperature: 0.1,
        max_tokens: 128,
      }),
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq filter error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }
}

// ---------- AI Full Analysis (Stage 2 — port do newsAnalysis.ts) ----------
const VALID_TYPES = [
  "accident", "power", "weather", "pothole",
  "show", "party", "noise", "inauguration", "other",
];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"] as const;
const VALID_PRECISIONS = ["exact", "street", "neighborhood", "city", "unknown"] as const;

function applyCrossStreetRule(loc: any): any {
  const street = (loc.street || "").trim();
  const m = street.match(/^(.+?)\s+(?:cruzamento\s+)?(?:com|e)\s+(.+)$/i);
  if (m && m[1] && m[2] && !(loc.cross_street || "").trim()) {
    return { ...loc, street: m[1].trim(), cross_street: m[2].trim() };
  }
  return loc;
}

function normalizeResult(raw: any): NewsAnalysisResult {
  const type = VALID_TYPES.includes(raw?.type) ? raw.type : "other";
  const severity = VALID_SEVERITIES.includes(raw?.severity)
    ? raw.severity
    : "medium";
  const location_precision: any = VALID_PRECISIONS.includes(raw?.location_precision)
    ? raw.location_precision
    : "unknown";

  let score = Number(raw?.confidence_score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.min(1, Math.max(0, score));

  const loc = (raw?.location && typeof raw.location === "object") ? raw.location : {};
  const location = applyCrossStreetRule({
    street: String(loc.street ?? "").trim(),
    number: String(loc.number ?? "").trim(),
    complement: String(loc.complement ?? "").trim(),
    neighborhood: String(loc.neighborhood ?? "").trim(),
    city: String(loc.city ?? "").trim(),
    state: String(loc.state ?? "").trim(),
    zip_code: String(loc.zip_code ?? "").trim(),
    cross_street: String(loc.cross_street ?? "").trim(),
    reference: String(loc.reference ?? "").trim(),
  });

  return {
    title: String(raw?.title ?? "").trim() || "Incidente sem título",
    description: String(raw?.description ?? "").trim() || String(raw?.title ?? "").trim(),
    type,
    severity: severity as any,
    confidence_score: score,
    location,
    location_precision: location_precision as any,
  };
}

async function llMAnalyze(
  text: string,
  apiKey: string,
  model: string = "llama-3.1-8b-instant"
): Promise<NewsAnalysisResult> {
  let res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.substring(0, 6000) }, // limita tamanho
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  // Fallback sem JSON mode
  if (!res.ok && res.status >= 400 && res.status < 500) {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.substring(0, 6000) },
        ],
        temperature: 0.2,
      }),
    });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Groq analysis error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";

  let parsed: any;
  try {
    parsed = JSON.parse(content.replace(/```json|```/g, "").trim());
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Não foi possível interpretar a resposta da IA como JSON.");
    parsed = JSON.parse(match[0].replace(/```json|```/g, ""));
  }

  return normalizeResult(parsed);
}

// ---------- Jina Reader (article extraction) ----------
async function extractArticle(url: string): Promise<{
  title: string;
  content: string;
  description: string;
  sourceName: string;
}> {
  const jinaUrl = `${JINA_BASE}/${url}?returnFormat=markdown`;
  const headers: Record<string, string> = { Accept: "application/json" };

  const jinaKey = Deno.env.get("JINA_READER_API_KEY");
  if (jinaKey) headers.Authorization = `Bearer ${jinaKey}`;

  const res = await fetch(jinaUrl, { headers });
  if (!res.ok) throw new Error(`Jina extraction failed: ${res.status}`);

  const envelope = await res.json();
  const data = envelope.data ?? envelope;

  const title = (data.title || "").trim();
  let content = (data.content || data.markdown || "").trim();

  if (content.length < 20) {
    throw new Error("Conteúdo extraído muito curto.");
  }

  // Limpa conteúdo (share links, imagens, navegação)
  content = content
    .replace(/!\[Image \d+:.*?\]\(.*?\)/g, "")
    .replace(/\[.*?\]\(https?:\/\/.*?(facebook|whatsapp|twitter|linkedin|compartilhe|copiar).*?\)/gim, "")
    .replace(/\[.*?\]\(https?:\/\/.*?\)$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .substring(0, 6000);

  let sourceName = "";
  try {
    sourceName = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    sourceName = url;
  }

  return {
    title,
    content,
    description: (data.description || "").trim(),
    sourceName,
  };
}

// ---------- Geocoding (port simplificado do geocoding.ts) ----------
async function geocodeAddress(
  query: string,
  expectedCity?: string
): Promise<GeocodeResult | null> {
  if (!query || query.trim().length < 3) return null;

  // Tenta Nominatim primeiro
  const nominatimUrl =
    `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=5&countrycodes=br` +
    `&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "SentryCity-Crawler/1.0",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return extractGeocodeResult(data, expectedCity);
      }
    }
  } catch (e) {
    console.warn("Nominatim falhou:", e);
  }

  // Fallback: Photon
  const photonUrl = `${PHOTON_BASE}?limit=5&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(photonUrl, {
      headers: {
        "User-Agent": "SentryCity-Crawler/1.0",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const data = await res.json();
      const features = data?.features ?? [];
      if (features.length > 0) {
        return extractPhotonResult(features, expectedCity);
      }
    }
  } catch (e) {
    console.warn("Photon falhou:", e);
  }

  return null;
}

function extractGeocodeResult(data: any[], expectedCity?: string): GeocodeResult | null {
  if (data.length === 0) return null;
  const first = data[0];
  const addr = first.address || {};
  return {
    lat: parseFloat(first.lat),
    lng: parseFloat(first.lon),
    displayName: first.display_name,
    city: addr.city || addr.town || addr.village || "",
    state: addr.state || addr.region || "",
    zipCode: addr.postcode || undefined,
  };
}

function extractPhotonResult(features: any[], expectedCity?: string): GeocodeResult | null {
  const f = features[0];
  const props = f.properties || {};
  const coords = f.geometry?.coordinates ?? [];
  return {
    lat: coords[1],
    lng: coords[0],
    displayName: props.name || "",
    city: props.city || props.county || "",
    state: props.state || "",
    zipCode: props.postcode || undefined,
  };
}

// ---------- Geocode query builders (do newsAnalysis.ts) ----------
function buildGeocodeQueryByPrecision(loc: NewsLocation, precision: string): string {
  const parts: string[] = [];
  switch (precision) {
    case "exact":
      parts.push(loc.street, loc.number, loc.neighborhood, loc.city, loc.state);
      break;
    case "street":
      parts.push(loc.street, loc.neighborhood, loc.city, loc.state);
      break;
    case "neighborhood":
      parts.push(loc.neighborhood, loc.city, loc.state);
      break;
    case "city":
      parts.push(loc.city, loc.state);
      break;
    default:
      return "";
  }
  return parts.map((p) => p.trim()).filter(Boolean).join(", ");
}

function formatLocation(loc: NewsLocation): string {
  return [
    loc.street, loc.number, loc.complement,
    loc.neighborhood, loc.city, loc.state,
  ]
    .filter(Boolean)
    .join(", ");
}

// ---------- Incident creation (port do newsIngestion.ts) ----------
const MERGE_RADIUS_METERS = 200;

async function findNearbyIncident(
  supabase: any,
  lat: number,
  lng: number,
  type: string
): Promise<any | null> {
  const { data, error } = await supabase
    .from("incidents")
    .select("*")
    .eq("type", type)
    .eq("status", "active");

  if (error || !data) return null;
  const candidates = data as any[];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const haversine = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  let closest: any = null;
  let closestDist = Infinity;

  for (const c of candidates) {
    const dist = haversine(lat, lng, c.latitude, c.longitude);
    if (dist <= MERGE_RADIUS_METERS && dist < closestDist) {
      closest = c;
      closestDist = dist;
    }
  }
  return closest;
}

interface CrawlResult {
  feeds: number;
  found: number;
  relevant: number;
  created: number;
  merged: number;
  errors: string[];
}

// ---------- Main Handler ----------
export default {
  fetch: withSupabase({ auth: ["secret"] }, async (req, ctx) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const maxArticles = body.max_articles ?? MAX_ARTICLES_PER_FEED;
    const maxRelevant = body.max_relevant ?? MAX_RELEVANT_PER_RUN;

    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const startedAt = Date.now();
    const results: CrawlResult = {
      feeds: 0,
      found: 0,
      relevant: 0,
      created: 0,
      merged: 0,
      errors: [],
    };

    // Cria log de início
    const { data: logEntry, error: logError } = await ctx.supabaseAdmin
      .from("crawler_logs")
      .insert({
        started_at: new Date().toISOString(),
        status: "running",
      })
      .select("id")
      .single();

    if (logError) {
      console.error("Failed to create crawler log:", logError.message);
    }
    const logId = logEntry?.id;

    // Busca feeds ativos
    const { data: feeds, error: feedsError } = await ctx.supabaseAdmin
      .from("crawler_feeds")
      .select("*")
      .eq("is_active", true);

    if (feedsError) {
      console.error("Failed to fetch feeds:", feedsError.message);
      return new Response(JSON.stringify({ error: feedsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!feeds || feeds.length === 0) {
      // Tenta ler da secret CRAWLER_RSS_FEEDS
      const feedsEnv = Deno.env.get("CRAWLER_RSS_FEEDS") || "";
      if (feedsEnv) {
        feeds.push(
          ...feedsEnv.split(",").filter(Boolean).map((url: string) => ({
            url: url.trim(),
            name: url.trim(),
            category: "default",
          }))
        );
      }
    }

    results.feeds = feeds.length;

    // Processa cada feed
    for (const feed of feeds) {
      try {
        let items: RssItem[];

        // Branching: RSS feed vs Jina Search query
        if (feed.source_type === 'jina_search') {
          // Jina Search returns results that we convert to RssItem format
          const searchResults = await searchJina(feed.url);
          items = searchResults.map(r => ({
            title: r.title,
            link: r.url,
            description: r.snippet,
            pubDate: "", // not available from search results
            guid: r.url,  // use URL as GUID
            content: "",  // will be populated by Jina Reader extraction
          }));
        } else {
          // Default: RSS feed
          items = await fetchRssFeed(feed.url);
        }
        results.found += items.length;

        for (const item of items.slice(0, maxArticles)) {
          try {
            // 1. Deduplicação: verifica se URL já foi processada
            const urlHash = await computeHash(item.link);
            const { data: existing } = await ctx.supabaseAdmin
              .from("raw_reports")
              .select("id")
              .eq("url_hash", urlHash)
              .single();

            if (existing) continue; // já processado

            // 2. Stage 1: AI Relevance Filter (barato)
            const activeModel = Deno.env.get("AI_PRODUCT_MODEL") || "qwen/qwen3.8-27b";
            const filter = await filterRelevance(
              item.title,
              item.description,
              apiKey,
              activeModel
            );

            if (!filter || !filter.relevant) continue;
            results.relevant++;
            if (results.relevant >= maxRelevant) {
              console.log(`Reached max_relevant (${maxRelevant}), stopping`);
              break;
            }

            // 3. Stage 2: Jina Reader extraction
            const article = await extractArticle(item.link);
            await sleep(REQUEST_DELAY_MS);

            // Salva raw_report (marca como processado pelo crawler)
            const { data: rawReport } = await ctx.supabaseAdmin
              .from("raw_reports")
              .insert({
                original_text: article.content,
                original_url: item.link,
                url_hash: urlHash,
                source_name: article.sourceName,
                title: article.title,
                description: article.description,
                published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
                processed: false,
              })
              .select("id")
              .single();

            // 4. Stage 2: Full AI analysis
            const analysis = await llMAnalyze(
              article.content,
              apiKey,
              Deno.env.get("AI_PRODUCT_MODEL") || "qwen/qwen3.8-27b"
            );
            await sleep(500);

            // 5. Geocoding
            const geoQuery = buildGeocodeQueryByPrecision(
              analysis.location,
              analysis.location_precision
            );

            let lat = null, lng = null, displayName = null, zipCode = null;
            if (geoQuery) {
              const geo = await geocodeAddress(
                geoQuery,
                analysis.location.city || undefined
              );
              await sleep(REQUEST_DELAY_MS);

              if (geo) {
                lat = geo.lat;
                lng = geo.lng;
                displayName = geo.displayName;
                zipCode = geo.zipCode;
                if (!analysis.location.zip_code && zipCode) {
                  analysis.location.zip_code = zipCode;
                }
              }
            }

            // 6. Cria ou faz merge de incidente
            if (rawReport && lat !== null && lng !== null) {
              const nearby = await findNearbyIncident(
                ctx.supabaseAdmin,
                lat,
                lng,
                analysis.type
              );

              let incidentId: string;
              if (nearby) {
                // Merge: cria confirm report + ai_analysis
                incidentId = nearby.id;
                await ctx.supabaseAdmin.from("incident_reports").insert({
                  incident_id: incidentId,
                  type: "confirm",
                  comment: `Relato via crawler OSINT (${article.sourceName || feed.name})`,
                  user_id: null,
                });

                await ctx.supabaseAdmin.from("ai_analysis").insert({
                  incident_id: incidentId,
                  model_name: Deno.env.get("AI_PRODUCT_MODEL") || "qwen/qwen3.8-27b",
                  prompt_version: "v2-crawler",
                  extracted_type: analysis.type,
                  extracted_location: formatLocation(analysis.location),
                  extracted_severity: analysis.severity,
                  location_precision: analysis.location_precision,
                  confidence: analysis.confidence_score,
                  raw_response: analysis as any,
                });

                results.merged++;
              } else {
                // Novo incidente
                const { data: newIncident } = await ctx.supabaseAdmin
                  .from("incidents")
                  .insert({
                    title: analysis.title,
                    description: analysis.description,
                    type: analysis.type,
                    severity: analysis.severity,
                    status: "active",
                    latitude: lat,
                    longitude: lng,
                    address: formatLocation(analysis.location),
                    city: analysis.location.city || null,
                    state: analysis.location.state || null,
                    zip_code: analysis.location.zip_code || null,
                    source: article.sourceName || feed.name,
                    confidence_score: analysis.confidence_score,
                    reported_at: new Date().toISOString(),
                  })
                  .select("id")
                  .single();

                if (newIncident) {
                  incidentId = newIncident.id;

                  await ctx.supabaseAdmin.from("ai_analysis").insert({
                    incident_id: incidentId,
                    model_name: Deno.env.get("AI_PRODUCT_MODEL") || "qwen/qwen3.8-27b",
                    prompt_version: "v2-crawler",
                    extracted_type: analysis.type,
                    extracted_location: formatLocation(analysis.location),
                    extracted_severity: analysis.severity,
                    location_precision: analysis.location_precision,
                    confidence: analysis.confidence_score,
                    raw_response: analysis as any,
                  });

                  await ctx.supabaseAdmin
                    .from("raw_reports")
                    .update({ processed: true, incident_id: incidentId })
                    .eq("id", rawReport.id);

                  results.created++;
                }
              }
            }
          } catch (err: any) {
            results.errors.push(`${item.link}: ${err.message}`);
          }
        }

        // Update last_fetched_at for this feed
        await ctx.supabaseAdmin
          .from("crawler_feeds")
          .update({
            last_fetched_at: new Date().toISOString(),
            last_success: true,
            error_message: null,
          })
          .eq("id", feed.id);

      } catch (err: any) {
        results.errors.push(`${feed.url}: ${err.message}`);
        await ctx.supabaseAdmin
          .from("crawler_feeds")
          .update({
            last_fetched_at: new Date().toISOString(),
            last_success: false,
            error_message: err.message,
          })
          .eq("id", feed.id);
      }

      // Brief pause entre feeds para não sobrecarregar
      await sleep(1000);
    }

    const durationMs = Date.now() - startedAt;

    // Finaliza log
    if (logId) {
      await ctx.supabaseAdmin
        .from("crawler_logs")
        .update({
          finished_at: new Date().toISOString(),
          feeds_checked: results.feeds,
          articles_found: results.found,
          articles_relevant: results.relevant,
          incidents_created: results.created,
          incidents_merged: results.merged,
          errors: results.errors.length > 0 ? results.errors : null,
          duration_ms: durationMs,
          status: results.errors.length > 0 ? "success" : "success",
        })
        .eq("id", logId);
    }

    return new Response(JSON.stringify({
      ...results,
      duration_ms: durationMs,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }),
};
