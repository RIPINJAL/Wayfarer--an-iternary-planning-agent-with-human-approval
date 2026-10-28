import 'server-only';
import { env } from '../env';

const UA = () => `Wayfarer/1.0 (${env.contactEmail})`;

export async function getJson<T = unknown>(url: string, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA(), Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`HTTP ${res.status} from ${new URL(url).host}${detail ? `: ${detail}` : ''}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Serialises calls so we stay inside free services' fair-use limits (e.g. Nominatim: 1 req/s). */
export function throttle(minGapMs: number) {
  let last = 0;
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      const wait = Math.max(0, last + minGapMs - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        last = Date.now();
      }
    });
    chain = run.catch(() => undefined);
    return run;
  };
}

export class TtlCache<V> {
  private m = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string): V | undefined {
    const e = this.m.get(k);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.m.delete(k); return undefined; }
    return e.v;
  }
  set(k: string, v: V) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { v, exp: Date.now() + this.ttlMs });
  }
}
