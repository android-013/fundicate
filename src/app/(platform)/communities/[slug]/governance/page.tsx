import Link from "next/link";
import { communityContext } from "@/lib/community";
import { Rule, SectionTitle, Avatar } from "@/components/ui";
export default async function Governance({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community: c, isMember, isStaff } = await communityContext(slug);
  return (
    <>
      <div className="section-title">
        <div>
          <h2>A fair way forward.</h2>
          <p className="muted">
            The rules we share, and the decisions we make together.
          </p>
        </div>
        {isMember && (isStaff || c.policy?.allowMemberProposals) && (
          <Link
            href={`/communities/${slug}/proposals/new`}
            className="button primary"
          >
            Propose a rule change ↗
          </Link>
        )}
      </div>
      <div className="two-column">
        <section className="panel padded">
          <Rule title="One member. One voice.">
            Every eligible active member, moderator, and administrator gets
            exactly one vote. Opening a ballot freezes its eligible voter
            snapshot.
          </Rule>
          <Rule title={`${c.policy!.quorumBps / 100}% participation quorum`}>
            Round the required number up to the next whole voter. Abstentions
            count for participation; yes/no votes determine approval. Invalid
            ballots are rejected.
          </Rule>
          <Rule
            title={
              c.policy!.thresholdBps === 5001
                ? "Simple majority for funding decisions"
                : `${c.policy!.thresholdBps / 100}% default approval threshold`
            }
          >
            A default majority means strictly more yes votes than no votes. Each
            proposal shows its own frozen threshold and deadline.
          </Rule>
          <Rule
            title={
              c.policy!.admissionPolicy === "VOTE"
                ? "Membership by community majority"
                : "Membership by recorded staff review"
            }
          >
            {c.policy!.admissionPolicy === "VOTE"
              ? "Staff review applications and open a majority ballot. Staff cannot bypass the vote. Applicants cannot vote on their own admission."
              : "Moderators and the administrator can record an approval or rejection with a review reason. No one can approve their own application."}
          </Rule>
          <Rule title="Removal requires a two-thirds vote">
            At least an exact two-thirds of valid yes/no votes, with the
            configured quorum. The subject cannot vote. Transfer authority
            before proposing removal of an administrator.
          </Rule>
          <Rule
            title={
              c.policy!.allowMemberProposals
                ? "Members can bring ideas forward"
                : "Staff manage proposal submissions"
            }
          >
            {c.policy!.allowMemberProposals
              ? "Members submit drafts for staff to open as formal ballots. Administrators and moderators may create and open agendas."
              : "Administrators and moderators create formal agendas. Changes to this permission must pass a governance vote."}
          </Rule>
        </section>
        <aside>
          <section className="panel padded">
            <SectionTitle title="Accountable leadership" />
            <div className="row">
              <Avatar name={c.admin.displayName} />
              <div>
                <strong>{c.admin.displayName}</strong>
                <small className="muted">Sole community administrator</small>
              </div>
            </div>
            <p className="muted">
              One administrator at all times, stored as a required community
              reference. Only the administrator may appoint moderators or
              explicitly transfer authority to an active member.
            </p>
            <Link href={`/communities/${slug}/members`} className="text-link">
              Meet the members ↗
            </Link>
          </section>
          <section className="panel padded">
            <SectionTitle title="Treasury safeguards" />
            <p className="muted">
              Every posted transaction has equal debits and credits. Execution
              checks available funds atomically and is idempotent. Approval
              never pretends a real payment has happened.
            </p>
            <Link href={`/communities/${slug}/treasury`} className="text-link">
              See the transparent treasury ↗
            </Link>
          </section>
          <section className="panel padded">
            <h3>When does a vote become final?</h3>
            <p className="muted">
              Staff can finalize after the closing time or after every eligible
              voter has cast a ballot. No partial ballot can be closed early.
              The server calculates the result and records the decision
              atomically.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
