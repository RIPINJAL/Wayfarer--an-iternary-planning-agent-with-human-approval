'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AgentLog from './AgentLog';
import ItineraryView from './ItineraryView';
import { fmtRange } from '@/lib/format';
import { tripDays, type TripRecord } from '@/lib/schemas';
import { useAgentStream } from '@/lib/useAgentStream';

const SUGGESTIONS = ['Make day 2 more relaxed', 'Swap one dinner for something vegetarian', 'Add a rainy-day backup for day 1', 'Cut the budget by about 15%'];

export default function TripWorkspace({ initial }: { initial: TripRecord }) {
  const router = useRouter();
  const agent = useAgentStream();
  const [trip, setTrip] = useState(initial);
  const [instruction, setInstruction] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [shareToken, setShareToken] = useState(initial.shareToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const it = trip.itinerary;
  const shareUrl = shareToken && typeof window !== 'undefined' ? `${window.location.origin}/s/${shareToken}` : '';

  async function refine(text: string) {
    if (text.trim().length < 3 || agent.running) return;
    setError(null);
    setRefining(true);
    const r = await agent.run(`/api/trips/${trip.id}/refine`, { instruction: text });
    setRefining(false);
    if (r.ok && r.itinerary) {
      setTrip((t) => ({ ...t, itinerary: r.itinerary!, title: r.itinerary!.title }));
      setInstruction('');
      agent.reset();
    } else if (r.error && r.error !== 'Cancelled') setError(r.error);
  }

  async function toggleShare(enabled: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/trips/${trip.id}/share`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      if (res.ok) setShareToken(((await res.json()) as { shareToken: string | null }).shareToken);
      else setError('Could not update sharing. Try again.');
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm('Delete this trip? This cannot be undone.')) return;
    setBusy(true);
    const res = await fetch(`/api/trips/${trip.id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/trips'); router.refresh(); } else { setBusy(false); setError('Could not delete the trip.'); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  return (
    <div className="wrap">
      <div className="trip-head">
        <h1>{it.title}</h1>
        <div className="trip-meta">
          <span>{it.destination.name}{it.destination.country ? `, ${it.destination.country}` : ''}</span>
          <span>{fmtRange(trip.startDate, trip.endDate)} ({tripDays(trip.startDate, trip.endDate)} days)</span>
          <span>{trip.brief.adults} adult{trip.brief.adults === 1 ? '' : 's'}{trip.brief.children ? `, ${trip.brief.children} child${trip.brief.children === 1 ? '' : 'ren'}` : ''}</span>
        </div>
        <p className="summary">{it.summary}</p>
        <div className="actions">
          <a className="btn small" href={`/api/trips/${trip.id}/ics`}>Add to calendar</a>
          <button className="btn small" type="button" onClick={() => window.print()}>Print or save PDF</button>
          {shareToken
            ? <button className="btn small" type="button" disabled={busy} onClick={() => toggleShare(false)}>Stop sharing</button>
            : <button className="btn small" type="button" disabled={busy} onClick={() => toggleShare(true)}>Share a link</button>}
          <Link className="btn small" href="/">New trip</Link>
          <button className="btn small danger" type="button" disabled={busy} onClick={remove}>Delete</button>
        </div>
        {shareToken && (
          <div className="sharebox">
            <label htmlFor="share">Anyone with this link can view this trip (read only)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="share" type="text" readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn small" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
          </div>
        )}
        {error && <div className="banner" role="alert">{error}</div>}
      </div>

      {refining && <div style={{ marginBottom: 18 }}><AgentLog title="Updating your itinerary" running={agent.running} steps={agent.steps} narration={agent.narration} status={agent.status} onCancel={agent.cancel} /></div>}

      <ItineraryView itinerary={it} />

      <section className="refine panel" aria-labelledby="refine-h">
        <h2 id="refine-h">Change the plan</h2>
        <p className="muted">Describe what you would like different. The planner updates only what it needs to.</p>
        <form onSubmit={(e) => { e.preventDefault(); void refine(instruction); }}>
          <label className="sr-only" htmlFor="instr">What should change?</label>
          <input id="instr" type="text" maxLength={800} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="e.g. Swap the museum on day 2 for something outdoors" disabled={agent.running} />
          <button className="btn primary" type="submit" disabled={agent.running || instruction.trim().length < 3}>Update plan</button>
        </form>
        <div className="suggest">{SUGGESTIONS.map((s) => <button key={s} type="button" disabled={agent.running} onClick={() => void refine(s)}>{s}</button>)}</div>
      </section>
    </div>
  );
}
