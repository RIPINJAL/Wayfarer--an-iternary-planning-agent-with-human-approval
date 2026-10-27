import { describe, expect, it } from 'vitest';
import { BriefSchema, checkItineraryAgainstBrief, ItinerarySchema, tripDays, addDays } from '@/lib/schemas';
import { brief, itinerary } from './fixtures';

describe('BriefSchema', () => {
  const base = { destination: 'Kyoto', startDate: '2027-03-01', endDate: '2027-03-05' };
  it('applies defaults', () => {
    const r = BriefSchema.parse(base);
    expect(r.adults).toBe(2);
    expect(r.currency).toBe('USD');
    expect(r.pace).toBe('balanced');
  });
  it('rejects end before start and trips over 14 days', () => {
    expect(BriefSchema.safeParse({ ...base, endDate: '2027-02-27' }).success).toBe(false);
    expect(BriefSchema.safeParse({ ...base, endDate: '2027-04-01' }).success).toBe(false);
  });
  it('normalises currency code', () => {
    expect(BriefSchema.parse({ ...base, currency: 'eur' }).currency).toBe('EUR');
  });
});

describe('dates', () => {
  it('counts inclusive days and adds days across month ends', () => {
    expect(tripDays('2027-01-30', '2027-02-02')).toBe(4);
    expect(addDays('2027-02-27', 2)).toBe('2027-03-01');
  });
});

describe('checkItineraryAgainstBrief', () => {
  it('accepts a matching plan', () => {
    expect(ItinerarySchema.safeParse(itinerary).success).toBe(true);
    expect(checkItineraryAgainstBrief(itinerary, brief)).toEqual([]);
  });
  it('flags wrong day count, wrong date, and wrong currency', () => {
    const bad = { ...itinerary, currency: 'USD', days: [{ ...itinerary.days[0], date: '2027-04-09' }] };
    const problems = checkItineraryAgainstBrief(bad, brief).join(' ');
    expect(problems).toContain('2 days');
    expect(problems).toContain('2027-04-10');
    expect(problems).toContain('EUR');
  });
  it('flags missing coordinates', () => {
    const noCoords = { ...itinerary, days: itinerary.days.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i, place: { name: 'x' } })) })) };
    expect(checkItineraryAgainstBrief(noCoords, brief).join(' ')).toContain('locate_places');
  });
  it('flags duplicate ids and out-of-order times', () => {
    const d = structuredClone(itinerary);
    d.days[0].items[1].id = d.days[0].items[0].id;
    d.days[0].items[1].time = '08:00';
    const p = checkItineraryAgainstBrief(d, brief).join(' ');
    expect(p).toContain('Duplicate');
    expect(p).toContain('chronological');
  });
});
