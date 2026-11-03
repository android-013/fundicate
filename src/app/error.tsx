"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty standalone">
      <h1>Something needs another try.</h1>
      <p>
        We couldn’t load this page. Check that PostgreSQL is running, then try
        again.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
