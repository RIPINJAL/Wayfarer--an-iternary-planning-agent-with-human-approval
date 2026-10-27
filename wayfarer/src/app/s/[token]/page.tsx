import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ItineraryView from '@/components/ItineraryView';
import { fmtRange } from '@/lib/format';
import { getTripByShareToken } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const trip = getTripByShareToken(token);
  return { title: trip?.title ?? 'Shared trip', robots: { index: false, follow: false } };
}

export default async function SharedTrip({ params }: Props) {
  const { token } = await params;
  const trip = getTripByShareToken(token);
  if (!trip) notFound();
  const it = trip.itinerary;
  return (
    <div className="wrap">
      <div className="trip-head">
        <h1>{it.title}</h1>
        <div className="trip-meta"><span>{it.destination.name}{it.destination.country ? `, ${it.destination.country}` : ''}</span><span>{fmtRange(trip.startDate, trip.endDate)}</span></div>
        <p className="summary">{it.summary}</p>
        <div className="actions">
          <a className="btn small" href={`/api/trips/${token}/ics`}>Add to calendar</a>
          <Link className="btn small primary" href="/">Plan your own trip</Link>
        </div>
      </div>
      <ItineraryView itinerary={it} />
    </div>
  );
}
