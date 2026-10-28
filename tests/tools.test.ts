import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateTravel, haversineKm, locatePlace } from '@/lib/agent/geo';
import { completeDraft } from '@/lib/agent/complete-draft';
import { submitInputSchema, jsonSchemaOf, CLIENT_TOOLS, locatePlaces } from '@/lib/agent/tools';
import { ItinerarySchema } from '@/lib/schemas';
import { TtlCache, throttle } from '@/lib/agent/http';
import { itinerary } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geo maths', () => {
  it('haversine: Paris to London is about 344 km', () => {
    const d = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
    expect(d).toBeGreaterThan(340);
    expect(d).toBeLessThan(348);
  });
  it('estimateTravel orders modes sensibly', () => {
    const t = estimateTravel({ lat: 38.71, lng: -9.13 }, { lat: 38.74, lng: -9.15 });
    expect(t.walkMin).toBeGreaterThan(t.transitMin);
    expect(t.transitMin).toBeGreaterThan(0);
  });

  it('uses matching Wikimedia coordinates if the map providers have no result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('photon.komoot.io')) return Response.json({ features: [] });
      if (url.includes('nominatim.openstreetmap.org')) return Response.json([]);
      if (url.includes('en.wikipedia.org') && url.includes('generator=search')) {
        return Response.json({ query: { pages: { '1': { title: 'City Palace, Jaipur', index: 1 } } } });
      }
      if (url.includes('en.wikipedia.org') && url.includes('prop=coordinates')) {
        return Response.json({ query: { pages: { '1': { title: 'City Palace, Jaipur', coordinates: [{ lat: 26.9257, lon: 75.8236 }] } } } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const hit = await locatePlace('City Palace (Mapping Test)', 'Jaipur', { lat: 26.9124, lng: 75.7873 });
    expect(hit).toEqual({ name: 'City Palace, Jaipur', country: 'India', lat: 26.9257, lng: 75.8236 });
  });

  it('treats a Wikimedia rate limit as an unavailable fallback and stops further calls temporarily', async () => {
    let wikipediaRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('photon.komoot.io')) return Response.json({ features: [] });
      if (url.includes('nominatim.openstreetmap.org')) return Response.json([]);
      if (url.includes('en.wikipedia.org')) {
        wikipediaRequests++;
        return new Response('rate limited', { status: 429 });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await expect(locatePlace('Rate Limit Test Landmark A', 'Jaipur', { lat: 26.9124, lng: 75.7873 })).resolves.toBeNull();
    await expect(locatePlace('Rate Limit Test Landmark B', 'Jaipur', { lat: 26.9124, lng: 75.7873 })).resolves.toBeNull();
    expect(wikipediaRequests).toBe(1);
  });
});

describe('tool schemas', () => {
  it('submit_itinerary schema is a JSON-schema object the API accepts', () => {
    expect((submitInputSchema as { type: string }).type).toBe('object');
    expect(JSON.stringify(submitInputSchema)).toContain('"days"');
  });
  it('every data tool has an object input schema', () => {
    for (const t of CLIENT_TOOLS) expect((jsonSchemaOf(t.schema) as { type: string }).type).toBe('object');
  });
  it('accepts a realistic place batch but caps oversized requests', () => {
    const place = (n: number) => `Place ${n}`;
    expect(locatePlaces.schema.safeParse({ city: 'Lisbon', places: Array.from({ length: 16 }, (_, i) => place(i)) }).success).toBe(true);
    expect(locatePlaces.schema.safeParse({ city: 'Lisbon', places: Array.from({ length: 31 }, (_, i) => place(i)) }).success).toBe(false);
  });
});

describe('itinerary draft completion', () => {
  it('derives only omitted overview fields from the plan and traveller currency', () => {
    const input = {
      ...itinerary,
      summary: undefined,
      currency: undefined,
      days: [{
        ...itinerary.days[0],
        theme: undefined,
        summary: undefined,
        items: itinerary.days[0].items.map(({ title: _title, ...item }) => item),
      }],
    };
    const { draft, fields } = completeDraft(input, 'EUR');
    expect(fields).toEqual([
      'days.1.items.1.title',
      'days.1.items.2.title',
      'days.1.theme',
      'days.1.summary',
      'currency',
      'summary',
    ]);
    expect(ItinerarySchema.safeParse(draft).success).toBe(true);
    expect((draft as { currency: string }).currency).toBe('EUR');
    expect((draft as { summary: string }).summary).toContain('Plan to');
  });

  it('leaves substantive missing data for validation to reject', () => {
    const { draft, fields } = completeDraft({ days: [{ items: [] }] }, 'USD');
    expect(fields).toEqual(['currency']);
    expect(draft).toEqual({ days: [{ items: [] }], currency: 'USD' });
  });
});

describe('helpers', () => {
  it('TtlCache expires entries', async () => {
    const c = new TtlCache<number>(10);
    c.set('a', 1);
    expect(c.get('a')).toBe(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(c.get('a')).toBeUndefined();
  });
  it('throttle spaces calls apart', async () => {
    const gate = throttle(40);
    const t0 = Date.now();
    await Promise.all([gate(async () => 1), gate(async () => 2), gate(async () => 3)]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(75);
  });
});
