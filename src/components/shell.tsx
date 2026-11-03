import Link from "next/link";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  Compass,
  Plus,
  Settings2,
  ShieldCheck,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { initials } from "@/lib/format";
import { ActionButton } from "./forms";
import { Avatar, Logo } from "./ui";
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
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <Link href="/dashboard">
            <LayoutDashboard size={19} />
            Overview
          </Link>
          <Link href="/explore">
            <Compass size={19} />
            Discover communities
          </Link>
          <Link href="/communities/new">
            <Plus size={19} />
            Create a community
          </Link>
        </nav>
        <div className="workspace-label">
          YOUR COMMUNITIES{" "}
          <span>{memberships.length.toString().padStart(2, "0")}</span>
        </div>
        <nav aria-label="Your communities">
          {memberships.map(({ community: c }) => (
            <Link key={c.id} href={`/communities/${c.slug}`}>
              <span className={`mini-community ${c.color}`}>{c.name[0]}</span>
              {c.name}
            </Link>
          ))}
          {!memberships.length && (
            <p className="sidebar-hint">
              Good things start with a few people. Find yours.
            </p>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="simulation-note">
            <Sparkles size={17} />
            <strong>Built for shared possibility.</strong>
            <p>Local demo · simulated funds</p>
            <span className="near-word">
              NEAR ecosystem project <ArrowUpRight size={12} />
            </span>
          </div>
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
            <Link className="button primary" href="/login">
              Sign in
            </Link>
          )}
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span className="topbar-label">
            <span className="live-dot" />A little together. A lot of
            possibility.
          </span>
          <div className="row">
            <span className="demo-label">
              <ShieldCheck size={14} />
              Simulated treasury
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
                Create account <ArrowUpRight size={14} />
              </Link>
            )}
          </div>
        </header>
        <main id="main" className="main-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Fundicate</span>
          <span>Fund together. Decide together.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/dashboard">
          <LayoutDashboard size={19} />
          Overview
        </Link>
        <Link href="/explore">
          <Compass size={19} />
          Explore
        </Link>
        <Link href="/communities/new">
          <Plus size={19} />
          Create
        </Link>
        <Link href={user ? "/settings/profile" : "/login"}>
          <Settings2 size={19} />
          Account
        </Link>
      </nav>
    </div>
  );
}
