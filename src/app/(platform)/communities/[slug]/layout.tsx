import Link from "next/link";
import { ArrowLeft, Leaf, Users, Globe2 } from "lucide-react";
import { communityContext } from "@/lib/community";
import { Badge } from "@/components/ui";
import { CommunityNav } from "@/components/community-nav";
export default async function CommunityLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const {
    community: c,
    isMember,
    membership,
    isAdmin,
  } = await communityContext(slug);
  return (
    <>
      <Link href="/explore" className="back-link">
        <ArrowLeft size={15} />
        All communities
      </Link>
      <div className="community-header">
        <span className={`community-symbol ${c.color}`}>
          {c.color === "blue" ? <Globe2 size={31} /> : <Leaf size={31} />}
        </span>
        <div>
          <div className="row">
            <h1>{c.name}</h1>
            <Badge tone="green">
              {isMember
                ? isAdmin
                  ? "Administrator"
                  : membership?.role === "MODERATOR"
                    ? "Moderator"
                    : "Member"
                : "Public community"}
            </Badge>
          </div>
          <p>{c.description}</p>
          <span className="community-subline">
            <Users size={14} />
            {c._count.memberships} active members <span>·</span> {c.currency}{" "}
            treasury <span>·</span> Simulated funds
          </span>
        </div>
      </div>
      <CommunityNav slug={slug} />
      {children}
    </>
  );
}
