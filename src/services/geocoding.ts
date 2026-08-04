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

export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
  address: string;
  city: string;
  state: string;
}

export interface GeocodeSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  raw: any;
}

/** Extrai cidade/estado do bloco `address` do Nominatim de forma resiliente. */
function extractCityState(addr: any): { city: string; state: string } {
  if (!addr) return { city: '', state: '' };
  const city =
    addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
  const state = addr.state || addr.region || '';
  return { city, state };
}

/**
 * Geocodifica um endereço textual completo. Retorna o primeiro resultado ou
 * `null` quando nada é encontrado.
 */
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  if (!query || query.trim().length < 3) return null;

  const url =
    `${NOMINATIM_BASE}/search?format=json&addressdetails=1&limit=1&countrycodes=br` +
    `&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Nominatim respondeu ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0];
    const { city, state } = extractCityState(first.address);
    return {
      lat: parseFloat(first.lat),
      lng: parseFloat(first.lon),
      displayName: first.display_name,
      address: first.display_name,
      city,
      state,
    };
  } catch (error) {
    console.error('[v0] geocodeAddress falhou:', error);
    return null;
  }
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
    console.error('[v0] searchAddressSuggestions falhou:', error);
    return [];
  }
}
