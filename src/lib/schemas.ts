import { z } from 'zod';

export const MAX_TRIP_DAYS = 14;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const INTERESTS = [
  'Food & drink', 'History', 'Art & museums', 'Nature & hiking', 'Beaches',
  'Nightlife', 'Architecture', 'Shopping', 'Markets', 'Photography',
  'Wellness', 'Adventure sports', 'Family-friendly', 'Hidden gems',
] as const;

export const CONSTRAINTS = [
  'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free',
  'Step-free access', 'Travelling with young kids', 'No car',
] as const;

export const BriefSchema = z
  .object({
    destination: z.string().trim().min(2, 'Tell us where you are going').max(120),
    origin: z.string().trim().max(120).optional().default(''),
    startDate: isoDate,
    endDate: isoDate,
    adults: z.coerce.number().int().min(1).max(12).default(2),
    children: z.coerce.number().int().min(0).max(8).default(0),
    budgetLevel: z.enum(['budget', 'moderate', 'comfortable', 'luxury']).default('moderate'),
    budgetAmount: z.coerce.number().positive().max(10_000_000).optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code').default('INR'),
    pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
    interests: z.array(z.string().trim().min(1).max(40)).max(14).default([]),
    constraints: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    notes: z.string().trim().max(1200).optional().default(''),
  })
  .superRefine((b, ctx) => {
    const days = tripDays(b.startDate, b.endDate);
    if (!Number.isFinite(days) || days < 1) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date' });
    } else if (days > MAX_TRIP_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['endDate'], message: `Trips are limited to ${MAX_TRIP_DAYS} days` });
    }
  });

export type Brief = z.infer<typeof BriefSchema>;

export function tripDays(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  return Math.round((e - s) / 86_400_000) + 1;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const CATEGORIES = ['sight', 'food', 'activity', 'transport', 'lodging', 'rest', 'shopping'] as const;
export type Category = (typeof CATEGORIES)[number];

const num = z.coerce.number();

export const PlaceSchema = z.object({
  name: z.string().min(1).max(160),
  address: z.string().max(240).optional(),
  lat: num.min(-90).max(90).optional(),
  lng: num.min(-180).max(180).optional(),
});

export const ItemSchema = z.object({
  id: z.string().min(1).max(40),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be HH:MM (24h)'),
  durationMin: num.int().min(5).max(900),
  title: z.string().min(1).max(140),
  category: z.enum(CATEGORIES),
  description: z.string().min(1).max(700),
  place: PlaceSchema.optional(),
  estCost: num.min(0).optional().describe('Total estimated cost for the whole group, in the trip currency'),
  travelFromPrevious: z
    .object({
      mode: z.enum(['walk', 'transit', 'drive', 'bike', 'taxi', 'flight', 'train', 'ferry']),
      minutes: num.min(0).max(1440),
      km: num.min(0).max(20000).optional(),
    })
    .optional(),
  tip: z.string().max(300).optional(),
  bookingNeeded: z.boolean().optional(),
});

export const DaySchema = z.object({
  day: num.int().min(1).max(MAX_TRIP_DAYS),
  date: isoDate,
  theme: z.string().min(1).max(100),
  summary: z.string().min(1).max(400),
  weather: z
    .object({
      summary: z.string().max(160),
      highC: num.optional(),
      lowC: num.optional(),
      rainChancePct: num.min(0).max(100).optional(),
      basis: z.enum(['forecast', 'last_year', 'estimate']).optional(),
    })
    .optional(),
  items: z.array(ItemSchema).min(1).max(14),
});

export const ItinerarySchema = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(700),
  destination: z.object({
    name: z.string().min(1).max(120),
    country: z.string().max(80).optional(),
    lat: num.min(-90).max(90),
    lng: num.min(-180).max(180),
  }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  days: z.array(DaySchema).min(1).max(MAX_TRIP_DAYS),
  budget: z.object({
    totalEstimate: num.min(0),
    breakdown: z.array(z.object({ label: z.string().max(60), amount: num.min(0) })).max(10),
    notes: z.string().max(500).optional(),
  }),
  packingTips: z.array(z.string().max(200)).max(12).default([]),
  practicalTips: z.array(z.string().max(300)).max(12).default([]),
  caveats: z.array(z.string().max(300)).max(8).default([]),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;
export type Day = z.infer<typeof DaySchema>;
export type Item = z.infer<typeof ItemSchema>;

export interface TripRecord {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  brief: Brief;
  itinerary: Itinerary;
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TripSummary = Pick<TripRecord, 'id' | 'title' | 'destination' | 'startDate' | 'endDate' | 'updatedAt'>;

/** Events streamed from the agent to the browser. */
export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; id: string; name: string; label: string; state: 'running' | 'done' | 'error'; detail?: string }
  | { type: 'itinerary'; itinerary: Itinerary }
  | { type: 'saved'; tripId: string }
  | { type: 'error'; message: string }
  | { type: 'done' };

/** Cross-checks the model's plan against what the traveller asked for. Returns problems (empty = fine). */
export function checkItineraryAgainstBrief(it: Itinerary, brief: Brief): string[] {
  const problems: string[] = [];
  const n = tripDays(brief.startDate, brief.endDate);
  if (it.days.length !== n) problems.push(`The trip is ${n} days but you provided ${it.days.length}. Provide exactly ${n} days.`);
  it.days.forEach((d, i) => {
    const expected = addDays(brief.startDate, i);
    if (d.day !== i + 1) problems.push(`Day numbering must be sequential; day index ${i} has day=${d.day}.`);
    if (d.date !== expected) problems.push(`Day ${i + 1} must have date ${expected}, got ${d.date}.`);
    const times = d.items.map((x) => x.time);
    if ([...times].sort().join() !== times.join()) problems.push(`Day ${i + 1} items must be in chronological order.`);
  });
  const all = it.days.flatMap((d) => d.items);
  const sights = all.filter((x) => x.category !== 'transport' && x.category !== 'lodging');
  const located = sights.filter((x) => x.place?.lat != null && x.place?.lng != null).length;
  if (sights.length > 0 && located / sights.length < 0.7) {
    problems.push('Fewer than 70% of stops have coordinates. Call locate_places for the stops that are missing lat/lng, then resubmit.');
  }
  const ids = new Set<string>();
  for (const x of all) {
    if (ids.has(x.id)) problems.push(`Duplicate item id "${x.id}". Item ids must be unique across the whole itinerary.`);
    ids.add(x.id);
  }
  if (it.currency !== brief.currency) problems.push(`Currency must be ${brief.currency}.`);
  return problems.slice(0, 8);
}
