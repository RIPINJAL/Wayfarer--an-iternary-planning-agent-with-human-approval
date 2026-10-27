import { getTrip, getTripByShareToken } from '@/lib/db';
import { tripToIcs } from '@/lib/ics';
import { getOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** `id` is the trip id for the owner, or a share token for public viewers. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const owner = await getOwner();
  const trip = (owner ? getTrip(owner, id) : null) ?? getTripByShareToken(id);
  if (!trip) return new Response('Not found', { status: 404 });
  const name = trip.itinerary.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'trip';
  return new Response(tripToIcs(trip), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.ics"` },
  });
}
