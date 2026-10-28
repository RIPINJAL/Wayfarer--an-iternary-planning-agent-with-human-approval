import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import TripWorkspace from '@/components/TripWorkspace';
import { getTrip } from '@/lib/db';
import { getOwner } from '@/lib/owner';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const owner = await getOwner();
  const trip = owner ? getTrip(owner, id) : null;
  return { title: trip?.title ?? 'Trip', robots: { index: false } };
}

export default async function TripPage({ params }: Props) {
  const { id } = await params;
  const owner = await getOwner();
  const trip = owner ? getTrip(owner, id) : null;
  if (!trip) notFound();
  return <TripWorkspace initial={trip} allowRefine={env.provider !== 'india'} />;
}
