import { redirect } from "next/navigation";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { ProposalForm } from "@/components/forms";
import { PageHeading, Rule } from "@/components/ui";
export default async function NewProposal({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const {
    community: c,
    user,
    isMember,
    isStaff,
  } = await communityContext(slug);
  if (!user) redirect("/login");
  if (!isMember || (!isStaff && !c.policy?.allowMemberProposals))
    return (
      <div className="notice">
        An active membership with proposal submission permission is required.
      </div>
    );
  const members = await db.communityMembership.findMany({
    where: {
      communityId: c.id,
      status: { in: ["ACTIVE", "SUSPENDED"] },
      userId: { notIn: [c.adminId, user.id] },
    },
    include: { user: true },
  });
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
        </aside>
      </div>
    </>
  );
}
