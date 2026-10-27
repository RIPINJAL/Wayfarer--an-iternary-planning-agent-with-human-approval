import { pingDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ ok: pingDb() });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
