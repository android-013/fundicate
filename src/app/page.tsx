import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Users,
  Vote,
  ShieldCheck,
  Leaf,
  MoveUpRight,
} from "lucide-react";
import { Logo } from "@/components/ui";
export default function Home() {
  return (
    <div className="landing">
      <header className="landing-header">
        <Logo />
        <nav>
          <Link href="/explore">Explore communities</Link>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="row">
          <Link href="/login" className="text-link">
            Sign in
          </Link>
          <Link href="/register" className="button primary">
            Get started <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" />
              SMALL CONTRIBUTIONS. SHARED POSSIBILITIES.
            </div>
            <h1>
              Good things
              <br />
              happen <span>together.</span>
            </h1>
            <p>
              Bring your people, pool your resources, and decide what comes
              next. A clearer way to turn collective ambition into real
              community impact.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="button primary large">
                Start something together <ArrowUpRight size={19} />
              </Link>
              <Link href="/explore" className="button ghost large">
                Explore communities <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-proof">
              <span>
                <ShieldCheck size={16} />
                Transparent by design
              </span>
              <span>
                <Vote size={16} />
                Every member has a voice
              </span>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Illustration of collective funding and community voting"
          >
            <div className="visual-grid" />
            <span className="floating-label">
              <span className="live-dot" />A SHARED FUTURE, IN MOTION
            </span>
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="center-symbol">
              <Leaf size={68} />
            </div>
            <div className="visual-card pool-card">
              <div className="row between">
                <span>Campus Collective</span>
                <span className="tiny-pill">DEMO</span>
              </div>
              <small>Our shared treasury</small>
              <strong>
                $12,450<span>.00</span>
              </strong>
              <div className="mini-chart">
                {[22, 30, 25, 42, 37, 50, 46, 60, 66, 62, 82, 94].map(
                  (n, i) => (
                    <span style={{ height: `${n}%` }} key={i} />
                  ),
                )}
              </div>
              <div className="row between small-text">
                <span>12 people. One shared goal.</span>
                <ArrowUpRight size={16} />
              </div>
            </div>
            <div className="visual-card ballot-card">
              <span className="round-check">
                <Check size={16} />
              </span>
              <div>
                <strong>A new idea, approved.</strong>
                <small>Community garden · illustrative vote</small>
                <div className="vote-avatars">
                  <span>AM</span>
                  <span>SK</span>
                  <span>JL</span>
                  <span>+9</span>
                </div>
              </div>
            </div>
            <div className="orbit-label">
              MORE THAN A FUND.
              <br />A WAY FORWARD.
            </div>
          </div>
        </section>
        <div className="value-strip">
          <span>
            Built around people.
            <br />
            <strong>Accountable at every step.</strong>
          </span>
          <div>
            <Users size={22} />
            <strong>Shared purpose</strong>
          </div>
          <div>
            <Vote size={22} />
            <strong>Fair decisions</strong>
          </div>
          <div>
            <ShieldCheck size={22} />
            <strong>Clear money trails</strong>
          </div>
          <span className="near-lockup">
            Built for the
            <br />
            <strong>NEAR ecosystem ↗</strong>
          </span>
        </div>
        <section className="how-section" id="how-it-works">
          <div>
            <div className="eyebrow">FROM “WHAT IF” TO “WE DID”</div>
            <h2>
              A little from everyone.
              <br />
              Something bigger for all.
            </h2>
            <p>
              From campus clubs to neighborhood projects, give your community a
              place to make progress together.
            </p>
            <Link href="/explore" className="text-link">
              Find your community <ArrowRight size={17} />
            </Link>
          </div>
          <div className="how-steps">
            {[
              {
                n: "01",
                title: "Find your people",
                text: "Create a community or apply to join one that shares your purpose.",
              },
              {
                n: "02",
                title: "Put ideas to a vote",
                text: "Clear rules, one member per vote, and results everyone can understand.",
              },
              {
                n: "03",
                title: "Make every contribution count",
                text: "Track pooled funds and approved allocations in a transparent ledger.",
              },
            ].map((s) => (
              <div key={s.n}>
                <span>{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
                <MoveUpRight size={18} />
              </div>
            ))}
          </div>
        </section>
        <section className="landing-cta">
          <Leaf size={32} />
          <h2>
            Your next big thing
            <br />
            starts with “we.”
          </h2>
          <Link className="button light-button large" href="/register">
            Build your community <ArrowUpRight size={18} />
          </Link>
          <p>Hackathon MVP · local simulated treasury · no real funds</p>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>Fund together. Decide together.</p>
        <Link href="/explore">
          Explore <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
