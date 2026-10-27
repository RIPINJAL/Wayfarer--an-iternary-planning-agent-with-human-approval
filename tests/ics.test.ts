import { describe, expect, it } from 'vitest';
import { tripToIcs } from '@/lib/ics';
import { trip } from './fixtures';

describe('tripToIcs', () => {
  const ics = tripToIcs(trip);
  it('produces a well-formed calendar with one event per stop', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
  it('uses floating local times and computes the end from duration', () => {
    expect(ics).toContain('DTSTART:20270410T090000');
    expect(ics).toContain('DTEND:20270410T100000');
  });
  it('escapes commas and semicolons and uses CRLF', () => {
    expect(ics).toContain('A place\\; with\\, punctuation.');
    expect(ics).toContain('\r\n');
  });
  it('folds long lines at 75 octets', () => {
    const long = structuredClone(trip);
    long.itinerary.days[0].items[0].description = 'é'.repeat(200);
    for (const line of tripToIcs(long).split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});
