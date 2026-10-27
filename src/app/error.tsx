'use client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="wrap narrow">
      <div className="panel empty">
        <h2>Something went wrong</h2>
        <p className="muted" style={{ marginBottom: 16 }}>Try again. If it keeps happening, reload the page.</p>
        <button className="btn primary" type="button" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
