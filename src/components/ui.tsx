import Link from "next/link";
import { ReactNode } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Users,
  Globe2,
  Check,
  Wallet,
  Vote,
  CircleDot,
  ShieldCheck,
  Network,
} from "lucide-react";
import { BrandMark } from "./network-art";
import { initials, moneyFormat, dateFormat, titleCase } from "@/lib/format";
import { AvatarImage } from "./avatar-image";
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`logo ${light ? "light" : ""}`}>
      <span className="logo-mark">
        <BrandMark />
      </span>
      fundicate<span className="logo-dot">.</span>
    </Link>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span />
      {children}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <Badge
      tone={
        ["OPEN", "ACTIVE", "APPROVED", "CONFIRMED", "EXECUTED"].includes(value)
          ? "green"
          : ["REJECTED", "REMOVED", "CANCELLED", "FAILED"].includes(value)
            ? "red"
            : "neutral"
      }
    >
      {titleCase(value)}
    </Badge>
  );
}
export function Avatar({
  name,
  small = false,
  url,
}: {
  name: string;
  small?: boolean;
  url?: string | null;
}) {
  if (url) return <AvatarImage key={url} name={name} url={url} small={small} />;
  return (
    <span className={`avatar ${small ? "small" : ""}`}>{initials(name)}</span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <CircleDot size={28} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
  icon = "wallet",
}: {
  label: string;
  value: string;
  detail: string;
  icon?: string;
}) {
  const Icon =
    icon === "users"
      ? Users
      : icon === "vote"
        ? Vote
        : icon === "shield"
          ? ShieldCheck
          : Wallet;
  return (
    <div className="stat">
      <div className="stat-top">
        {label}
        <Icon size={18} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
type CommunityCardData = {
  slug: string;
  name: string;
  description: string;
  color: string;
  currency: string;
  memberships?: { id: string }[];
  accounts?: { kind: string; balance: bigint }[];
  _count?: { memberships: number; proposals: number };
};
export function CommunityCard({
  community: c,
}: {
  community: CommunityCardData;
}) {
  return (
    <Link href={`/communities/${c.slug}`} className="community-card">
      <div className={`community-art ${c.color}`}>
        <div className="art-orbit" />
        <div className="art-orbit two" />
        {c.color === "blue" ? <Globe2 size={42} /> : <Network size={42} />}
        <span className="art-label">A little together goes a long way.</span>
      </div>
      <div className="community-card-body">
        <div className="row between">
          <h3>{c.name}</h3>
          <ArrowUpRight size={19} />
        </div>
        <p>{c.description}</p>
        <div className="community-meta">
          <span>
            <Users size={14} />
            {c._count?.memberships ?? c.memberships?.length ?? 0} members
          </span>
          <span>
            {moneyFormat(
              c.accounts?.find((a) => a.kind === "TREASURY")?.balance ?? 0n,
              c.currency,
            )}{" "}
            pooled
          </span>
        </div>
      </div>
    </Link>
  );
}
export function ProposalCard({
  proposal: p,
  slug,
  currency,
}: {
  proposal: {
    id: string;
    title: string;
    description: string;
    type: string;
    status: string;
    amount: bigint;
    closesAt: Date;
    votes?: { choice: string }[];
    _count?: { votes: number; eligibleVoters: number };
  };
  slug: string;
  currency: string;
}) {
  const yes = p.votes?.filter((v) => v.choice === "YES").length ?? 0;
  const total = p._count?.eligibleVoters ?? 0;
  return (
    <Link
      className="proposal-card"
      href={`/communities/${slug}/proposals/${p.id}`}
    >
      <div className="row between">
        <span className="eyebrow">{titleCase(p.type)}</span>
        <Status value={p.status} />
      </div>
      <h3>{p.title}</h3>
      <p>
        {p.description.slice(0, 130)}
        {p.description.length > 130 ? "…" : ""}
      </p>
      {p.amount > 0n && (
        <strong className="proposal-amount">
          {moneyFormat(p.amount, currency)}
        </strong>
      )}
      <div className="vote-bar">
        <span
          style={{ width: `${total ? Math.round((yes / total) * 100) : 0}%` }}
        />
      </div>
      <div className="row between muted small-text">
        <span>
          {p._count?.votes ?? p.votes?.length ?? 0} votes · {total} eligible
        </span>
        <span>Closes {dateFormat(p.closesAt)}</span>
      </div>
    </Link>
  );
}
export function TransactionTable({
  transactions,
}: {
  transactions: {
    id: string;
    type: string;
    amount: bigint;
    currency: string;
    status: string;
    createdAt: Date;
    initiatedBy: { displayName: string };
    proposal?: { title: string } | null;
  }[];
}) {
  return transactions.length ? (
    <div
      className="table-scroll"
      role="region"
      aria-label="Transaction history"
      tabIndex={0}
    >
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Initiated by</th>
            <th>Date (UTC)</th>
            <th>Status</th>
            <th className="align-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>
                <div className="transaction-name">
                  <span
                    className={`transaction-icon ${t.type === "CONTRIBUTION" ? "in" : "out"}`}
                  >
                    {t.type === "CONTRIBUTION" ? (
                      <ArrowDownLeft size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {t.type === "CONTRIBUTION"
                        ? "Member contribution"
                        : (t.proposal?.title ?? "Simulated payout")}
                    </strong>
                    <small className="mono">
                      {t.id.slice(0, 8)} · simulation
                    </small>
                  </div>
                </div>
              </td>
              <td>{t.initiatedBy.displayName}</td>
              <td>{dateFormat(t.createdAt)}</td>
              <td>
                <Status value={t.status} />
              </td>
              <td
                className={`align-right amount ${t.type === "CONTRIBUTION" ? "positive" : ""}`}
              >
                {t.type === "CONTRIBUTION" ? "+" : "−"}
                {moneyFormat(t.amount, t.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="A fresh start"
      description="Contributions and simulated payouts will appear here."
    />
  );
}
export function Rule({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rule">
      <span className="rule-icon">
        <Check size={16} />
      </span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function SectionTitle({
  title,
  href,
  label = "View all",
}: {
  title: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {href && (
        <Link href={href}>
          {label}
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
