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

/** Tenta geocodificar via Nominatim com retry simples em rate limit (429). */
async function geocodeWithNominatim(query: string): Promise<GeocodeResult | null> {
  const url =
    `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=1&countrycodes=br` +
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

      const first = data[0];
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
    } catch (error) {
      console.warn('geocodeWithNominatim falhou (tentativa ' + (attempt + 1) + '):', error);
    }
  }
  return null;
}

/** Fallback: Photon (komoot). Não tem countrycodes, mas encontra endereços brasileiros. */
async function geocodeWithPhoton(query: string): Promise<GeocodeResult | null> {
  const url = `${PHOTON_BASE}?limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;

    const props = feature.properties || {};
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (lat == null || lng == null) return null;

    return {
      lat,
      lng,
      displayName: props.name || query,
      address: props.name || query,
      city: props.city || props.state || '',
      state: props.state || '',
      zipCode: props.postcode || undefined,
    };
  } catch (error) {
    console.warn('geocodeWithPhoton falhou:', error);
    return null;
  }
}

/**
 * Geocodifica um endereço textual completo. Retorna o primeiro resultado ou
 * `null` quando nada é encontrado. Tenta Nominatim e cai para Photon como
 * fallback (evita o erro "Não foi possível geocodificar" em falhas da primeira).
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query || query.trim().length < 3) return null;

  const nominatimResult = await geocodeWithNominatim(query);
  if (nominatimResult) return nominatimResult;

  return geocodeWithPhoton(query);
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
