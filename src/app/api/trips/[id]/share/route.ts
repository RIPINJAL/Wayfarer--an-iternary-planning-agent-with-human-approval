import { z } from 'zod';
import { setSharing } from '@/lib/db';
import { getOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const owner = await getOwner();
  if (!owner) return Response.json({ error: 'Session missing' }, { status: 401 });
  const { id } = await params;
  const body = z.object({ enabled: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const token = setSharing(owner, id, body.data.enabled);
  if (token === undefined) return Response.json({ error: 'Trip not found' }, { status: 404 });
  return Response.json({ shareToken: token });
}
