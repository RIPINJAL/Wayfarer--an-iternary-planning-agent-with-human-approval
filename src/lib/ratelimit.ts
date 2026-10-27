import 'server-only';
import { env } from './env';

// In-memory limits: correct for a single instance. For several instances, back these with Redis.
const hits = new Map<string, number[]>();
let day = new Date().toISOString().slice(0, 10);
let dayCount = 0;

export function checkPlanLimit(key: string): { ok: true } | { ok: false; message: string; retryAfterSec: number } {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= env.dailyCap) {
    return { ok: false, message: 'The planner has reached its daily limit. Please try again tomorrow.', retryAfterSec: 3600 };
  }
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= env.ratePerHour) {
    const retry = Math.ceil((recent[0] + 3600_000 - now) / 1000);
    return { ok: false, message: `You have used ${env.ratePerHour} plans this hour. Try again in ${Math.ceil(retry / 60)} minutes.`, retryAfterSec: retry };
  }
  recent.push(now);
  hits.set(key, recent);
  dayCount++;
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 3600_000)) hits.delete(k);
  return { ok: true };
}
