import 'server-only';
import { z } from 'zod';
import { addDays, checkItineraryAgainstBrief, ItinerarySchema, tripDays, type AgentEvent, type Brief, type Itinerary } from '../schemas';
import { env } from '../env';
import { estimateTravel, geocodeCity, haversineKm, locatePlace, type GeoHit } from './geo';
import { getWeather } from './weather';

const LOCAL_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    days: {
      type: 'array',
      items: {
        type: 'object',
        properties: { places: { type: 'array', items: { type: 'string' } } },
        required: ['places'],
        additionalProperties: false,
      },
    },
  },
  required: ['days'],
  additionalProperties: false,
} as const;

const LocalPlanSchema = z.object({
  days: z.array(z.object({ places: z.array(z.string().trim().min(2).max(120)).min(3).max(3) })),
});

type LocalPlan = z.infer<typeof LocalPlanSchema>;
type Emit = (event: AgentEvent) => void;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function event(emit: Emit, id: string, label: string, state: 'running' | 'done' | 'error', detail?: string) {
  emit({ type: 'tool', id, name: 'local_india_planner', label, state, detail });
}

async function generatePlaces(brief: Brief, count: number, signal?: AbortSignal): Promise<LocalPlan> {
  const days = count;
  const current = brief.notes ? `Traveller notes: ${brief.notes}` : '';
  const userPrompt = [
    `Plan a compact ${days}-day visit to ${brief.destination}, India.`,
    `Return exactly ${days} day objects. Each day must contain exactly 3 distinct real, named attractions or public places in or very near the destination.`,
    'Pick recognizable places that are likely to have an OpenStreetMap location. Do not invent venues, addresses, prices, opening hours, or travel facts.',
    `Interests: ${brief.interests.join(', ') || 'general sightseeing'}. Pace: ${brief.pace}.`,
    `Constraints: ${brief.constraints.join(', ') || 'none'}.`,
    current,
    'Return only the JSON object required by the response schema.',
  ].filter(Boolean).join('\n');

  const response = await fetch(`${env.ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: env.model,
      messages: [
        { role: 'system', content: 'You select a few real attractions for simple India itineraries. Output only concise structured data. Never make up a place.' },
        { role: 'user', content: userPrompt },
      ],
      stream: false,
      think: false,
      format: LOCAL_PLAN_SCHEMA,
      options: { temperature: 0.1, num_ctx: 4096, num_predict: Math.min(1200, days * 90) },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Local model request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload: unknown = await response.json();
  const content =
    typeof payload === 'object' && payload !== null &&
    'message' in payload && typeof payload.message === 'object' && payload.message !== null &&
    'content' in payload.message && typeof payload.message.content === 'string'
      ? payload.message.content
      : null;
  if (!content) throw new Error('The local model returned no itinerary data. Please try again.');

  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new Error('The local model did not return valid structured itinerary data. Please try again.');
  }
  const result = LocalPlanSchema.safeParse(decoded);
  if (!result.success || result.data.days.length !== days) {
    throw new Error(`The local model returned an incomplete plan. Expected ${days} days with three place suggestions each; please try again.`);
  }
  return result.data;
}

async function findIndianCity(destination: string): Promise<GeoHit> {
  const direct = await geocodeCity(destination, 5);
  const indiaMatches = direct.filter((hit) => hit.country?.toLowerCase() === 'india');
  if (indiaMatches[0]) return indiaMatches[0];

  const qualified = await geocodeCity(`${destination}, India`, 5);
  const match = qualified.find((hit) => hit.country?.toLowerCase() === 'india');
  if (match) return match;

  throw new Error('Local planning supports Indian cities only. Enter an Indian city, such as Jaipur or Mumbai.');
}

async function resolveDayPlaces(names: string[], city: GeoHit, cityName: string, signal?: AbortSignal) {
  const resolved: { requestedName: string; hit: GeoHit }[] = [];
  for (const name of names) {
    if (signal?.aborted) throw new Error('Cancelled');
    const hit = await locatePlace(name, cityName, city);
    if (!hit || (hit.country && hit.country.toLowerCase() !== 'india') || haversineKm(city, hit) > 60) continue;
    if (resolved.some(({ hit: prior }) => haversineKm(prior, hit) < 0.1)) continue;
    resolved.push({ requestedName: name, hit });
    if (resolved.length === 2) break;
  }
  return resolved;
}

export async function runLocalIndiaPlanner(
  brief: Brief,
  emit: Emit,
  signal?: AbortSignal,
  current?: Itinerary,
  instruction?: string,
): Promise<Itinerary> {
  const count = tripDays(brief.startDate, brief.endDate);
  emit({ type: 'status', message: current ? 'Simplifying your itinerary' : 'Planning a compact India itinerary' });

  const geoId = 'local-destination';
  event(emit, geoId, 'Checking the Indian destination', 'running');
  let city: GeoHit;
  try {
    city = await findIndianCity(brief.destination);
    event(emit, geoId, 'Indian destination confirmed', 'done', `${city.name}${city.region ? `, ${city.region}` : ''}`);
  } catch (error) {
    event(emit, geoId, 'Checking the Indian destination', 'error', messageOf(error));
    throw error;
  }
  if (signal?.aborted) throw new Error('Cancelled');

  const modelId = 'local-suggestions';
  event(emit, modelId, 'Choosing a few places per day', 'running');
  let suggestions: LocalPlan;
  try {
    const notes = [
      brief.notes,
      instruction ? `Requested change: ${instruction}` : '',
      current ? `Current stops by day: ${current.days.map((day) => `${day.day}: ${day.items.map((item) => item.title).join(', ')}`).join('; ')}` : '',
    ].filter(Boolean);
    suggestions = await generatePlaces({ ...brief, notes: notes.join('\n') }, count, signal);
    event(emit, modelId, 'Place suggestions ready', 'done', 'Three short suggestions per day; unverified names are discarded.');
  } catch (error) {
    event(emit, modelId, 'Choosing a few places per day', 'error', messageOf(error));
    throw error;
  }

  const weatherId = 'local-weather';
  event(emit, weatherId, 'Checking the weather', 'running');
  let weather: Awaited<ReturnType<typeof getWeather>> | null = null;
  let weatherCaveat: string | null = null;
  try {
    weather = await getWeather(city.lat, city.lng, brief.startDate, brief.endDate);
    event(emit, weatherId, 'Weather checked', 'done', weather.note);
  } catch (error) {
    weatherCaveat = `Weather could not be checked: ${messageOf(error)}`;
    event(emit, weatherId, 'Checking the weather', 'error', weatherCaveat);
  }

  const days: Itinerary['days'] = [];
  for (let dayIndex = 0; dayIndex < count; dayIndex++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const placeId = `local-places-${dayIndex + 1}`;
    event(emit, placeId, `Checking map pins for day ${dayIndex + 1}`, 'running');
    const places = await resolveDayPlaces(suggestions.days[dayIndex].places, city, city.name, signal);
    if (places.length < 2) {
      const detail = `Only ${places.length} of 3 suggested places could be verified within 60 km of ${city.name}. Map providers may be temporarily unavailable or rate-limited; try again later or use a more specific city.`;
      event(emit, placeId, `Checking map pins for day ${dayIndex + 1}`, 'error', detail);
      throw new Error(detail);
    }

    const date = addDays(brief.startDate, dayIndex);
    const items: Itinerary['days'][number]['items'] = places.map(({ hit }, index) => {
      const item = {
        id: `local-d${dayIndex + 1}-s${index + 1}`,
        time: index === 0 ? '09:00' : '13:30',
        durationMin: 150,
        title: hit.name,
        category: 'sight',
        description: `Visit this mapped place in ${city.name}. Check current access and timings before you go.`,
        place: { name: hit.name, lat: hit.lat, lng: hit.lng },
        tip: 'Confirm opening hours, entry rules, and local travel before setting out.',
      } as const;
      if (index === 0) return item;
      const travel = estimateTravel(places[index - 1].hit, hit);
      return {
        ...item,
        travelFromPrevious: {
          mode: 'transit' as const,
          minutes: travel.transitMin,
          km: travel.roadKm,
        },
      };
    });

    const forecast = weather?.days.find((day) => day.date === date);
    days.push({
      day: dayIndex + 1,
      date,
      theme: `${city.name} highlights`,
      summary: `Two map-checked places, with time to travel between them.`,
      items,
      ...(forecast ? {
        weather: {
          summary: forecast.conditions ?? 'Conditions unavailable',
          ...(forecast.highC != null ? { highC: forecast.highC } : {}),
          ...(forecast.lowC != null ? { lowC: forecast.lowC } : {}),
          ...(forecast.rainChancePct != null ? { rainChancePct: forecast.rainChancePct } : {}),
          basis: weather?.basis,
        },
      } : {}),
    });
    event(emit, placeId, `Map pins checked for day ${dayIndex + 1}`, 'done');
  }

  const parsed = ItinerarySchema.safeParse({
    title: `${city.name}, India: ${count}-day itinerary`,
    summary: `A compact India itinerary with two map-checked places each day in ${city.name}.`,
    destination: { name: city.name, country: 'India', lat: city.lat, lng: city.lng },
    currency: brief.currency,
    days,
    budget: {
      totalEstimate: 0,
      breakdown: [],
      notes: `Prices are not estimated in local mode. ${brief.currency} 0 means unknown, not free; verify admission, food, and transport costs.`,
    },
    packingTips: [],
    practicalTips: ['Check each venue’s opening hours and entry rules for your dates.', 'Use current local transport information; travel times are rough estimates.'],
    caveats: [
      'Stop coordinates are matched through OpenStreetMap, Nominatim, or Wikimedia. Opening hours, entry prices, and availability are not verified.',
      ...(weather?.basis === 'last_year' ? [weather.note] : []),
      ...(weatherCaveat ? [weatherCaveat] : []),
    ],
  });
  if (!parsed.success) {
    throw new Error(`The generated itinerary failed validation: ${parsed.error.issues.slice(0, 4).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const problems = checkItineraryAgainstBrief(parsed.data, brief);
  if (problems.length) throw new Error(`The generated itinerary failed checks: ${problems.join('; ')}`);
  return parsed.data;
}
