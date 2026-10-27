import { runAgent } from '@/lib/agent';
import { createTrip } from '@/lib/db';
import { getOwner } from '@/lib/owner';
import { checkPlanLimit } from '@/lib/ratelimit';
import { BriefSchema } from '@/lib/schemas';
import { sseResponse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: 'Session missing. Reload the page and try again.' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = BriefSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Please check your trip details.', issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const limit = checkPlanLimit(`${owner}|${ip}`);
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });

  const brief = parsed.data;
  return sseResponse(async (emit, signal) => {
    const itinerary = await runAgent({ brief, emit, signal });
    emit({ type: 'itinerary', itinerary });
    const trip = createTrip(owner, brief, itinerary);
    emit({ type: 'saved', tripId: trip.id });
  }, req.signal);
}
