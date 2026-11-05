import { redirect } from "next/navigation";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { ProposalForm } from "@/components/forms";
import { PageHeading, Rule } from "@/components/ui";
export default async function NewProposal({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { slug } = await params;
  const { type } = await searchParams;
  const {
    community: c,
    user,
    isMember,
    isStaff,
  } = await communityContext(slug);
  if (!user) redirect("/login");
  const strict = c.governanceProfile === "STRICT";
  const removalOnly = strict && !isStaff && !c.policy?.allowMemberProposals;
  if (!isMember || (!strict && !isStaff && !c.policy?.allowMemberProposals))
    return (
      <div className="notice">
        An active membership with proposal submission permission is required.
      </div>
    );
  const [members, successors] = await Promise.all([
    db.communityMembership.findMany({
      where: {
        communityId: c.id,
        status: { in: ["ACTIVE", "SUSPENDED"] },
        userId: { notIn: strict ? [user.id] : [c.adminId, user.id] },
      },
      include: { user: { select: { displayName: true } } },
    }),
    strict
      ? db.communityMembership.findMany({
          where: {
            communityId: c.id,
            status: "ACTIVE",
            userId: { not: c.adminId },
          },
          include: { user: { select: { displayName: true } } },
        })
      : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="TURN AN IDEA INTO OUR NEXT STEP"
        title="Put possibility on the table."
        description="Be specific about the purpose, the resources, and the outcome you hope to create."
      />
      <div className="two-column form-layout">
        <section className="panel padded">
          <ProposalForm
            communityId={c.id}
            quorumBps={c.policy!.quorumBps}
            thresholdBps={c.policy!.thresholdBps}
            members={members.map((m) => ({
              id: m.userId,
              name: m.user.displayName,
            }))}
            isStaff={isStaff}
            governanceProfile={strict ? "STRICT" : "LEGACY"}
            adminId={c.adminId}
            successors={successors.map((m) => ({
              id: m.userId,
              name: m.user.displayName,
            }))}
            removalOnly={removalOnly}
            initialType={type === "REMOVAL" ? "REMOVAL" : "FUNDING"}
          />
        </section>
        <aside className="panel padded fit">
          <h2>Make a clear case.</h2>
          <Rule title="One proposal, one decision">
            Explain what you want the community to approve and why it matters.
          </Rule>
          <Rule title="Rules are frozen at opening">
            The eligible voter list, quorum, and threshold stay consistent for
            this ballot.
          </Rule>
          <Rule title="Abstentions count for participation">
            Approval is calculated from yes/no votes. Abstentions count only
            toward quorum.
          </Rule>
          <Rule title="Approval comes before execution">
            Funding votes approve an allocation. A separate authorized action
            records a simulated payout.
          </Rule>
          {strict && (
            <Rule title="Accountable administration">
              Administrator removal publishes its successor before voting. Any
              active member can open and finalize that ballot. Authority
              transfer and successor departure are locked while it is open.
            </Rule>
          )}
        </aside>
      </div>
    </>
  );
}
