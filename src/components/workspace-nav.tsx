"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  Network,
  Plus,
  Settings2,
} from "lucide-react";
export function WorkspaceNav({
  mobile = false,
  signedIn = false,
}: {
  mobile?: boolean;
  signedIn?: boolean;
}) {
  const path = usePathname();
  const items = [
    {
      href: "/dashboard",
      title: mobile ? "Home" : "Overview",
      icon: LayoutDashboard,
    },
    { href: "/analytics", title: "Analytics", icon: ChartNoAxesCombined },
    {
      href: "/explore",
      title: mobile ? "Explore" : "Discover communities",
      icon: Network,
    },
    {
      href: "/communities/new",
      title: mobile ? "Create" : "Create a community",
      icon: Plus,
    },
    ...(mobile
      ? [
          {
            href: signedIn ? "/settings/profile" : "/login",
            title: "Account",
            icon: Settings2,
          },
        ]
      : []),
  ];
  return (
    <nav
      className={mobile ? "mobile-nav" : "workspace-nav"}
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={
            path === item.href ||
            (item.href === "/analytics" && path.startsWith("/analytics/"))
              ? "nav-active"
              : ""
          }
          aria-current={path === item.href ? "page" : undefined}
        >
          <item.icon size={19} />
          <span>{item.title}</span>
          {item.href === "/analytics" && !mobile && <small>NEW</small>}
        </Link>
      ))}
    </nav>
  );
}
