'use client';
import type { Step } from '@/lib/useAgentStream';

export default function AgentLog(props: { running: boolean; steps: Step[]; narration: string; status: string; onCancel?: () => void; title?: string }) {
  const { running, steps, narration, status, onCancel, title } = props;
  return (
    <section className="panel agent" aria-live="polite" aria-busy={running}>
      <div className="agent-head">
        <span className={running ? 'pulse' : 'pulse idle'} aria-hidden="true" />
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '1.25rem' }}>{title ?? (running ? 'Planning your trip' : 'Done')}</h2>
          <p className="muted">{status || 'This usually takes one to three minutes.'}</p>
        </div>
        {running && onCancel && <button type="button" className="btn small" onClick={onCancel}>Cancel</button>}
      </div>
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.id} className={`step ${s.state}`}>
            <span className="dot" aria-hidden="true" />
            <span>
              {s.label}
              <span className="sr-only">{s.state === 'running' ? ' (in progress)' : s.state === 'error' ? ' (failed)' : ' (done)'}</span>
              {s.detail && <span className="why"> {s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {running && <p className="narration">{narration}</p>}
    </section>
  );
}
