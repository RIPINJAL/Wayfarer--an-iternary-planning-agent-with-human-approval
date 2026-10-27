import { listTrips } from '@/lib/db';
import { getOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export async function GET() {
  const owner = await getOwner();
  if (!owner) return Response.json({ trips: [] });
  return Response.json({ trips: listTrips(owner) });
}
