'use client';
import { useCallback, useRef, useState } from 'react';
import type { AgentEvent, Itinerary } from './schemas';

export interface Step { id: string; label: string; state: 'running' | 'done' | 'error'; detail?: string }
export interface FieldIssue { path: string; message: string }
export interface RunResult { ok: boolean; tripId?: string; itinerary?: Itinerary; error?: string; issues?: FieldIssue[] }

/** Runs an agent endpoint that streams Server-Sent Events and exposes live progress to the UI. */
export function useAgentStream() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [narration, setNarration] = useState('');
  const [status, setStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => { setSteps([]); setNarration(''); setStatus(''); }, []);

  const run = useCallback(async (url: string, body: unknown): Promise<RunResult> => {
    reset();
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const out: RunResult = { ok: false };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string; issues?: FieldIssue[] };
        return { ok: false, error: j.error ?? `Request failed (${res.status})`, issues: j.issues };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const handle = (ev: AgentEvent) => {
        switch (ev.type) {
          case 'status': setStatus(ev.message); break;
          case 'text': setNarration((n) => (n + ev.delta).slice(-220)); break;
          case 'tool':
            if (ev.state === 'running') setNarration('');
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === ev.id);
              const next: Step = { id: ev.id, label: ev.label, state: ev.state, detail: ev.detail };
              if (i === -1) return [...prev, next];
              const copy = prev.slice();
              copy[i] = next;
              return copy;
            });
            break;
          case 'itinerary': out.itinerary = ev.itinerary; break;
          case 'saved': out.tripId = ev.tripId; out.ok = true; break;
          case 'error': out.error = ev.message; out.ok = false; break;
          case 'done': break;
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('');
          if (data) { try { handle(JSON.parse(data) as AgentEvent); } catch { /* ignore malformed chunk */ } }
        }
      }
      if (!out.ok && !out.error) out.error = 'The connection closed before your plan was ready. Please try again.';
      return out;
    } catch (e) {
      if (ctrl.signal.aborted) return { ok: false, error: 'Cancelled' };
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [reset]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { running, steps, narration, status, run, cancel, reset };
}
