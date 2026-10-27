'use client';
import { useEffect, useMemo, useState } from 'react';
import { addDays, CONSTRAINTS, INTERESTS, MAX_TRIP_DAYS, tripDays } from '@/lib/schemas';
import type { FieldIssue } from '@/lib/useAgentStream';

const CURRENCIES = ['AED', 'AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'HKD', 'IDR', 'INR', 'JPY', 'KRW', 'MXN', 'NZD', 'SGD', 'THB', 'TRY', 'USD', 'ZAR'];

export default function PlannerForm({ onSubmit, disabled, issues }: { onSubmit: (brief: Record<string, unknown>) => void; disabled: boolean; issues: FieldIssue[] }) {
  const [destination, setDestination] = useState('');
  const [origin, setOrigin] = useState('');
  const [startDate, setStart] = useState('');
  const [endDate, setEnd] = useState('');
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [budgetLevel, setLevel] = useState('moderate');
  const [budgetAmount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [pace, setPace] = useState('balanced');
  const [interests, setInterests] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const s = addDays(new Date().toISOString().slice(0, 10), 30);
    setStart(s);
    setEnd(addDays(s, 3));
  }, []);

  const days = useMemo(() => (startDate && endDate ? tripDays(startDate, endDate) : 0), [startDate, endDate]);
  const err = (path: string) => issues.find((i) => i.path === path)?.message;
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <form
      className="panel form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ destination, origin, startDate, endDate, adults, children, budgetLevel, budgetAmount: budgetAmount ? Number(budgetAmount) : undefined, currency, pace, interests, constraints, notes });
      }}
    >
      <div className="field">
        <label htmlFor="dest">Where are you going?</label>
        <input id="dest" type="text" required maxLength={120} placeholder="Lisbon, Portugal" value={destination} onChange={(e) => setDestination(e.target.value)} autoComplete="off" aria-describedby={err('destination') ? 'dest-err' : undefined} />
        {err('destination') && <span id="dest-err" className="err">{err('destination')}</span>}
      </div>
      <div className="field">
        <label htmlFor="origin">Starting from <span className="hint">(optional, helps with arrival and departure days)</span></label>
        <input id="origin" type="text" maxLength={120} placeholder="Mumbai" value={origin} onChange={(e) => setOrigin(e.target.value)} autoComplete="off" />
      </div>

      <div className="field half">
        <label htmlFor="start">First day</label>
        <input id="start" type="date" required value={startDate} onChange={(e) => { setStart(e.target.value); if (endDate < e.target.value) setEnd(e.target.value); }} />
        {err('startDate') && <span className="err">{err('startDate')}</span>}
      </div>
      <div className="field half">
        <label htmlFor="end">Last day {days > 0 && <span className="hint">({days} day{days === 1 ? '' : 's'}, max {MAX_TRIP_DAYS})</span>}</label>
        <input id="end" type="date" required min={startDate} value={endDate} onChange={(e) => setEnd(e.target.value)} />
        {(err('endDate') || days > MAX_TRIP_DAYS) && <span className="err">{err('endDate') ?? `Trips are limited to ${MAX_TRIP_DAYS} days`}</span>}
      </div>

      <div className="field half">
        <label htmlFor="adults">Adults</label>
        <input id="adults" type="number" min={1} max={12} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
      </div>
      <div className="field half">
        <label htmlFor="kids">Children</label>
        <input id="kids" type="number" min={0} max={8} value={children} onChange={(e) => setChildren(Number(e.target.value))} />
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend" style={{ padding: 0, marginBottom: 6 }}>Budget style</legend>
        <div className="seg">
          {([['budget', 'Budget'], ['moderate', 'Moderate'], ['comfortable', 'Comfortable'], ['luxury', 'Luxury']] as const).map(([v, l]) => (
            <label key={v}><input type="radio" name="level" value={v} checked={budgetLevel === v} onChange={() => setLevel(v)} /><span>{l}</span></label>
          ))}
        </div>
      </fieldset>
      <div className="field half">
        <label htmlFor="amount">Total budget <span className="hint">(optional)</span></label>
        <input id="amount" type="number" min={0} inputMode="numeric" placeholder="e.g. 2500" value={budgetAmount} onChange={(e) => setAmount(e.target.value)} />
        {err('budgetAmount') && <span className="err">{err('budgetAmount')}</span>}
      </div>
      <div className="field half">
        <label htmlFor="cur">Currency</label>
        <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend" style={{ padding: 0, marginBottom: 6 }}>Pace</legend>
        <div className="seg">
          {([['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['packed', 'Packed']] as const).map(([v, l]) => (
            <label key={v}><input type="radio" name="pace" value={v} checked={pace === v} onChange={() => setPace(v)} /><span>{l}</span></label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend" style={{ padding: 0, marginBottom: 6 }}>What do you enjoy?</legend>
        <div className="chips">
          {INTERESTS.map((i) => (
            <label className="chip" key={i}><input type="checkbox" checked={interests.includes(i)} onChange={() => toggle(interests, setInterests, i)} /><span>{i}</span></label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="legend" style={{ padding: 0, marginBottom: 6 }}>Anything we should plan around?</legend>
        <div className="chips">
          {CONSTRAINTS.map((i) => (
            <label className="chip" key={i}><input type="checkbox" checked={constraints.includes(i)} onChange={() => toggle(constraints, setConstraints, i)} /><span>{i}</span></label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="notes">Anything else? <span className="hint">(must-sees, places to skip, where you are staying)</span></label>
        <textarea id="notes" maxLength={1200} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="We are staying near Praça do Comércio and want one slow morning." />
      </div>

      <div className="field">
        <button className="btn primary" type="submit" disabled={disabled || !destination.trim() || days < 1 || days > MAX_TRIP_DAYS}>
          {disabled ? 'Planning…' : 'Plan my trip'}
        </button>
      </div>
    </form>
  );
}
