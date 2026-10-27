import type { TripRecord } from './schemas';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 requires lines <= 75 octets; fold on character boundaries without splitting multi-byte characters. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function localStamp(date: string, time: string, addMin = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + addMin));
  return dt.toISOString().replace(/[-:]/g, '').slice(0, 15);
}

/** Events use "floating" local time, so they show at the right clock time wherever the calendar is opened. */
export function tripToIcs(trip: TripRecord): string {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Wayfarer//Trip Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.itinerary.title)}`];
  for (const day of trip.itinerary.days) {
    for (const it of day.items) {
      const loc = [it.place?.name, it.place?.address].filter(Boolean).join(', ');
      const desc = [it.description, it.tip ? `Tip: ${it.tip}` : '', it.estCost ? `Est. cost: ${it.estCost} ${trip.itinerary.currency}` : ''].filter(Boolean).join('\n');
      lines.push(
        'BEGIN:VEVENT',
        `UID:${trip.id}-${it.id}@wayfarer`,
        `DTSTAMP:${now}`,
        `DTSTART:${localStamp(day.date, it.time)}`,
        `DTEND:${localStamp(day.date, it.time, it.durationMin)}`,
        `SUMMARY:${esc(it.title)}`,
        `DESCRIPTION:${esc(desc)}`,
        ...(loc ? [`LOCATION:${esc(loc)}`] : []),
        ...(it.place?.lat != null && it.place?.lng != null ? [`GEO:${it.place.lat};${it.place.lng}`] : []),
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
