import 'server-only';
import { cookies } from 'next/headers';

export const OWNER_COOKIE = 'wf_owner';
const ID_RE = /^[0-9a-f-]{36}$/;

/** Anonymous per-browser identity set by middleware. Trips are private to the browser that created them. */
export async function getOwner(): Promise<string | null> {
  const v = (await cookies()).get(OWNER_COOKIE)?.value;
  return v && ID_RE.test(v) ? v : null;
}
