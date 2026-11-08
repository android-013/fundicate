import Link from "next/link";
import { ArrowLeft, Network, Vote, TrendingUp } from "lucide-react";
import { Logo } from "@/components/ui";
import { NetworkArt } from "@/components/network-art";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Logo light />
        <div>
          <div className="eyebrow">
            A SHARED FUTURE STARTS WITH A CONNECTION.
          </div>
          <h1>
            Your people.
            <br />
            Your voice.
            <br />
            <em>Your next chapter.</em>
          </h1>
          <NetworkArt compact />
          <p>
            Build a network around what matters. Turn shared purpose into
            decisions, progress, and collective possibility.
          </p>
          <div className="auth-values">
            <span>
              <Network size={15} />
              Connect
            </span>
            <span>
              <Vote size={15} />
              Decide
            </span>
            <span>
              <TrendingUp size={15} />
              Grow
            </span>
          </div>
        </div>
        <small>
          Community governance · transparent external payment records
        </small>
      </section>
      <section className="auth-form-area">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />
          Back to Fundicate
        </Link>
        <div className="auth-form-content">{children}</div>
        <p className="muted small-text">
          People at the core. Transparency at every step.
        </p>
      </section>
    </main>
  );
}
