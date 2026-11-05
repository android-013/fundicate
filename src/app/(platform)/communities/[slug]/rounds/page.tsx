import Link from "next/link";
import { Plus, Layers3, ArrowUpRight } from "lucide-react";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Empty, Status } from "@/components/ui";
export default async function FundingRounds({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { community: c, isStaff } = await communityContext(slug);
  const raw = Number((await searchParams).page ?? 1);
  const page = Number.isInteger(raw) && raw > 0 && raw <= 10000 ? raw : 1;
  const rows = await db.fundingRound.findMany({
    where: {
      communityId: c.id,
      ...(!isStaff
        ? {
            status: {
              notIn: ["DRAFT", "CANCELLED"] as ("DRAFT" | "CANCELLED")[],
            },
          }
        : {}),
    },
    include: { _count: { select: { schemes: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * 20,
    take: 21,
  });
  return (
    <>
      <div className="section-title">
        <div>
          <h2>Many ideas. One shared direction.</h2>
          <p className="muted">
            Collect schemes, screen them fairly, then choose together.
          </p>
        </div>
        {isStaff && (
          <Link
            className="button primary"
            href={`/communities/${slug}/rounds/new`}
          >
            <Plus size={17} />
            New funding round
          </Link>
        )}
      </div>
      <div className="notice">
        <Layers3 size={19} />
        <span>
          Funding rounds bring competing schemes into one decision. Your
          existing{" "}
          <Link href={`/communities/${slug}/proposals`}>proposals</Link> remain
          available.
        </span>
      </div>
      {rows.length ? (
        <div className="round-list">
          {rows.slice(0, 20).map((r) => (
            <Link
              key={r.id}
              href={`/communities/${slug}/rounds/${r.id}`}
              className="panel round-card"
            >
              <div className="row between">
                <Status value={r.status} />
                <ArrowUpRight size={20} />
              </div>
              <h3>{r.title}</h3>
              <p>{r.description.slice(0, 180)}</p>
              <div className="round-card-meta">
                <span>{r._count.schemes} schemes</span>
                <span>Submissions close {dateTime(r.submissionsCloseAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="Give your next decision room to grow"
          description="Funding rounds collect multiple schemes before the community screens and selects them."
        />
      )}
      <nav
        className="row between round-pagination"
        aria-label="Funding round pages"
      >
        {page > 1 ? (
          <Link className="button secondary" href={`?page=${page - 1}`}>
            Previous page
          </Link>
        ) : (
          <span />
        )}
        <span className="muted">Page {page}</span>
        {rows.length > 20 ? (
          <Link className="button secondary" href={`?page=${page + 1}`}>
            Next page
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
