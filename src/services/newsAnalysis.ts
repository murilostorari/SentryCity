/**
 * Serviço de Análise de Notícias por IA (OSINT)
 * --------------------------------------------------------------------------
 * Recebe o texto de uma notícia e extrai, via uma LLM gratuita hospedada no
 * OpenRouter (DeepSeek / Qwen / Nemotron), um objeto estruturado com os campos
 * necessários para criar um incidente.
 *
 * Este módulo já está preparado para uso futuro: se a chave da API não estiver
 * configurada, a função lança um erro claro em vez de quebrar silenciosamente.
 * A troca de modelo é feita apenas mudando `DEFAULT_MODEL`.
 */

export interface NewsAnalysisResult {
  title: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  address: string;
  city: string;
  state: string;
  confidence_score: number; // 0.0 a 1.0
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelos gratuitos disponíveis no OpenRouter. Basta trocar para alternar.
export const FREE_MODELS = {
  deepseek: 'deepseek/deepseek-chat-v3.1:free',
  qwen: 'qwen/qwen-2.5-72b-instruct:free',
  nemotron: 'nvidia/nemotron-nano-9b-v2:free',
} as const;

const DEFAULT_MODEL = FREE_MODELS.deepseek;

const SYSTEM_PROMPT = `Você é um analista de OSINT especializado em incidentes urbanos.
Receberá o texto de uma notícia e deve extrair as informações do incidente descrito.
Responda SOMENTE com um objeto JSON válido, sem texto adicional, no formato:
{
  "title": "título curto e objetivo do incidente",
  "type": "um de: accident, power, weather, pothole, show, party, noise, inauguration, other",
  "severity": "um de: low, medium, high, critical",
  "address": "logradouro/local mencionado, ou string vazia se não houver",
  "city": "cidade mencionada",
  "state": "sigla do estado (ex: SP), ou string vazia",
  "confidence_score": número entre 0 e 1 indicando sua confiança na extração
}`;

const VALID_TYPES = [
  'accident',
  'power',
  'weather',
  'pothole',
  'show',
  'party',
  'noise',
  'inauguration',
  'other',
];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];

/** Normaliza e valida a resposta bruta da LLM para o formato esperado. */
function normalizeResult(raw: any): NewsAnalysisResult {
  const type = VALID_TYPES.includes(raw?.type) ? raw.type : 'other';
  const severity = VALID_SEVERITIES.includes(raw?.severity) ? raw.severity : 'medium';
  let score = Number(raw?.confidence_score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.min(1, Math.max(0, score));

  return {
    title: String(raw?.title ?? '').trim() || 'Incidente sem título',
    type,
    severity: severity as NewsAnalysisResult['severity'],
    address: String(raw?.address ?? '').trim(),
    city: String(raw?.city ?? '').trim(),
    state: String(raw?.state ?? '').trim(),
    confidence_score: score,
  };
}

/**
 * Analisa o texto de uma notícia e retorna os dados estruturados do incidente.
 *
 * @param newsText  Texto completo (ou trecho) da notícia.
 * @param model     Modelo do OpenRouter a usar (padrão: DeepSeek gratuito).
 */
export async function analyzeNewsText(
  newsText: string,
  model: string = DEFAULT_MODEL
): Promise<NewsAnalysisResult> {
  const apiKey = process.env.OPENROUTER_API_KEY as string | undefined;

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY não configurada. Adicione a variável de ambiente para habilitar a análise por IA.'
    );
  }
  if (!newsText || newsText.trim().length < 10) {
    throw new Error('Texto da notícia muito curto para análise.');
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: newsText },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenRouter respondeu ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  let parsed: any;
  try {
    // Alguns modelos envolvem o JSON em cercas de código; limpamos antes.
    const cleaned = content.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Não foi possível interpretar a resposta da IA como JSON.');
  }

  return normalizeResult(parsed);
}
