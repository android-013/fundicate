import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser, hashToken, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionButton } from "@/components/forms";
import { PageHeading, Badge } from "@/components/ui";
import { dateTime } from "@/lib/format";
export default async function Security() {
  const user = await requireUser();
  const token = (await cookies()).get(sessionCookie)?.value ?? "";
  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeading
        eyebrow="YOUR ACCOUNT, YOUR CONTROL"
        title="Keep your account secure."
        description="Manage active sessions and revoke access you no longer need."
      />
      <div className="settings-nav">
        <Link href="/settings/profile">Profile</Link>
        <Link className="selected" href="/settings/security">
          Security
        </Link>
      </div>
      <section className="panel padded narrow">
        <h2>Active sessions</h2>
        <p className="muted">
          Sessions expire after seven days. Signing out revokes the current
          session immediately.
        </p>
        {sessions.map((s) => (
          <div className="list-row" key={s.id}>
            <div>
              <strong>Signed in {dateTime(s.createdAt)}</strong>
              <small className="muted">Expires {dateTime(s.expiresAt)}</small>
            </div>
            {s.tokenHash === hashToken(token) ? (
              <Badge tone="green">This session</Badge>
            ) : (
              <ActionButton
                operation="revoke-session"
                body={{ sessionId: s.id }}
              >
                Revoke
              </ActionButton>
            )}
          </div>
        ))}
        <ActionButton
          operation="revoke-sessions"
          body={{}}
          confirm="Sign out every other active session?"
        >
          Sign out other sessions
        </ActionButton>
      </section>
      <section className="panel padded narrow">
        <h3>Password protection</h3>
        <p className="muted">
          Passwords are protected with salted scrypt hashing. Sign-in is rate
          limited, and sessions use an HttpOnly cookie. Password reset and email
          verification are outside this local MVP.
        </p>
      </section>
    </>
  );
}
