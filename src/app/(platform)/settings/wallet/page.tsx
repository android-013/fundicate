import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionButton } from "@/components/forms";
import { NearWalletLink } from "@/components/near-wallet-link";
import { PageHeading } from "@/components/ui";
import { walletLoginEnabled } from "@/lib/wallet-auth-config";
import { NearWalletLogin } from "@/components/near-wallet-login";

export default async function WalletSettings() {
  if (!walletLoginEnabled() && process.env.FUNDICATE_MODE !== "near-testnet")
    notFound();
  const user = await requireUser();
  const wallets = await db.walletLink.findMany({
    where: { userId: user.id, network: "testnet", revokedAt: null },
    select: { id: true, accountId: true },
    orderBy: { verifiedAt: "desc" },
  });
  return (
    <>
      <PageHeading
        title="NEAR testnet wallets"
        description="Link a wallet to this Fundicate account with a signed ownership message."
      />
      <div className="settings-nav">
        <Link href="/settings/security">Security</Link>
        <Link href="/settings/wallet" className="selected" aria-current="page">
          NEAR wallets
        </Link>
      </div>
      <section className="panel padded narrow">
        <h2>1. Confirm your identity</h2>
        <NearWalletLogin />
      </section>
      <section className="panel padded narrow">
        <h2>2. Connect and verify your wallet</h2>
        <p className="muted">
          Select your testnet account and approve the ownership message in your
          wallet. Once linked, use it to sign in. Signing a message authorizes
          no transfer.
        </p>
        <NearWalletLink />
      </section>
      <section className="panel padded narrow">
        <h2>Linked testnet wallets</h2>
        {wallets.length === 0 && (
          <p className="muted">Link your first testnet wallet above.</p>
        )}
        {wallets.map((wallet) => (
          <div key={wallet.id} className="list-row">
            <strong>{wallet.accountId}</strong>
            <ActionButton
              operation="wallet-revoke"
              body={{ id: wallet.id }}
              confirm="Revoke this Fundicate wallet link?"
            >
              Revoke link
            </ActionButton>
          </div>
        ))}
      </section>
    </>
  );
}
