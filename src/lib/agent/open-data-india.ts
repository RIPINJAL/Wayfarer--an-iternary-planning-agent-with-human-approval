import 'server-only';
import { addDays, checkItineraryAgainstBrief, ItinerarySchema, tripDays, type AgentEvent, type Brief, type Itinerary } from '../schemas';
import { estimateTravel, findNearbyAttractions, geocodeCity, haversineKm, type GeoHit, type NearbyAttraction } from './geo';
import { getWeather } from './weather';

type Emit = (event: AgentEvent) => void;

function emitStep(emit: Emit, id: string, label: string, state: 'running' | 'done' | 'error', detail?: string) {
  emit({ type: 'tool', id, name: 'india_open_data', label, state, detail });
}

async function findIndianCity(destination: string): Promise<GeoHit> {
  const direct = await geocodeCity(destination, 5);
  const match = direct.find((hit) => hit.country?.toLowerCase() === 'india');
  if (match) return match;
  const qualified = await geocodeCity(`${destination}, India`, 5);
  const indiaMatch = qualified.find((hit) => hit.country?.toLowerCase() === 'india');
  if (indiaMatch) return indiaMatch;
  throw new Error('The free public planner supports Indian cities only. Enter a city such as Jaipur, Chennai, or Mumbai.');
}

function rankAttractions(places: NearbyAttraction[], brief: Brief): NearbyAttraction[] {
  const interests = brief.interests.join(' ').toLowerCase();
  return [...places].sort((a, b) => {
    const score = (place: NearbyAttraction) =>
      (place.kind === 'museum' && interests.includes('museum') ? 4 : 0) +
      (place.kind === 'historic' && interests.includes('history') ? 4 : 0) +
      (place.kind === 'park' && (interests.includes('nature') || interests.includes('hiking')) ? 4 : 0) +
      (place.kind === 'worship' && interests.includes('architecture') ? 2 : 0) +
      (place.kind === 'viewpoint' && interests.includes('photography') ? 2 : 0);
    return score(b) - score(a);
  });
}

export async function runOpenDataIndiaPlanner(brief: Brief, emit: Emit, signal?: AbortSignal): Promise<Itinerary> {
  const dayCount = tripDays(brief.startDate, brief.endDate);
  emit({ type: 'status', message: 'Finding map-listed attractions in India' });
  if (signal?.aborted) throw new Error('Cancelled');

  emitStep(emit, 'india-destination', 'Checking Indian destination', 'running');
  let city: GeoHit;
  try {
    city = await findIndianCity(brief.destination);
    emitStep(emit, 'india-destination', 'Indian destination confirmed', 'done', `${city.name}${city.region ? `, ${city.region}` : ''}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emitStep(emit, 'india-destination', 'Checking Indian destination', 'error', detail);
    throw error;
  }
  if (signal?.aborted) throw new Error('Cancelled');

  emitStep(emit, 'india-attractions', 'Finding nearby mapped attractions', 'running');
  let attractions: NearbyAttraction[];
  try {
    attractions = rankAttractions(await findNearbyAttractions(city), brief);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    emitStep(emit, 'india-attractions', 'Finding nearby mapped attractions', 'error', detail);
    throw new Error(`Could not load mapped attractions for ${city.name}. Try again later. ${detail}`);
  }
  if (attractions.length < dayCount * 2) {
    const detail = `OpenStreetMap has only ${attractions.length} distinct nearby attractions for ${city.name}; ${dayCount * 2} are needed. Try a shorter trip or another Indian city.`;
    emitStep(emit, 'india-attractions', 'Not enough mapped attractions', 'error', detail);
    throw new Error(detail);
  }
  emitStep(emit, 'india-attractions', 'Nearby attractions found', 'done', `${attractions.length} named map features; selecting ${dayCount * 2}.`);

  if (signal?.aborted) throw new Error('Cancelled');
  emitStep(emit, 'india-weather', 'Checking the weather', 'running');
  let weather: Awaited<ReturnType<typeof getWeather>> | null = null;
  let weatherCaveat: string | null = null;
  try {
    weather = await getWeather(city.lat, city.lng, brief.startDate, brief.endDate);
    emitStep(emit, 'india-weather', 'Weather checked', 'done', weather.note);
  } catch (error) {
    weatherCaveat = `Weather could not be checked: ${error instanceof Error ? error.message : String(error)}`;
    emitStep(emit, 'india-weather', 'Weather unavailable', 'error', weatherCaveat);
  }

  const days: Itinerary['days'] = [];
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const selected = attractions.slice(dayIndex * 2, dayIndex * 2 + 2);
    const items: Itinerary['days'][number]['items'] = selected.map((place, index) => {
      const item = {
        id: `open-data-d${dayIndex + 1}-s${index + 1}`,
        time: index === 0 ? '09:00' : '13:30',
        durationMin: 120,
        title: place.name,
        category: place.kind === 'museum' || place.kind === 'historic' || place.kind === 'viewpoint' ? 'sight' : 'activity',
        description: `Listed as a ${place.kind} in OpenStreetMap. Confirm visitor access and opening hours before travelling.`,
        place: { name: place.name, lat: place.lat, lng: place.lng },
        tip: 'Check current local access, opening hours, and travel information before setting out.',
      } as const;
      if (index === 0) return item;
      const travel = estimateTravel(selected[0], place);
      return { ...item, travelFromPrevious: { mode: 'transit' as const, minutes: travel.transitMin, km: travel.roadKm } };
    });
    const date = addDays(brief.startDate, dayIndex);
    const forecast = weather?.days.find((day) => day.date === date);
    days.push({
      day: dayIndex + 1,
      date,
      theme: `${city.name} mapped highlights`,
      summary: 'A simple route using two named attractions listed in OpenStreetMap.',
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
  }

  const itinerary = ItinerarySchema.safeParse({
    title: `${city.name}, India: ${dayCount}-day map itinerary`,
    summary: `A no-AI, no-model-fee itinerary built from nearby OpenStreetMap attractions in ${city.name}.`,
    destination: { name: city.name, country: 'India', lat: city.lat, lng: city.lng },
    currency: brief.currency,
    days,
    budget: {
      totalEstimate: 0,
      breakdown: [],
      notes: `Prices are not estimated. ${brief.currency} 0 means unknown, not free; verify admission, food, and transport costs.`,
    },
    packingTips: [],
    practicalTips: ['Confirm each venue is open to visitors on your dates.', 'Travel times are rough estimates, not live routing.'],
    caveats: [
      'Attractions use OpenStreetMap contributor data; listings may be incomplete or out of date.',
      'No AI model is used. Itinerary selection is simple and does not interpret notes or constraints.',
      ...(weather?.basis === 'last_year' ? [weather.note] : []),
      ...(weatherCaveat ? [weatherCaveat] : []),
    ],
  });
  if (!itinerary.success) {
    throw new Error(`The mapped itinerary failed validation: ${itinerary.error.issues.slice(0, 4).map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  const problems = checkItineraryAgainstBrief(itinerary.data, brief);
  if (problems.length) throw new Error(`The mapped itinerary failed checks: ${problems.join('; ')}`);
  return itinerary.data;
}
