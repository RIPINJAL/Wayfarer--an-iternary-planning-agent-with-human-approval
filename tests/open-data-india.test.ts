import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays, checkItineraryAgainstBrief } from '@/lib/schemas';
import { runOpenDataIndiaPlanner } from '@/lib/agent/open-data-india';
import { brief } from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('free India planner', () => {
  it('creates an INR itinerary from OpenStreetMap features without calling a model', async () => {
    const startDate = addDays(new Date().toISOString().slice(0, 10), 2);
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Response.json({ results: [{ name: 'Pune', country: 'India', admin1: 'Maharashtra', latitude: 18.52, longitude: 73.85 }] });
      }
      if (url.includes('overpass-api.de/api/interpreter')) {
        expect(init?.method).toBe('POST');
        return Response.json({ elements: [
          { type: 'node', lat: 18.5196, lon: 73.8553, tags: { name: 'Shaniwar Wada', historic: 'fort' } },
          { type: 'way', center: { lat: 18.5524, lon: 73.9015 }, tags: { name: 'Aga Khan Palace', tourism: 'museum' } },
          { type: 'node', lat: 18.5165, lon: 73.8563, tags: { name: 'Dagadusheth Temple', amenity: 'place_of_worship' } },
          { type: 'way', center: { lat: 18.4936, lon: 73.8772 }, tags: { name: 'Saras Baug', leisure: 'park' } },
        ] });
      }
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return Response.json({ daily: { time: [startDate, addDays(startDate, 1)], temperature_2m_max: [29, 30], temperature_2m_min: [19, 20], precipitation_probability_max: [10, 15], weather_code: [1, 2] } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const planBrief = { ...brief, destination: 'Pune', startDate, endDate: addDays(startDate, 1), currency: 'INR', interests: ['History'] };
    const itinerary = await runOpenDataIndiaPlanner(planBrief, () => undefined);

    expect(itinerary.destination).toMatchObject({ name: 'Pune', country: 'India' });
    expect(itinerary.currency).toBe('INR');
    expect(itinerary.days).toHaveLength(2);
    expect(itinerary.days.every((day) => day.items.length === 2)).toBe(true);
    expect(itinerary.days[0].items[0].title).toBe('Shaniwar Wada');
    expect(itinerary.days.flatMap((day) => day.items).every((item) => item.place?.lat != null)).toBe(true);
    expect(itinerary.budget.notes).toContain('means unknown, not free');
    expect(itinerary.caveats.join(' ')).toContain('No AI model is used');
    expect(checkItineraryAgainstBrief(itinerary, planBrief)).toEqual([]);
    expect(calls.some((url) => url.includes('overpass-api.de'))).toBe(true);
    expect(calls.every((url) => !url.includes('anthropic') && !url.includes('11434'))).toBe(true);
  });

  it('rejects destinations outside India without requesting attractions', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Response.json({ results: [{ name: 'Lisbon', country: 'Portugal', latitude: 38.72, longitude: -9.14 }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await expect(runOpenDataIndiaPlanner(brief, () => undefined)).rejects.toThrow('supports Indian cities only');
    expect(calls.every((url) => !url.includes('overpass-api.de'))).toBe(true);
  });
});
