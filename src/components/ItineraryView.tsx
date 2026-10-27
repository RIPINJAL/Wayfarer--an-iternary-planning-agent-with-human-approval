'use client';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { Category, Day, Itinerary } from '@/lib/schemas';

const TripMap = dynamic(() => import('./TripMap'), { ssr: false, loading: () => <div className="map" aria-hidden="true" /> });

const CAT: Record<Category, { label: string; color: string }> = {
  sight: { label: 'Sight', color: 'var(--c-sight)' },
  food: { label: 'Food', color: 'var(--c-food)' },
  activity: { label: 'Activity', color: 'var(--c-activity)' },
  transport: { label: 'Getting around', color: 'var(--c-transport)' },
  lodging: { label: 'Stay', color: 'var(--c-lodging)' },
  rest: { label: 'Break', color: 'var(--c-rest)' },
  shopping: { label: 'Shopping', color: 'var(--c-shopping)' },
};

const fmtDate = (d: string, long = false) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function money(n: number, cur: string) {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n); }
  catch { return `${Math.round(n)} ${cur}`; }
}

const endTime = (t: string, min: number) => {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const basisText = { forecast: 'forecast', last_year: 'typical, from last year', estimate: 'estimate' } as const;

export default function ItineraryView({ itinerary: it }: { itinerary: Itinerary }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const day: Day = it.days[Math.min(dayIdx, it.days.length - 1)];
  const cur = it.currency;

  const stops = useMemo(() => day.items.map((item, i) => ({ item, n: i + 1 })), [day]);
  const center = useMemo<[number, number]>(() => [it.destination.lat, it.destination.lng], [it.destination]);
  const dayCost = day.items.reduce((s, x) => s + (x.estCost ?? 0), 0);
  const maxBar = Math.max(1, ...it.budget.breakdown.map((b) => b.amount));

  function select(id: string) {
    setHighlight(id);
    document.getElementById(`item-${id}`)?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  return (
    <div>
      <div className="layout">
        <div>
          <div className="tabs" role="tablist" aria-label="Days">
            {it.days.map((d, i) => (
              <button key={d.day} role="tab" id={`tab-${i}`} aria-selected={i === dayIdx} aria-controls="daypanel" className="tab" onClick={() => { setDayIdx(i); setHighlight(null); }}>
                Day {d.day}
                <small>{fmtDate(d.date)}</small>
              </button>
            ))}
          </div>

          <section id="daypanel" role="tabpanel" aria-labelledby={`tab-${dayIdx}`} className="day-print">
            <div className="day-head">
              <h2>Day {day.day}: {day.theme}</h2>
              <p className="muted">{fmtDate(day.date, true)}. {day.summary}</p>
              {day.weather && (
                <p className="weather">
                  <span>{day.weather.summary}</span>
                  {day.weather.highC != null && <span>High {Math.round(day.weather.highC)}°C{day.weather.lowC != null && `, low ${Math.round(day.weather.lowC)}°C`}</span>}
                  {day.weather.rainChancePct != null && <span>Rain {Math.round(day.weather.rainChancePct)}%</span>}
                  {day.weather.basis && <span>({basisText[day.weather.basis]})</span>}
                </p>
              )}
            </div>

            <ol className="timeline">
              {day.items.map((x, i) => {
                const c = CAT[x.category];
                return (
                  <li key={x.id}>
                    {x.travelFromPrevious && i > 0 && (
                      <div className="leg">{x.travelFromPrevious.mode} · {Math.round(x.travelFromPrevious.minutes)} min{x.travelFromPrevious.km != null && ` · ${x.travelFromPrevious.km.toFixed(1)} km`}</div>
                    )}
                    <div className="entry" id={`item-${x.id}`}>
                      <div className="when">{x.time}<small>to {endTime(x.time, x.durationMin)}</small></div>
                      <button type="button" className={`card${highlight === x.id ? ' active' : ''}`} style={{ ['--cat' as string]: c.color }} onClick={() => setHighlight(x.id)} aria-pressed={highlight === x.id}>
                        <span className="row">
                          <h3><span className="num" aria-hidden="true">{i + 1}</span>{x.title}{x.bookingNeeded && <span className="tag">Book ahead</span>}</h3>
                          {x.estCost != null && x.estCost > 0 && <span className="cost">{money(x.estCost, cur)}</span>}
                        </span>
                        <span className="cat">{c.label}</span>
                        <p>{x.description}</p>
                        {x.place && <span className="loc">{x.place.name}{x.place.address ? `, ${x.place.address}` : ''}</span>}
                        {x.tip && <span className="tip">{x.tip}</span>}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {dayCost > 0 && <p className="muted" style={{ marginTop: 14, textAlign: 'right' }}>Estimated spend this day: <strong>{money(dayCost, cur)}</strong></p>}
          </section>
        </div>

        <div className="mapcol">
          <TripMap stops={stops} center={center} highlightId={highlight} onSelect={select} label={`Map of stops for day ${day.day}`} />
        </div>
      </div>

      <div className="extras">
        <section className="panel wide">
          <h2>Budget</h2>
          <div className="total"><span className="muted">Estimated total for the group</span><strong>{money(it.budget.totalEstimate, cur)}</strong></div>
          <div className="bars">
            {it.budget.breakdown.map((b) => (
              <div className="bar" key={b.label}>
                <span>{b.label}</span>
                <span className="track"><i style={{ width: `${Math.max(2, (b.amount / maxBar) * 100)}%` }} /></span>
                <span>{money(b.amount, cur)}</span>
              </div>
            ))}
          </div>
          {it.budget.notes && <p className="muted" style={{ marginTop: 12 }}>{it.budget.notes}</p>}
        </section>
        {it.practicalTips.length > 0 && <section className="panel"><h2>Good to know</h2><ul>{it.practicalTips.map((t) => <li key={t}>{t}</li>)}</ul></section>}
        {it.packingTips.length > 0 && <section className="panel"><h2>Pack</h2><ul>{it.packingTips.map((t) => <li key={t}>{t}</li>)}</ul></section>}
        {it.caveats.length > 0 && (
          <section className="panel caveats wide">
            <h2>Check before you go</h2>
            <ul>{it.caveats.map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="muted" style={{ marginTop: 10 }}>Opening hours, prices and booking rules change. Confirm anything that matters with the venue.</p>
          </section>
        )}
      </div>
    </div>
  );
}
