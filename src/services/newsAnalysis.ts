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

export interface NewsLocation {
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

export interface NewsAnalysisResult {
  title: string;
  description: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number; // 0.0 a 1.0
  location: NewsLocation;
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelos gratuitos disponíveis no OpenRouter. Basta trocar para alternar.
export const FREE_MODELS = {
  deepseek: 'deepseek/deepseek-chat-v3.1:free',
  qwen: 'qwen/qwen-2.5-72b-instruct:free',
  nemotron: 'nvidia/nemotron-nano-9b-v2:free',
} as const;

const DEFAULT_MODEL = FREE_MODELS.deepseek;

/** Retorna o modelo configurado via variável de ambiente (AI_PRODUCT_MODEL), ou o default. */
export function getActiveModel(): string {
  return (process.env.AI_PRODUCT_MODEL as string | undefined)?.trim() || DEFAULT_MODEL;
}

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
  }
}

REGRAS DE LOCALIZAÇÃO:
- Quando o texto citar um cruzamento no formato "Rua X cruzamento com Rua Y" ou "Rua X com Rua Y":
  a primeira rua citada (X) é o endereço principal e vai em "street";
  a segunda rua citada (Y) vai em "cross_street".
- Nunca combine as duas ruas no campo "street".
- Se a notícia indicar o local apenas por bairro ou ponto de referência, preencha apenas os campos disponíveis.`;

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

const emptyLocation = (): NewsLocation => ({
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  cross_street: '',
  reference: '',
});

/**
 * Regra de cruzamento: quando "Rua X cruzamento com Rua Y", a primeira rua é o
 * endereço principal (street) e a segunda vai para cross_street.
 * Aplica-se quando a IA já retornou um "street" contendo ambas as ruas.
 */
function applyCrossStreetRule(location: NewsLocation): NewsLocation {
  const street = location.street.trim();
  const crossMatch = street.match(/^(.+?)\s+(?:cruzamento\s+)?(?:com|e)\s+(.+)$/i);
  if (crossMatch && crossMatch[1] && crossMatch[2] && !location.cross_street.trim()) {
    return { ...location, street: crossMatch[1].trim(), cross_street: crossMatch[2].trim() };
  }
  return location;
}

/** Normaliza e valida a resposta bruta da LLM para o formato esperado. */
function normalizeResult(raw: any): NewsAnalysisResult {
  const type = VALID_TYPES.includes(raw?.type) ? raw.type : 'other';
  const severity = VALID_SEVERITIES.includes(raw?.severity) ? raw.severity : 'medium';
  let score = Number(raw?.confidence_score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.min(1, Math.max(0, score));

  const loc = raw?.location && typeof raw.location === 'object' ? raw.location : {};
  const location = applyCrossStreetRule({
    street: String(loc.street ?? '').trim(),
    number: String(loc.number ?? '').trim(),
    complement: String(loc.complement ?? '').trim(),
    neighborhood: String(loc.neighborhood ?? '').trim(),
    city: String(loc.city ?? '').trim(),
    state: String(loc.state ?? '').trim(),
    zip_code: String(loc.zip_code ?? '').trim(),
    cross_street: String(loc.cross_street ?? '').trim(),
    reference: String(loc.reference ?? '').trim(),
  });

  return {
    title: String(raw?.title ?? '').trim() || 'Incidente sem título',
    description: String(raw?.description ?? '').trim() || String(raw?.title ?? '').trim(),
    type,
    severity: severity as NewsAnalysisResult['severity'],
    confidence_score: score,
    location,
  };
}

/** Monta o endereço legível completo a partir da localização extraída. */
export function formatLocation(location: NewsLocation): string {
  return [
    location.street,
    location.number,
    location.complement,
    location.neighborhood,
    location.city,
    location.state,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Monta a query de geocoding: somente street + neighborhood + city + state. */
export function buildGeocodeQuery(location: NewsLocation): string {
  return [location.street, location.neighborhood, location.city, location.state]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ');
}

/**
 * Analisa o texto de uma notícia e retorna os dados estruturados do incidente.
 *
 * @param newsText  Texto completo (ou trecho) da notícia.
 * @param model     Modelo do OpenRouter a usar (padrão: DeepSeek gratuito).
 */
export async function analyzeNewsText(
  newsText: string,
  model: string = getActiveModel()
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

  const buildBody = (useJsonMode: boolean) => ({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: newsText },
    ],
    temperature: 0.2,
    ...(useJsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  });

  // Alguns modelos (ex: reasoning do NVIDIA) não suportam response_format.
  // Tentamos primeiro com JSON mode; se a API recusar, repetimos sem ele.
  let res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildBody(true)),
  });

  if (!res.ok && res.status >= 400 && res.status < 500) {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody(false)),
    });
  }

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
    // Modelos de raciocínio podem antepor texto/raciocínio ao JSON. Extraímos o 1º objeto.
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('Não foi possível interpretar a resposta da IA como JSON.');
    }
    try {
      parsed = JSON.parse(match[0].replace(/```json|```/g, ''));
    } catch {
      throw new Error('Não foi possível interpretar a resposta da IA como JSON.');
    }
  }

  return normalizeResult(parsed);
}
