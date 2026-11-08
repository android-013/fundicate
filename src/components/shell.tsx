import Link from "next/link";
import { ReactNode } from "react";
import {
  Search,
  Settings2,
  ShieldCheck,
  ArrowUpRight,
  Boxes,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { initials } from "@/lib/format";
import { ActionButton } from "./forms";
import { Avatar, Logo } from "./ui";
import { WorkspaceNav } from "./workspace-nav";
export async function Shell({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const memberships = user
    ? await db.communityMembership.findMany({
        where: { userId: user.id, status: "ACTIVE" },
        include: { community: true },
        take: 8,
      })
    : [];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <Boxes size={17} />
          </span>
          <span>
            <strong>Personal workspace</strong>
            <small>Collective possibilities</small>
          </span>
          <span className="workspace-switch-dot" />
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <WorkspaceNav />
        <div className="workspace-label">
          YOUR COMMUNITIES{" "}
          <span>{memberships.length.toString().padStart(2, "0")}</span>
        </div>
        <nav className="community-sidebar-nav" aria-label="Your communities">
          {memberships.map(({ community: c }) => (
            <Link href={`/communities/${c.slug}`} key={c.id}>
              <span className={`mini-community ${c.color}`}>{c.name[0]}</span>
              <span>{c.name}</span>
            </Link>
          ))}
          {!memberships.length && (
            <p className="sidebar-hint">
              Connect around a shared purpose. Build something together.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/analytics" className="protocol-sidebar-card">
            <span>
              <Boxes size={17} />
              <span className="near-tag">COMMUNITY INSIGHTS</span>
            </span>
            <strong>
              Your network.
              <br />
              Your shared potential.
            </strong>
            <p>Explore the connections and decisions behind your collective.</p>
            <span className="text-link">
              Open analytics <ArrowUpRight size={14} />
            </span>
          </Link>
          {user ? (
            <>
              <Link href="/settings/profile" className="profile-link">
                <Avatar name={user.displayName} url={user.avatarUrl} small />
                <span>
                  <strong>{user.displayName}</strong>
                  <small>@{user.username}</small>
                </span>
                <Settings2 size={16} />
              </Link>
              <ActionButton
                operation="logout"
                body={{}}
                className="text-button"
              >
                Sign out
              </ActionButton>
            </>
          ) : (
            <Link href="/login" className="button primary">
              Sign in to your workspace
            </Link>
          )}
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="topbar-brand">
            <span className="live-dot" />
            <span>THE COLLECTIVE NETWORK</span>
            <span className="topbar-divider">/</span>
            <strong>Build what comes next.</strong>
          </div>
          <form action="/explore" className="topbar-search">
            <Search size={15} />
            <input
              aria-label="Search communities"
              name="q"
              placeholder="Find your next connection…"
            />
            <button type="submit" aria-label="Search">
              <ArrowUpRight size={14} />
            </button>
          </form>
          <div className="row">
            <span className="demo-label">
              <ShieldCheck size={14} />
              Simulated funds
            </span>
            {user ? (
              <Link
                href="/settings/security"
                aria-label={`${initials(user.displayName)} account security`}
              >
                <Avatar name={user.displayName} url={user.avatarUrl} small />
              </Link>
            ) : (
              <Link href="/register" className="text-link">
                Join the network <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Fundicate</span>
          <span>Connected people. Collective decisions. Shared growth.</span>
          <span className="footer-network">
            <span className="live-dot" />
            Local simulation
          </span>
        </footer>
      </div>
      <WorkspaceNav mobile signedIn={!!user} />
    </div>
  );
}
