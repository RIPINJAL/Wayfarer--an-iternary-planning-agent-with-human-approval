import type { AgentEvent } from './schemas';

/** Builds a Server-Sent Events response driven by an async job that emits AgentEvents. */
export function sseResponse(job: (emit: (e: AgentEvent) => void, signal: AbortSignal) => Promise<void>, reqSignal: AbortSignal): Response {
  const enc = new TextEncoder();
  const ctrl = new AbortController();
  reqSignal.addEventListener('abort', () => ctrl.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => { if (!closed) { try { controller.enqueue(enc.encode(chunk)); } catch { closed = true; } } };
      const emit = (e: AgentEvent) => send(`data: ${JSON.stringify(e)}\n\n`);
      const beat = setInterval(() => send(': keepalive\n\n'), 15_000);
      try {
        await job(emit, ctrl.signal);
      } catch (e) {
        if (!ctrl.signal.aborted) emit({ type: 'error', message: e instanceof Error ? e.message : 'Something went wrong' });
      } finally {
        clearInterval(beat);
        emit({ type: 'done' });
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { ctrl.abort(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
