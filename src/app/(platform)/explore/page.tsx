import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { db } from "@/lib/db";
import { CommunityCard, Empty, PageHeading } from "@/components/ui";
export default async function Explore({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; welcome?: string }>;
}) {
  const { q = "", welcome } = await searchParams;
  const communities = await db.community.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q.slice(0, 100), mode: "insensitive" } },
            { description: { contains: q.slice(0, 100), mode: "insensitive" } },
          ],
        }
      : {},
    include: {
      accounts: true,
      _count: {
        select: {
          memberships: { where: { status: "ACTIVE" } },
          proposals: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return (
    <>
      {welcome && (
        <div className="notice">
          Your account is ready. Find your people below, or create a community
          of your own.
        </div>
      )}
      <PageHeading
        eyebrow="DISCOVER YOUR COLLECTIVE"
        title="Find where you belong."
        description="Shared interests. Collective ambition. A little more possibility."
        action={
          <Link className="button primary" href="/communities/new">
            Create community <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="explore-banner">
        <div>
          <span className="eyebrow">BETTER, TOGETHER</span>
          <h2>
            A shared goal is
            <br />a powerful place to start.
          </h2>
          <p>Find a community that believes in what you do.</p>
        </div>
        <div className="explore-circles" aria-hidden="true">
          <span>YOU</span>
          <span>US</span>
          <span>MORE</span>
        </div>
      </div>
      <div className="section-title">
        <h2>
          Explore communities{" "}
          <span className="count">{communities.length}</span>
        </h2>
        <form className="search-form">
          <Search size={17} />
          <input
            name="q"
            defaultValue={q}
            aria-label="Search communities"
            placeholder="Search by name or purpose"
          />
          <button className="text-button" type="submit">
            Search
          </button>
        </form>
      </div>
      {communities.length ? (
        <div className="cards-grid">
          {communities.map((c) => (
            <CommunityCard key={c.id} community={c} />
          ))}
        </div>
      ) : (
        <Empty
          title="No communities found"
          description="Try a different search, or start a community around your own idea."
        />
      )}
    </>
  );
}
