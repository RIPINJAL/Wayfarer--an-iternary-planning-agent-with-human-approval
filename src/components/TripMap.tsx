'use client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Item } from '@/lib/schemas';

export interface MapStop { item: Item; n: number }

const icon = (n: number, active: boolean) =>
  L.divIcon({ className: '', html: `<span class="pin${active ? ' active' : ''}">${n}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });

export default function TripMap(props: { stops: MapStop[]; center: [number, number]; highlightId: string | null; onSelect: (id: string) => void; label: string }) {
  const { stops, center, highlightId, onSelect, label } = props;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, { m: L.Marker; n: number }>());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView(center, 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; markers.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    markers.current.clear();
    const pts: L.LatLngTuple[] = [];
    for (const { item, n } of stops) {
      const p = item.place;
      if (p?.lat == null || p?.lng == null) continue;
      const ll: L.LatLngTuple = [p.lat, p.lng];
      pts.push(ll);
      const mk = L.marker(ll, { icon: icon(n, false), title: item.title, keyboard: true }).addTo(g);
      mk.bindTooltip(`${n}. ${item.title}`, { direction: 'top', offset: [0, -12] });
      mk.on('click', () => selectRef.current(item.id));
      markers.current.set(item.id, { m: mk, n });
    }
    if (pts.length > 1) L.polyline(pts, { color: '#167c8a', weight: 3, opacity: 0.55, dashArray: '2 8' }).addTo(g);
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    else m.setView(center, 12);
  }, [stops, center]);

  useEffect(() => {
    markers.current.forEach(({ m, n }, id) => m.setIcon(icon(n, id === highlightId)));
    const h = highlightId ? markers.current.get(highlightId) : null;
    if (h && map.current) map.current.panTo(h.m.getLatLng(), { animate: true });
  }, [highlightId, stops]);

  return <div ref={el} className="map" role="region" aria-label={label} />;
}
