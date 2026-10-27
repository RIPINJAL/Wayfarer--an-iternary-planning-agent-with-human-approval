const d = (s: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });

/** "23 Nov to 26 Nov 2026" (deterministic across server and browser). */
export function fmtRange(start: string, end: string): string {
  return `${d(start, { day: 'numeric', month: 'short' })} to ${d(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
