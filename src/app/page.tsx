import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Network,
  Vote,
  ChartNoAxesCombined,
  Boxes,
  ShieldCheck,
  Workflow,
  TrendingUp,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { NetworkArt } from "@/components/network-art";
export default function Home() {
  return (
    <div className="landing network-landing">
      <header className="landing-header">
        <Logo />
        <nav>
          <Link href="/explore">Discover communities</Link>
          <a href="#how-it-works">How the network works</a>
          <a href="#collective-intelligence">Collective intelligence</a>
        </nav>
        <div className="row">
          <Link href="/login" className="text-link">
            Sign in
          </Link>
          <Link href="/register" className="button primary">
            Join the network <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main>
        <section className="network-hero">
          <div className="network-hero-copy">
            <div className="hero-pill">
              <span className="live-dot" />
              PEOPLE. CONSENSUS. POSSIBILITY.<span>NEAR ECOSYSTEM ↗</span>
            </div>
            <h1>
              A network of people.
              <br />
              <span>A world of possibility.</span>
            </h1>
            <p>
              Connect with a shared purpose. Fund the ideas you believe in. Give
              every voice a part in what comes next.
            </p>
            <div className="hero-actions">
              <Link href="/register" className="button primary large">
                Build something together <ArrowUpRight size={19} />
              </Link>
              <Link href="/explore" className="button secondary large">
                Find your collective <ArrowRight size={17} />
              </Link>
            </div>
            <div className="hero-proof">
              <span>
                <Network size={16} />
                Community at the core
              </span>
              <span>
                <Vote size={16} />
                Consensus by design
              </span>
              <span>
                <ShieldCheck size={16} />
                Transparency at every step
              </span>
            </div>
          </div>
          <div className="network-hero-visual">
            <NetworkArt />
            <div className="protocol-float-card">
              <span className="float-icon">
                <Vote size={19} />
              </span>
              <div>
                <small>THE POWER OF PARTICIPATION</small>
                <strong>One person. One voice.</strong>
              </div>
              <span className="float-signal" />
            </div>
            <div className="protocol-float-label">
              <Boxes size={16} />
              <span>
                Collective resources.
                <br />
                Connected decisions.
              </span>
            </div>
          </div>
        </section>
        <div className="network-principles">
          <span>
            A stronger future
            <br />
            <strong>is built together.</strong>
          </span>
          <div>
            <Network size={22} />
            <span>Connected communities</span>
          </div>
          <div>
            <Vote size={22} />
            <span>Recorded governance</span>
          </div>
          <div>
            <ChartNoAxesCombined size={22} />
            <span>Transparent intelligence</span>
          </div>
          <span className="simulation-disclosure">
            Local MVP
            <br />
            <strong>Simulated treasury</strong>
          </span>
        </div>
        <section className="network-how" id="how-it-works">
          <div className="section-intro">
            <div className="eyebrow">FROM CONNECTION TO COLLECTIVE IMPACT</div>
            <h2>
              People create the network.
              <br />
              <span>Purpose gives it direction.</span>
            </h2>
            <p>
              A home for communities that want to fund, decide, and grow
              together. With clear rules, shared ownership of decisions, and a
              trail you can follow.
            </p>
          </div>
          <div className="network-feature-grid">
            {[
              {
                n: "01",
                icon: Network,
                title: "Find your people.",
                text: "Create a collective or join a community that shares your ambition. Every new connection opens up new possibilities.",
              },
              {
                n: "02",
                icon: Vote,
                title: "Turn voices into direction.",
                text: "Bring an idea forward. Vote with clear rules, frozen eligibility and outcomes calculated by the server.",
              },
              {
                n: "03",
                icon: Workflow,
                title: "Make every movement visible.",
                text: "Follow pooled resources from contributions to approved allocations and separately recorded simulated payouts.",
              },
            ].map((item) => (
              <article key={item.n}>
                <span className="feature-number">{item.n}</span>
                <span className="feature-icon">
                  <item.icon size={26} />
                </span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <Link href="/register">
                  Be part of it <ArrowUpRight size={15} />
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className="intelligence-section" id="collective-intelligence">
          <div className="intelligence-preview">
            <div className="preview-top">
              <span>
                <ChartNoAxesCombined size={16} />
                COLLECTIVE INTELLIGENCE
              </span>
              <span className="badge green">Explore deeper</span>
            </div>
            <div className="preview-flow">
              <div>
                <span className="preview-node cyan">
                  <Network size={23} />
                </span>
                <strong>Your network</strong>
                <small>People & communities</small>
              </div>
              <span>→</span>
              <div>
                <span className="preview-node violet">
                  <Vote size={23} />
                </span>
                <strong>Your decisions</strong>
                <small>Participation & outcomes</small>
              </div>
              <span>→</span>
              <div>
                <span className="preview-node pink">
                  <TrendingUp size={23} />
                </span>
                <strong>Your growth</strong>
                <small>Funding & impact</small>
              </div>
            </div>
            <div className="preview-layers">
              <span>Overview</span>
              <span>Analysis</span>
              <span>Source records</span>
              <span>Exact details ↗</span>
            </div>
            <small className="preview-caption">
              A path through your data. No invented performance numbers.
            </small>
          </div>
          <div>
            <div className="eyebrow">
              SIMPLE ON THE SURFACE. LIMITLESS CURIOSITY.
            </div>
            <h2>
              See the big picture.
              <br />
              <span>Follow every detail.</span>
            </h2>
            <p>
              Start with the signals that matter. Then follow treasury trends,
              voting participation, community connections, and your own
              contributions all the way to the original records.
            </p>
            <ul>
              <li>
                <ChartNoAxesCombined size={17} />
                Filter by community, currency and time
              </li>
              <li>
                <DatabaseIcon />
                Inspect the source behind a metric
              </li>
              <li>
                <ShieldCheck size={17} />
                Save views and export your analysis
              </li>
            </ul>
            <Link href="/register" className="button secondary">
              Meet your new dashboard <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
        <section className="network-final-cta">
          <span className="eyebrow">CONNECTION IS ONLY THE BEGINNING.</span>
          <h2>
            The future is collective.
            <br />
            <span>Make it yours.</span>
          </h2>
          <Link href="/register" className="button primary large">
            Start your collective <ArrowUpRight size={19} />
          </Link>
          <p>
            Local hackathon MVP · all funds simulated · real NEAR integration is
            future work
          </p>
        </section>
      </main>
      <footer className="landing-footer">
        <Logo />
        <p>Fund together. Decide together. Grow together.</p>
        <Link href="/explore">
          Explore the network <ArrowUpRight size={14} />
        </Link>
      </footer>
    </div>
  );
}
function DatabaseIcon() {
  return <Boxes size={17} />;
}
