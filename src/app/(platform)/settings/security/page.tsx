import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser, hashToken, sessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionButton } from "@/components/forms";
import { PageHeading, Badge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { NearWalletLogin } from "@/components/near-wallet-login";
import { walletLoginEnabled } from "@/lib/wallet-auth-config";
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
        {(walletLoginEnabled() ||
          process.env.FUNDICATE_MODE === "near-testnet") && (
          <Link href="/settings/wallet">NEAR wallets</Link>
        )}
      </div>
      <section className="panel padded narrow">
        <h2>Confirm a sensitive action</h2>
        <p className="muted">
          Identity confirmation lasts five minutes for this session. Authority
          changes and sensitive payment-record actions require it.
        </p>
        <NearWalletLogin />
      </section>
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
        <h3>Account protection</h3>
        <p className="muted">
          Sign-in is rate limited and sessions use an HttpOnly cookie. Accounts
          require access to a linked wallet; keep your wallet recovery method
          safe. Existing password accounts use salted scrypt hashing.
        </p>
      </section>
    </>
  );
}
