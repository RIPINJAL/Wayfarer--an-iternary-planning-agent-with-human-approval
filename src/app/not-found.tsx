import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap narrow">
      <div className="panel empty">
        <h2>We could not find that trip</h2>
        <p className="muted" style={{ marginBottom: 16 }}>It may have been deleted, or it was created in a different browser.</p>
        <Link className="btn primary" href="/">Plan a new trip</Link>
      </div>
    </div>
  );
}
