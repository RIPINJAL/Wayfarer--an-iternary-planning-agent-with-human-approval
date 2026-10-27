import { deleteTrip, getTrip } from '@/lib/db';
import { getOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const owner = await getOwner();
  const { id } = await params;
  const trip = owner ? getTrip(owner, id) : null;
  return trip ? Response.json({ trip }) : Response.json({ error: 'Trip not found' }, { status: 404 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const owner = await getOwner();
  const { id } = await params;
  const ok = owner ? deleteTrip(owner, id) : false;
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Trip not found' }, { status: 404 });
}
