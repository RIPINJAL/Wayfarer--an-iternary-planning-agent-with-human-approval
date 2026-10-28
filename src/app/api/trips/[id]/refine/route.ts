import { z } from 'zod';
import { runAgent } from '@/lib/agent';
import { getTrip, updateItinerary } from '@/lib/db';
import { getOwner } from '@/lib/owner';
import { checkPlanLimit } from '@/lib/ratelimit';
import { sseResponse } from '@/lib/sse';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const Body = z.object({ instruction: z.string().trim().min(3, 'Tell us what to change').max(800) });
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  if (env.provider === 'india') {
    return Response.json({ error: 'The free public India planner does not support AI itinerary changes.' }, { status: 501 });
  }
  const owner = await getOwner();
  if (!owner) return Response.json({ error: 'Session missing. Reload the page and try again.' }, { status: 401 });
  const { id } = await params;
  const trip = getTrip(owner, id);
  if (!trip) return Response.json({ error: 'Trip not found' }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const limit = checkPlanLimit(`${owner}|${ip}`);
  if (!limit.ok) return Response.json({ error: limit.message }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });

  return sseResponse(async (emit, signal) => {
    const itinerary = await runAgent({ brief: trip.brief, current: trip.itinerary, instruction: parsed.data.instruction, emit, signal });
    const saved = updateItinerary(owner, id, itinerary);
    if (!saved) throw new Error('Trip was deleted while updating');
    emit({ type: 'itinerary', itinerary: saved.itinerary });
    emit({ type: 'saved', tripId: id });
  }, req.signal);
}
