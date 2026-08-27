/**
 * Serviço de Geocoding
 * --------------------------------------------------------------------------
 * Converte endereços em coordenadas (latitude/longitude) usando a API gratuita
 * do OpenStreetMap Nominatim. Mantido isolado para poder ser reutilizado por
 * qualquer parte do app (modal de criação, análise de notícias por IA, etc.)
 * e para facilitar a troca do provedor no futuro.
 *
 * Regras de uso do Nominatim: no máximo 1 req/s e um header identificando a
 * aplicação. Como o frontend não controla o User-Agent, usamos o parâmetro
 * de contato via query e limitamos as chamadas no lado da UI (debounce).
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const PHOTON_BASE = 'https://photon.komoot.io/api';

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  address: string;
  city: string;
  state: string;
  zipCode?: string;
}

export interface GeocodeSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  raw: any;
}

export interface ViaCepResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

/** Busca endereço pelo CEP na API ViaCEP. Retorna null se não encontrado. */
export async function fetchByCep(cep: string): Promise<ViaCepResult | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.erro) return null;
    return data as ViaCepResult;
  } catch (error) {
    console.error('fetchByCep falhou:', error);
    return null;
  }
}

/** Extrai cidade/estado/cep do bloco `address` do Nominatim de forma resiliente. */
function extractCityState(addr: any): { city: string; state: string; zipCode: string } {
  if (!addr) return { city: '', state: '', zipCode: '' };
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
  const state = addr.state || addr.region || '';
  const zipCode = addr.postcode || '';
  return { city, state, zipCode };
}

/** Normaliza texto para comparação (minúsculo, sem acentos). */
function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Verifica se a cidade do resultado corresponde à cidade esperada (tolerante). */
function cityMatches(candidateCity: string, expectedCity?: string): boolean {
  if (!expectedCity) return true;
  if (!candidateCity) return false;
  const c = normalizeText(candidateCity);
  const e = normalizeText(expectedCity);
  return c === e || c.includes(e) || e.includes(c);
}

/**
 * Escolhe o melhor candidato entre os resultados: prioriza aqueles cuja
 * cidade corresponde à cidade esperada (evita plotar em outra cidade que
 * tenha rua/bairro com o mesmo nome).
 */
function pickBestCandidate(
  candidates: GeocodeResult[],
  expectedCity?: string
): GeocodeResult | null {
  if (candidates.length === 0) return null;
  if (!expectedCity) return candidates[0];
  return candidates.find((r) => cityMatches(r.city, expectedCity)) ?? null;
}

/** Tenta geocodificar via Nominatim com retry simples em rate limit (429). */
async function geocodeWithNominatim(
  query: string,
  expectedCity?: string
): Promise<GeocodeResult | null> {
  const url =
    `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=5&countrycodes=br` +
    `&q=${encodeURIComponent(query)}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 429) {
        // Rate limit: espera antes de tentar de novo.
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const candidates: GeocodeResult[] = data.map((first: any) => {
        const { city, state, zipCode } = extractCityState(first.address);
        return {
          lat: parseFloat(first.lat),
          lng: parseFloat(first.lon),
          displayName: first.display_name,
          address: first.display_name,
          city,
          state,
          zipCode: zipCode || undefined,
        };
      });
      return pickBestCandidate(candidates, expectedCity);
    } catch (error) {
      console.warn('geocodeWithNominatim falhou (tentativa ' + (attempt + 1) + '):', error);
    }
  }
  return null;
}

/** Fallback: Photon (komoot). Não tem countrycodes, mas encontra endereços brasileiros. */
async function geocodeWithPhoton(
  query: string,
  expectedCity?: string
): Promise<GeocodeResult | null> {
  const url = `${PHOTON_BASE}?limit=5&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const features: any[] = data?.features ?? [];
    if (features.length === 0) return null;

    const candidates: GeocodeResult[] = features
      .map((feature) => {
        const props = feature.properties || {};
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        if (lat == null || lng == null) return null;
        return {
          lat,
          lng,
          displayName: props.name || query,
          address: props.name || query,
          city: props.city || props.county || '',
          state: props.state || '',
          zipCode: props.postcode || undefined,
        } as GeocodeResult;
      })
      .filter(Boolean);

    return pickBestCandidate(candidates, expectedCity);
  } catch (error) {
    console.warn('geocodeWithPhoton falhou:', error);
    return null;
  }
}

export interface GeocodeOptions {
  /** Cidade esperada do endereço: resultados em outras cidades são descartados. */
  expectedCity?: string;
  /** Estado esperado (usado no fallback por cidade). */
  expectedState?: string;
}

/**
 * Geocodifica um endereço textual completo. Retorna o primeiro resultado ou
 * `null` quando nada é encontrado. Tenta Nominatim e cai para Photon como
 * fallback (evita o erro "Não foi possível geocodificar" em falhas da primeira).
 *
 * Quando `expectedCity` é informado, descarta resultados de outras cidades e,
 * se nada casar, geocodifica apenas "cidade, estado" para garantir que o
 * ponto caia no município correto (centro da cidade).
 */
export async function geocodeAddress(
  query: string,
  options?: GeocodeOptions
): Promise<GeocodeResult | null> {
  if (!query || query.trim().length < 3) return null;

  const expectedCity = options?.expectedCity?.trim();

  const result =
    (await geocodeWithNominatim(query, expectedCity)) ??
    (await geocodeWithPhoton(query, expectedCity));

  if (expectedCity) {
    if (result) return result;

    // Fallback: geocodifica só a cidade para não plotar em outro município.
    const cityQuery = [expectedCity, options?.expectedState]
      .filter(Boolean)
      .join(', ');
    if (cityQuery && normalizeText(cityQuery) !== normalizeText(query)) {
      return (
        (await geocodeWithNominatim(cityQuery)) ??
        (await geocodeWithPhoton(cityQuery))
      );
    }
    return null;
  }

  return result;
}

/**
 * Busca sugestões de autocomplete para um trecho de endereço.
 * `bias` permite priorizar resultados dentro de uma cidade.
 */
export async function searchAddressSuggestions(
  query: string,
  bias?: { city?: string }
): Promise<GeocodeSuggestion[]> {
  if (!query || query.trim().length < 3) return [];

  const q = bias?.city ? `${query}, ${bias.city}` : query;
  const url =
    `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=5&countrycodes=br` +
    `&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name,
      raw: item,
    }));
  } catch (error) {
    console.error('searchAddressSuggestions falhou:', error);
    return [];
  }
}
