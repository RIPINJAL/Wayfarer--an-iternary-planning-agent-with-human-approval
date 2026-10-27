import { describe, expect, it } from 'vitest';
import { estimateTravel, haversineKm } from '@/lib/agent/geo';
import { submitInputSchema, jsonSchemaOf, CLIENT_TOOLS } from '@/lib/agent/tools';
import { TtlCache, throttle } from '@/lib/agent/http';

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
});

describe('tool schemas', () => {
  it('submit_itinerary schema is a JSON-schema object the API accepts', () => {
    expect((submitInputSchema as { type: string }).type).toBe('object');
    expect(JSON.stringify(submitInputSchema)).toContain('"days"');
  });
  it('every data tool has an object input schema', () => {
    for (const t of CLIENT_TOOLS) expect((jsonSchemaOf(t.schema) as { type: string }).type).toBe('object');
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
