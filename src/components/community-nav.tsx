"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function CommunityNav({ slug }: { slug: string }) {
  const path = usePathname();
  return (
    <nav className="community-tabs" aria-label="Community sections">
      {[
        { p: "", l: "Overview" },
        { p: "/members", l: "Members" },
        { p: "/treasury", l: "Treasury" },
        { p: "/proposals", l: "Proposals" },
        { p: "/rounds", l: "Funding rounds" },
        { p: "/reputation", l: "Reputation" },
        { p: "/templates", l: "Templates" },
        { p: "/chain", l: "NEAR testnet" },
        { p: "/governance", l: "Governance" },
        { p: "/activity", l: "Activity" },
      ].map((t) => {
        const href = `/communities/${slug}${t.p}`;
        return (
          <Link
            key={t.p}
            href={href}
            className={
              path === href || (t.p && path.startsWith(href)) ? "active" : ""
            }
            aria-current={path === href ? "page" : undefined}
          >
            {t.l}
          </Link>
        );
      })}
    </nav>
  );
}
