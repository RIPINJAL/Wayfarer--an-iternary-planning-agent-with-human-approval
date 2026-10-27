import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from './env';
import type { Brief, Itinerary, TripRecord, TripSummary } from './schemas';

const g = globalThis as unknown as { __wf_db?: Database.Database };

function open(): Database.Database {
  const file = resolve(env.databasePath);
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      title TEXT NOT NULL,
      destination TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      brief TEXT NOT NULL,
      itinerary TEXT NOT NULL,
      share_token TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner, updated_at DESC);
  `);
  return db;
}

function db(): Database.Database {
  return (g.__wf_db ??= open());
}

interface Row {
  id: string; owner: string; title: string; destination: string; start_date: string; end_date: string;
  brief: string; itinerary: string; share_token: string | null; created_at: string; updated_at: string;
}

const toRecord = (r: Row): TripRecord => ({
  id: r.id,
  title: r.title,
  destination: r.destination,
  startDate: r.start_date,
  endDate: r.end_date,
  brief: JSON.parse(r.brief) as Brief,
  itinerary: JSON.parse(r.itinerary) as Itinerary,
  shareToken: r.share_token,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const newId = () => randomBytes(9).toString('base64url');

export function createTrip(owner: string, brief: Brief, itinerary: Itinerary): TripRecord {
  const id = newId();
  const now = new Date().toISOString();
  db()
    .prepare(
      `INSERT INTO trips (id, owner, title, destination, start_date, end_date, brief, itinerary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, owner, itinerary.title, itinerary.destination.name, brief.startDate, brief.endDate, JSON.stringify(brief), JSON.stringify(itinerary), now, now);
  return getTrip(owner, id)!;
}

export function getTrip(owner: string, id: string): TripRecord | null {
  const r = db().prepare('SELECT * FROM trips WHERE id = ? AND owner = ?').get(id, owner) as Row | undefined;
  return r ? toRecord(r) : null;
}

export function getTripByShareToken(token: string): TripRecord | null {
  const r = db().prepare('SELECT * FROM trips WHERE share_token = ?').get(token) as Row | undefined;
  return r ? toRecord(r) : null;
}

export function listTrips(owner: string): TripSummary[] {
  const rows = db()
    .prepare('SELECT id, title, destination, start_date, end_date, updated_at FROM trips WHERE owner = ? ORDER BY updated_at DESC LIMIT 100')
    .all(owner) as Pick<Row, 'id' | 'title' | 'destination' | 'start_date' | 'end_date' | 'updated_at'>[];
  return rows.map((r) => ({ id: r.id, title: r.title, destination: r.destination, startDate: r.start_date, endDate: r.end_date, updatedAt: r.updated_at }));
}

export function updateItinerary(owner: string, id: string, itinerary: Itinerary): TripRecord | null {
  const res = db()
    .prepare('UPDATE trips SET itinerary = ?, title = ?, destination = ?, updated_at = ? WHERE id = ? AND owner = ?')
    .run(JSON.stringify(itinerary), itinerary.title, itinerary.destination.name, new Date().toISOString(), id, owner);
  return res.changes ? getTrip(owner, id) : null;
}

export function deleteTrip(owner: string, id: string): boolean {
  return db().prepare('DELETE FROM trips WHERE id = ? AND owner = ?').run(id, owner).changes > 0;
}

export function setSharing(owner: string, id: string, enabled: boolean): string | null | undefined {
  const t = getTrip(owner, id);
  if (!t) return undefined;
  const token = enabled ? t.shareToken ?? randomBytes(16).toString('base64url') : null;
  db().prepare('UPDATE trips SET share_token = ? WHERE id = ? AND owner = ?').run(token, id, owner);
  return token;
}

export function pingDb(): boolean {
  return db().prepare('SELECT 1 AS ok').get() !== undefined;
}
