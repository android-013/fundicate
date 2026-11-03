import Link from "next/link";
import { Plus } from "lucide-react";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { Empty, ProposalCard, SectionTitle } from "@/components/ui";
export default async function Proposals({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { status } = await searchParams;
  const { community: c, isMember, isStaff } = await communityContext(slug);
  const filter = [
    "OPEN",
    "APPROVED",
    "EXECUTED",
    "REJECTED",
    "DRAFT",
    "CANCELLED",
  ].includes(status ?? "")
    ? status
    : undefined;
  const proposals = await db.proposal.findMany({
    where: {
      communityId: c.id,
      ...(filter ? { status: filter as "OPEN" } : {}),
    },
    include: {
      votes: true,
      _count: { select: { votes: true, eligibleVoters: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <div className="section-title">
        <div>
          <h2>Ideas that move us forward.</h2>
          <p className="muted">
            Clear proposals. Fair votes. A shared next chapter.
          </p>
        </div>
        {isMember && (isStaff || c.policy?.allowMemberProposals) && (
          <Link
            className="button primary"
            href={`/communities/${slug}/proposals/new`}
          >
            <Plus size={17} />
            New proposal
          </Link>
        )}
      </div>
      <div className="filter-pills">
        {[
          { s: "", l: "All proposals" },
          { s: "OPEN", l: "Open for voting" },
          { s: "APPROVED", l: "Approved" },
          { s: "EXECUTED", l: "Executed" },
          { s: "DRAFT", l: "Drafts" },
          { s: "REJECTED", l: "Rejected" },
        ].map((f) => (
          <Link
            key={f.s}
            className={(!status && !f.s) || status === f.s ? "selected" : ""}
            href={`/communities/${slug}/proposals${f.s ? `?status=${f.s}` : ""}`}
          >
            {f.l}
          </Link>
        ))}
      </div>
      <SectionTitle
        title={`${proposals.length} ${proposals.length === 1 ? "proposal" : "proposals"}`}
      />
      {proposals.length ? (
        <div className="proposal-grid">
          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              slug={slug}
              currency={c.currency}
            />
          ))}
        </div>
      ) : (
        <Empty
          title="A blank page for a good idea"
          description="No proposals match this view. Bring an idea to your community."
        />
      )}
    </>
  );
}
