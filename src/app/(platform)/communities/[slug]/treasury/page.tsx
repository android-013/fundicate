import Link from "next/link";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { moneyFormat } from "@/lib/format";
import { Empty, SectionTitle, Status, TransactionTable } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
export default async function Treasury({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community: c, isMember } = await communityContext(slug);
  const [transactions, allocations, targets, contributions, payouts] =
    await Promise.all([
      db.ledgerTransaction.findMany({
        where: { communityId: c.id },
        include: {
          initiatedBy: { select: { displayName: true } },
          proposal: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.proposal.findMany({
        where: { communityId: c.id, type: "FUNDING", status: "APPROVED" },
      }),
      db.proposal.findMany({
        where: { communityId: c.id, type: "FUNDRAISING", status: "APPROVED" },
      }),
      db.ledgerTransaction.aggregate({
        where: { communityId: c.id, type: "CONTRIBUTION" },
        _sum: { amount: true },
      }),
      db.ledgerTransaction.aggregate({
        where: { communityId: c.id, type: "PAYOUT" },
        _sum: { amount: true },
      }),
    ]);
  const balance = c.accounts.find((a) => a.kind === "TREASURY")?.balance ?? 0n;
  const approved = allocations.reduce((s, p) => s + p.amount, 0n);
  return (
    <>
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          <strong>This is a simulated treasury.</strong> Contributions and
          payouts are practice records. No money is collected, held or
          transferred. To document payments made elsewhere, use{" "}
          <Link href={`/communities/${slug}/payments`}>Payment records</Link>.
        </span>
      </div>
      <div className="two-column">
        <section className="treasury-hero">
          <div className="row between">
            <span className="eyebrow">THE POWER OF POOLING TOGETHER</span>
            <span className="tiny-pill">{c.currency}</span>
          </div>
          <small>Available treasury balance</small>
          <strong>{moneyFormat(balance, c.currency)}</strong>
          <p>Shared resources. Clear decisions. Every entry accounted for.</p>
          <div className="treasury-totals">
            <div>
              <small>Total contributed</small>
              <b>{moneyFormat(contributions._sum.amount ?? 0n, c.currency)}</b>
            </div>
            <div>
              <small>Simulated payouts</small>
              <b>{moneyFormat(payouts._sum.amount ?? 0n, c.currency)}</b>
            </div>
            <div>
              <small>Approved, unexecuted</small>
              <b>{moneyFormat(approved, c.currency)}</b>
            </div>
          </div>
        </section>
        <section className="panel padded">
          <span className="eyebrow">A LITTLE FROM YOU</span>
          <h2>Keep possibility growing.</h2>
          <p className="muted">
            Add a simulated contribution to the shared treasury. No payment
            details needed.
          </p>
          {isMember ? (
            <ActionForm
              operation="contribute"
              defaults={{ communityId: c.id }}
              submit="Record simulated contribution"
              confirm="Record this contribution as simulated funds? No real payment will occur."
            >
              <Field
                label={`Contribution amount (${c.currency})`}
                name="amount"
                type="number"
                min="0.01"
                max="9999999.99"
                defaultValue="25"
              />
            </ActionForm>
          ) : (
            <Link href={`/communities/${slug}`} className="button secondary">
              Join to contribute <ArrowUpRight size={15} />
            </Link>
          )}
        </section>
      </div>
      {targets.length > 0 && (
        <section className="panel padded">
          <SectionTitle title="Our fundraising goals" />
          {targets.map((t) => {
            const raised = contributions._sum.amount ?? 0n;
            const pct = Math.min(100, Number((raised * 100n) / t.amount));
            return (
              <div key={t.id} className="fundraising-goal">
                <div className="row between">
                  <Link href={`/communities/${slug}/proposals/${t.id}`}>
                    {t.title} ↗
                  </Link>
                  <strong>
                    {moneyFormat(raised, c.currency)} /{" "}
                    {moneyFormat(t.amount, c.currency)}
                  </strong>
                </div>
                <div className="vote-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <small className="muted">
                  {pct}% · measured against lifetime simulated contributions;
                  goals may overlap.
                </small>
              </div>
            );
          })}
        </section>
      )}
      <SectionTitle title="Approved allocations" />
      {allocations.length ? (
        <section className="panel padded">
          {allocations.map((p) => (
            <Link
              href={`/communities/${slug}/proposals/${p.id}`}
              className="list-row"
              key={p.id}
            >
              <div>
                <strong>{p.title}</strong>
                <small className="muted">
                  {p.recipient} · awaiting authorized simulation
                </small>
              </div>
              <span className="row">
                <strong>{moneyFormat(p.amount, c.currency)}</strong>
                <Status value={p.status} />
                <ArrowUpRight size={16} />
              </span>
            </Link>
          ))}
          <p className="muted small-text">
            Approval does not reserve funds. Each execution atomically checks
            the current available balance.
          </p>
        </section>
      ) : (
        <Empty
          title="No allocations waiting"
          description="Approved funding proposals appear here until an authorized simulated payout succeeds."
        />
      )}
      <section className="panel">
        <div className="padded-bottomless">
          <SectionTitle
            title="Every contribution. Every decision."
            href={`/communities/${slug}/activity`}
            label="Audit history"
          />
        </div>
        <TransactionTable transactions={transactions} />
      </section>
      <p className="muted small-text">
        Showing the latest 100 transactions. All historical records remain in
        PostgreSQL. Corrections must use compensating ledger entries; posted
        records cannot be edited or deleted.
      </p>
    </>
  );
}
