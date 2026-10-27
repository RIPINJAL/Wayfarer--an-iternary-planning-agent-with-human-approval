import type { Brief, Itinerary, TripRecord } from '@/lib/schemas';

export const brief: Brief = {
  destination: 'Lisbon', origin: '', startDate: '2027-04-10', endDate: '2027-04-11', adults: 2, children: 0,
  budgetLevel: 'moderate', currency: 'EUR', pace: 'balanced', interests: ['Food & drink'], constraints: [], notes: '',
};

const item = (id: string, time: string, extra = {}) => ({
  id, time, durationMin: 60, title: `Stop ${id}`, category: 'sight' as const, description: 'A place; with, punctuation.',
  place: { name: `Place ${id}`, lat: 38.7, lng: -9.14 }, ...extra,
});

export const itinerary: Itinerary = {
  title: 'Lisbon in two days', summary: 'Hills, tiles and pastries.',
  destination: { name: 'Lisbon', country: 'Portugal', lat: 38.72, lng: -9.14 }, currency: 'EUR',
  days: [
    { day: 1, date: '2027-04-10', theme: 'Alfama', summary: 'Old town', items: [item('d1-01', '09:00'), item('d1-02', '13:00', { category: 'food' })] },
    { day: 2, date: '2027-04-11', theme: 'Belém', summary: 'Riverside', items: [item('d2-01', '10:00')] },
  ],
  budget: { totalEstimate: 400, breakdown: [{ label: 'Food', amount: 200 }] },
  packingTips: [], practicalTips: [], caveats: [],
};

export const trip: TripRecord = {
  id: 'abc', title: itinerary.title, destination: 'Lisbon', startDate: brief.startDate, endDate: brief.endDate,
  brief, itinerary, shareToken: null, createdAt: '', updatedAt: '',
};
