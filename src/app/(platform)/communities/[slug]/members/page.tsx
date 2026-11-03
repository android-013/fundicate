import Link from "next/link";
import { communityContext } from "@/lib/community";
import { db } from "@/lib/db";
import { Avatar, Empty, SectionTitle, Status, Badge } from "@/components/ui";
import {
  ActionButton,
  ActionForm,
  Select,
  TextArea,
  Field,
} from "@/components/forms";
import { dateFormat, moneyFormat } from "@/lib/format";
export default async function Members({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const {
    community: c,
    user,
    isStaff,
    isAdmin,
    isMember,
  } = await communityContext(slug);
  const [members, applications] = await Promise.all([
    db.communityMembership.findMany({
      where: { communityId: c.id },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    isStaff
      ? db.membershipApplication.findMany({
          where: { communityId: c.id },
          include: {
            user: { select: { displayName: true } },
            answers: { include: { question: true } },
            proposal: true,
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
  ]);
  return (
    <>
      <SectionTitle title="The people behind the possibility" />
      <section className="panel">
        <div
          className="table-scroll"
          role="region"
          aria-label="Community members"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Membership</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div className="row">
                      <Avatar
                        name={m.user.displayName}
                        url={m.user.avatarUrl}
                        small
                      />
                      <div>
                        <strong>{m.user.displayName}</strong>
                        <small className="muted">@{m.user.username}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={c.adminId === m.userId ? "green" : "neutral"}>
                      {c.adminId === m.userId
                        ? "Administrator"
                        : m.role === "MODERATOR"
                          ? "Moderator"
                          : "Member"}
                    </Badge>
                  </td>
                  <td>
                    <Status value={m.status} />
                  </td>
                  <td>{dateFormat(m.joinedAt)}</td>
                  <td>
                    {isAdmin &&
                      m.userId !== c.adminId &&
                      m.status === "ACTIVE" && (
                        <ActionButton
                          operation="member"
                          body={{
                            communityId: c.id,
                            userId: m.userId,
                            action:
                              m.role === "MODERATOR" ? "member" : "moderator",
                          }}
                          className="text-button"
                          confirm={`Change ${m.user.displayName}’s community role?`}
                        >
                          {m.role === "MODERATOR"
                            ? "Remove moderator role"
                            : "Make moderator"}
                        </ActionButton>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {isStaff && (
        <>
          <SectionTitle title="Membership applications" />
          {applications.length ? (
            applications.map((a) => (
              <section key={a.id} className="panel padded">
                <div className="row between">
                  <div className="row">
                    <Avatar name={a.user.displayName} />
                    <div>
                      <h3>{a.user.displayName}</h3>
                      <small className="muted">
                        Pledged{" "}
                        {moneyFormat(a.proposedContribution, c.currency)} ·{" "}
                        {dateFormat(a.createdAt)}
                      </small>
                    </div>
                  </div>
                  <Status value={a.status} />
                </div>
                <p className="prewrap">{a.introduction}</p>
                {a.answers.map((answer) => (
                  <div className="answer" key={answer.id}>
                    <strong>{answer.question.prompt}</strong>
                    <p>{answer.answer}</p>
                  </div>
                ))}
                {a.proposal ? (
                  <Link
                    href={`/communities/${slug}/proposals/${a.proposal.id}`}
                    className="text-link"
                  >
                    View membership ballot ↗
                  </Link>
                ) : a.status === "PENDING" ? (
                  <ActionForm
                    operation="review"
                    defaults={{ communityId: c.id, applicationId: a.id }}
                    submit={
                      c.policy?.admissionPolicy === "VOTE"
                        ? "Open membership vote"
                        : "Record review"
                    }
                  >
                    {c.policy?.admissionPolicy === "VOTE" ? (
                      <input type="hidden" name="decision" value="ballot" />
                    ) : (
                      <Select
                        label="Decision"
                        name="decision"
                        options={[
                          { value: "approve", label: "Approve membership" },
                          { value: "reject", label: "Reject membership" },
                        ]}
                      />
                    )}
                    <TextArea
                      label="Review note"
                      name="reason"
                      placeholder="Explain your review for the audit trail."
                    />
                  </ActionForm>
                ) : null}
              </section>
            ))
          ) : (
            <Empty
              title="No applications yet"
              description="People who apply to join will appear here for review."
            />
          )}
        </>
      )}
      {isStaff && (
        <section className="panel padded">
          <h2>Emergency safety review</h2>
          <p className="muted">
            Suspend access only for immediate safety or fraud concerns. This
            records the reason and automatically opens a three-day community
            ballot to review restoring access. Formal removal requires a
            separate two-thirds vote.
          </p>
          <ActionForm
            operation="member"
            defaults={{ communityId: c.id, action: "suspend" }}
            submit="Suspend and open review"
            confirm="Suspend this member’s access and open a recorded review ballot?"
          >
            <Select
              label="Member"
              name="userId"
              options={members
                .filter(
                  (m) =>
                    m.status === "ACTIVE" &&
                    m.userId !== c.adminId &&
                    m.userId !== user?.id,
                )
                .map((m) => ({ value: m.userId, label: m.user.displayName }))}
            />
            <TextArea name="reason" label="Detailed safety or fraud reason" />
          </ActionForm>
        </section>
      )}
      {isAdmin && (
        <section className="panel padded">
          <h2>Transfer administrative authority</h2>
          <p className="muted">
            This immediately makes the selected active member the sole
            administrator. Your access becomes your underlying member or
            moderator role.
          </p>
          <ActionForm
            operation="member"
            defaults={{ communityId: c.id, action: "transfer" }}
            submit="Transfer authority"
            confirm="Transfer sole administrative authority? This change takes effect immediately."
          >
            <Select
              label="New administrator"
              name="userId"
              options={members
                .filter((m) => m.status === "ACTIVE" && m.userId !== c.adminId)
                .map((m) => ({ value: m.userId, label: m.user.displayName }))}
            />
            <Field name="confirmName" label={`Type “${c.name}” to confirm`} />
          </ActionForm>
        </section>
      )}
      {isMember && !isAdmin && (
        <section className="panel padded">
          <h3>Leave this community</h3>
          <p className="muted">
            Your historical votes, contributions, and financial records remain
            in the audit history.
          </p>
          <ActionButton
            operation="member"
            body={{ communityId: c.id, userId: user!.id, action: "leave" }}
            confirm="Leave this community? Your historical records will be preserved."
          >
            Leave community
          </ActionButton>
        </section>
      )}
      {!isMember && (
        <p className="notice">
          Membership applications and safety controls are visible to authorized
          community staff.{" "}
          <Link href={`/communities/${slug}`}>
            View your membership or apply to join →
          </Link>
        </p>
      )}
    </>
  );
}
