import { NextResponse, type NextRequest } from 'next/server';

/** Gives every browser an anonymous, private identity so trips are scoped without needing accounts. */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const existing = req.cookies.get('wf_owner')?.value;
  if (!existing || !/^[0-9a-f-]{36}$/.test(existing)) {
    res.cookies.set('wf_owner', crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https',
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 2,
    });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/|favicon.svg|api/health).*)'] };
