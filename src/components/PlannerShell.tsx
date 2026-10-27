'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AgentLog from './AgentLog';
import PlannerForm from './PlannerForm';
import { useAgentStream, type FieldIssue } from '@/lib/useAgentStream';

export default function PlannerShell() {
  const router = useRouter();
  const agent = useAgentStream();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [started, setStarted] = useState(false);

  async function submit(brief: Record<string, unknown>) {
    setError(null);
    setIssues([]);
    setStarted(true);
    const r = await agent.run('/api/plan', brief);
    if (r.ok && r.tripId) {
      router.push(`/trips/${r.tripId}`);
      return;
    }
    setStarted(false);
    if (r.issues?.length) setIssues(r.issues);
    if (r.error && r.error !== 'Cancelled') setError(r.error);
  }

  return (
    <div className="wrap">
      <div className="hero">
        <div>
          <h1>Tell us the trip. Get a plan you can follow.</h1>
          <p className="lede">
            Wayfarer checks the weather for your dates, pins every stop on a map, and tests that each leg of the day is possible before it hands you the itinerary.
          </p>
          <ul className="muted" style={{ paddingLeft: 20, marginTop: 18, display: 'grid', gap: 6 }}>
            <li>Day-by-day timeline with costs, tips and travel times</li>
            <li>Change anything afterwards by just asking</li>
            <li>Export to your calendar, print it, or share a link</li>
          </ul>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          {error && <div className="banner" role="alert">{error}</div>}
          {started ? (
            <AgentLog running={agent.running} steps={agent.steps} narration={agent.narration} status={agent.status} onCancel={agent.cancel} />
          ) : (
            <PlannerForm onSubmit={submit} disabled={agent.running} issues={issues} />
          )}
        </div>
      </div>
    </div>
  );
}
