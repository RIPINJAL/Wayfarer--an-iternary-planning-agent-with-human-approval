import 'server-only';
import { z } from 'zod';
import { convertCurrency } from './currency';
import { estimateTravel, geocodeCity, locatePlace } from './geo';
import { getWeather } from './weather';
import { ItinerarySchema, type Brief } from '../schemas';

export interface ToolContext {
  brief: Brief;
  /** Destination centre, set once geocode_place has run; used to bias and sanity-check venue lookups. */
  near?: { lat: number; lng: number };
}

interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** Short human label shown in the UI while/after the tool runs. */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

function def<S extends z.ZodType>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

const Point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const geocodePlace = def({
  name: 'geocode_place',
  description:
    'Look up a city, region or country and get its coordinates, timezone and country. Call this first for the destination (and any other city on the route).',
  schema: z.object({
    query: z.string().min(2).max(120).describe('City or area, e.g. "Kyoto" or "Lisbon, Portugal"'),
    count: z.number().int().min(1).max(5).optional(),
  }),
  label: (i) => `Locating ${i.query}`,
  async run(i, ctx) {
    const hits = await geocodeCity(i.query, i.count ?? 3);
    if (hits[0] && !ctx.near) ctx.near = { lat: hits[0].lat, lng: hits[0].lng };
    if (!hits.length) return { error: 'No match. Try a more common spelling or add the country.' };
    return { results: hits };
  },
});

export const locatePlaces = def({
  name: 'locate_places',
  description:
    'Resolve up to 15 specific venues or landmarks (museums, restaurants, viewpoints, stations) to coordinates so they can be mapped and travel times can be estimated. Always use this for stops you plan to include. Places that cannot be found are returned as null: replace them or leave coordinates out.',
  schema: z.object({
    city: z.string().min(2).max(120).describe('City the places are in, e.g. "Lisbon"'),
    places: z.array(z.string().min(2).max(120)).min(1).max(15),
  }),
  label: (i) => `Pinning ${i.places.length} places in ${i.city}`,
  async run(i, ctx) {
    const results = await Promise.all(
      i.places.map(async (name) => {
        const hit = await locatePlace(name, i.city, ctx.near);
        return hit ? { name, lat: Number(hit.lat.toFixed(5)), lng: Number(hit.lng.toFixed(5)) } : { name, lat: null, lng: null };
      }),
    );
    return { results };
  },
});

export const weatherTool = def({
  name: 'get_weather',
  description:
    'Daily weather for the trip dates at a location. Uses a real forecast when the dates are within ~15 days, otherwise observed weather from the same dates in a previous year (labelled as such).',
  schema: z.object({
    lat: z.number(),
    lng: z.number(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  label: () => 'Checking the weather',
  run: (i) => getWeather(i.lat, i.lng, i.startDate, i.endDate),
});

export const currencyTool = def({
  name: 'convert_currency',
  description: 'Convert an amount between currencies using current reference exchange rates.',
  schema: z.object({
    amount: z.number().positive(),
    from: z.string().length(3),
    to: z.string().length(3),
  }),
  label: (i) => `Converting ${i.from.toUpperCase()} to ${i.to.toUpperCase()}`,
  run: (i) => convertCurrency(i.amount, i.from, i.to),
});

export const travelTool = def({
  name: 'estimate_travel',
  description:
    'Estimate walking, cycling, public transport and driving time between two coordinates. Use it to check that consecutive stops are realistic.',
  schema: z.object({ from: Point, to: Point }),
  label: () => 'Checking travel times',
  run: async (i) => estimateTravel(i.from, i.to),
});

export const CLIENT_TOOLS = [geocodePlace, locatePlaces, weatherTool, currencyTool, travelTool] as const;

export const SUBMIT_TOOL_NAME = 'submit_itinerary';
export const SUBMIT_DESCRIPTION =
  'Submit the final itinerary. This is the only way to deliver the plan to the traveller. It is validated: if validation fails you will get a list of problems, fix them and call it again. Include every day of the trip.';

export function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export const submitInputSchema = jsonSchemaOf(ItinerarySchema);

export function findClientTool(name: string) {
  return CLIENT_TOOLS.find((t) => t.name === name);
}
