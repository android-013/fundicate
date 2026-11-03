import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty standalone">
      <h1>This page hasn’t found its people.</h1>
      <p>The community or proposal may not exist.</p>
      <Link className="button primary" href="/explore">
        Explore communities
      </Link>
    </div>
  );
}
