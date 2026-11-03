import Link from "next/link";
import { Leaf, ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui";
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
          <div className="eyebrow">A LITTLE TOGETHER GOES A LONG WAY.</div>
          <h1>
            Big ideas.
            <br />
            Shared belief.
            <br />
            <em>Real possibility.</em>
          </h1>
          <div className="auth-art" aria-hidden="true">
            <span />
            <Leaf size={90} />
            <span />
          </div>
          <p>
            A shared home for the people, ideas, and funds that move your
            community forward.
          </p>
        </div>
        <small>Local hackathon demo · simulated funds</small>
      </section>
      <section className="auth-form-area">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} />
          Back to Fundicate
        </Link>
        <div className="auth-form-content">{children}</div>
        <p className="muted small-text">
          Transparent by design. Community at heart.
        </p>
      </section>
    </main>
  );
}
