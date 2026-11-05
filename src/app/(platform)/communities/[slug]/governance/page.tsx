import Link from "next/link";
import { communityContext } from "@/lib/community";
import { Rule, SectionTitle, Avatar, Badge } from "@/components/ui";
export default async function Governance({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { community: c, isMember, isStaff } = await communityContext(slug);
  const strict = c.governanceProfile === "STRICT";
  return (
    <>
      <div className="section-title">
        <div>
          <h2>A fair way forward.</h2>
          <Badge tone={strict ? "green" : "neutral"}>
            {strict ? "Strict member governance" : "Legacy governance"}
          </Badge>
          <p className="muted">
            The rules we share, and the decisions we make together.
          </p>
        </div>
        {isMember && (isStaff || c.policy?.allowMemberProposals || strict) && (
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
          <Rule
            title={
              strict
                ? "Member governed, including leadership"
                : "A versioned legacy profile"
            }
          >
            {strict
              ? "The founder and admitted members declare a contribution pledge. Admission always requires a majority ballot. Staff cannot unilaterally suspend members or remove their voting rights."
              : "This community preserves its existing review, emergency suspension review, and authority transfer features. Historical contribution declarations that were never recorded remain unknown."}{" "}
            Declarations record intent; only confirmed deposit receipts count as
            received funds.
          </Rule>
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
            configured quorum. The subject cannot vote.{" "}
            {strict
              ? "Any active member can open an administrator-removal ballot with a published active successor. Approval removes the incumbent and transfers authority atomically. The incumbent cannot block the ballot."
              : "Transfer authority before proposing removal of an administrator."}
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
            {strict &&
              " Active members can always bring an administrator-removal ballot with a nominated successor."}
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
              explicitly transfer authority to an active member.{" "}
              {strict &&
                "An approved administrator-removal ballot can also appoint its published successor. While that ballot is open, direct authority transfer and the successor’s departure or removal are locked."}
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
              {strict &&
                " Any active member can finalize an administrator-removal ballot under the same deadline rules."}
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
