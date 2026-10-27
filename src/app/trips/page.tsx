import type { Metadata } from 'next';
import Link from 'next/link';
import { fmtRange } from '@/lib/format';
import { listTrips } from '@/lib/db';
import { getOwner } from '@/lib/owner';

export const metadata: Metadata = { title: 'My trips' };
export const dynamic = 'force-dynamic';

export default async function Trips() {
  const owner = await getOwner();
  const trips = owner ? listTrips(owner) : [];
  return (
    <div className="wrap narrow">
      <h1 style={{ fontSize: '2.2rem' }}>My trips</h1>
      <p className="muted" style={{ marginTop: 8 }}>Saved in this browser. Clearing your cookies will hide them, so share a link or add a trip to your calendar to keep a copy.</p>
      {trips.length === 0 ? (
        <div className="panel empty" style={{ marginTop: 24 }}>
          <h2>No trips yet</h2>
          <p className="muted" style={{ marginBottom: 16 }}>Plan your first one and it will show up here.</p>
          <Link className="btn primary" href="/">Plan a trip</Link>
        </div>
      ) : (
        <ul className="trips">
          {trips.map((t) => (
            <li className="trip-row" key={t.id}>
              <div>
                <Link className="title" href={`/trips/${t.id}`}>{t.title}</Link>
                <p className="muted">{t.destination}, {fmtRange(t.startDate, t.endDate)}</p>
              </div>
              <Link className="btn small" href={`/trips/${t.id}`}>Open</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
