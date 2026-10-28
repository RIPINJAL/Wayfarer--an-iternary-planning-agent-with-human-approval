import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, checkItineraryAgainstBrief } from '@/lib/schemas';
import { runLocalIndiaPlanner } from '@/lib/agent/local-india';
import { brief } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local India planner', () => {
  it('builds a short INR itinerary from structured model suggestions and verified map pins', async () => {
    const date = addDays(new Date().toISOString().slice(0, 10), 2);
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Response.json({ results: [{ name: 'Jaipur', country: 'India', admin1: 'Rajasthan', latitude: 26.9124, longitude: 75.7873 }] });
      }
      if (url.endsWith('/api/chat')) {
        const request = JSON.parse(String(init?.body)) as { options: { num_ctx: number }; format: object };
        expect(request.options.num_ctx).toBe(4096);
        expect(request.format).toBeTruthy();
        return Response.json({ message: { content: JSON.stringify({ days: [{ places: ['Hawa Mahal', 'City Palace', 'Amber Fort'] }] }) } });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return Response.json({ daily: { time: [date], temperature_2m_max: [32], temperature_2m_min: [22], precipitation_probability_max: [10], weather_code: [1] } });
      }
      if (url.includes('photon.komoot.io/api')) {
        const query = new URL(url).searchParams.get('q') ?? '';
        const point = query.includes('Hawa Mahal') ? [75.8267, 26.9239] : [75.8237, 26.9258];
        const name = query.includes('Hawa Mahal') ? 'Hawa Mahal' : 'City Palace';
        return Response.json({ features: [{ geometry: { coordinates: point }, properties: { name, country: 'India' } }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const events: { type: string; state?: string }[] = [];
    const itinerary = await runLocalIndiaPlanner(
      { ...brief, destination: 'Jaipur', startDate: date, endDate: date, currency: 'INR' },
      (event) => events.push({ type: event.type, ...('state' in event ? { state: event.state } : {}) }),
    );

    expect(itinerary.destination).toMatchObject({ name: 'Jaipur', country: 'India' });
    expect(itinerary.currency).toBe('INR');
    expect(itinerary.days).toHaveLength(1);
    expect(itinerary.days[0].items).toHaveLength(2);
    expect(itinerary.days[0].items.every((item) => item.place?.lat != null && item.place.lng != null)).toBe(true);
    expect(itinerary.budget.totalEstimate).toBe(0);
    expect(itinerary.budget.notes).toContain('means unknown, not free');
    expect(checkItineraryAgainstBrief(itinerary, { ...brief, destination: 'Jaipur', startDate: date, endDate: date, currency: 'INR' })).toEqual([]);
    expect(events.some((event) => event.type === 'tool' && event.state === 'done')).toBe(true);
    expect(urls.some((url) => url.endsWith('/api/chat'))).toBe(true);
  });

  it('rejects non-Indian destinations before calling the local model', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Response.json({ results: [{ name: 'Lisbon', country: 'Portugal', latitude: 38.72, longitude: -9.14 }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await expect(runLocalIndiaPlanner(brief, () => undefined)).rejects.toThrow('supports Indian cities only');
  });
});
