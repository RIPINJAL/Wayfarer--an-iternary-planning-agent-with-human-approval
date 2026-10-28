import 'server-only';
import { getJson, throttle, TtlCache } from './http';

export interface GeoHit {
  name: string;
  country?: string;
  region?: string;
  lat: number;
  lng: number;
  timezone?: string;
}

const cityCache = new TtlCache<GeoHit[]>(24 * 3600_000);
const placeCache = new TtlCache<GeoHit | null>(24 * 3600_000, 2000);
const nominatimGate = throttle(1100);
const wikipediaGate = throttle(1500);
let wikipediaBlockedUntil = 0;

async function getWikipediaJson<T>(url: string): Promise<T | null> {
  if (Date.now() < wikipediaBlockedUntil) return null;
  return wikipediaGate(async () => {
    if (Date.now() < wikipediaBlockedUntil) return null;
    try {
      return await getJson<T>(url);
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTP 429')) {
        wikipediaBlockedUntil = Date.now() + 60_000;
        return null;
      }
      throw error;
    }
  });
}

async function locateFromWikipedia(name: string, city: string, near: { lat: number; lng: number }): Promise<GeoHit | null> {
  const searchName = name.split(/\s*\(/, 1)[0].trim();
  const search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${searchName} ${city}`,
    gsrlimit: '5',
    prop: 'coordinates',
    colimit: '1',
  });
  type S = { query?: { pages?: Record<string, { title: string; index?: number }> } };
  const searchResults = await getWikipediaJson<S>(`https://en.wikipedia.org/w/api.php?${search}`);
  if (!searchResults) return null;
  const searchPages = Object.values(searchResults.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 999) - (b.index ?? 999))
    .slice(0, 5);
  if (!searchPages.length) return null;

  const coordinateQuery = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'coordinates',
    titles: searchPages.map((page) => page.title).join('|'),
    redirects: '1',
  });
  type W = { query?: { pages?: Record<string, { title: string; coordinates?: { lat: number; lon: number }[] }> } };
  const results = await getWikipediaJson<W>(`https://en.wikipedia.org/w/api.php?${coordinateQuery}`);
  if (!results) return null;
  const candidates = Object.values(results.query?.pages ?? {})
    .filter((page) => page.coordinates?.[0])
    .sort((a, b) => searchPages.findIndex((page) => page.title === a.title) - searchPages.findIndex((page) => page.title === b.title));
  const tokens = searchName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const place = candidates.find((candidate) => {
    const title = candidate.title.toLowerCase();
    return tokens.length > 0 && tokens.every((token) => title.includes(token));
  });
  const point = place?.coordinates?.[0];
  if (!place || !point) return null;

  const hit = { name: place.title, country: 'India', lat: point.lat, lng: point.lon };
  return haversineKm(near, hit) <= 60 ? hit : null;
}

export async function geocodeCity(query: string, count = 3): Promise<GeoHit[]> {
  const key = `${query.toLowerCase()}|${count}`;
  const hit = cityCache.get(key);
  if (hit) return hit;
  type R = { results?: { name: string; country?: string; admin1?: string; latitude: number; longitude: number; timezone?: string }[] };
  const data = await getJson<R>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}&language=en&format=json`,
  );
  const out = (data.results ?? []).map((r) => ({
    name: r.name, country: r.country, region: r.admin1, lat: r.latitude, lng: r.longitude, timezone: r.timezone,
  }));
  cityCache.set(key, out);
  return out;
}

/** Find a venue/landmark through OpenStreetMap, Nominatim, then matching Wikipedia coordinates. */
export async function locatePlace(name: string, city: string, near?: { lat: number; lng: number }): Promise<GeoHit | null> {
  const q = `${name}, ${city}`;
  const key = q.toLowerCase();
  const cached = placeCache.get(key);
  if (cached !== undefined) return cached;

  let result: GeoHit | null = null;
  try {
    type P = { features?: { geometry: { coordinates: [number, number] }; properties: { name?: string; street?: string; city?: string; country?: string } }[] };
    const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
    const d = await getJson<P>(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1${bias}`);
    const f = d.features?.[0];
    if (f) {
      result = {
        name: f.properties.name ?? name,
        country: f.properties.country,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
      };
    }
  } catch { /* fall through to Nominatim */ }

  if (!result) {
    try {
      type N = { lat: string; lon: string; display_name: string }[];
      const d = await nominatimGate(() =>
        getJson<N>(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`),
      );
      if (d[0]) result = { name, lat: Number(d[0].lat), lng: Number(d[0].lon) };
    } catch { /* give up */ }
  }

  if (!result && near) result = await locateFromWikipedia(name, city, near);

  // Reject results absurdly far from the destination (wrong "Central Park"-style matches).
  if (result && near && haversineKm(near, result) > 150) result = null;
  placeCache.set(key, result);
  return result;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough door-to-door estimates from straight-line distance. Good enough for pacing a day, not for navigation. */
export function estimateTravel(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const straight = haversineKm(a, b);
  const road = straight * 1.3;
  const round = (n: number) => Math.max(1, Math.round(n));
  return {
    straightLineKm: Number(straight.toFixed(2)),
    roadKm: Number(road.toFixed(2)),
    walkMin: round((road / 4.8) * 60),
    bikeMin: round((road / 14) * 60),
    transitMin: round((road / 18) * 60 + 8),
    driveMin: round((road / 28) * 60 + 5),
    note: straight > 150 ? 'Long distance: consider a train or flight instead of local transport.' : undefined,
  };
}
