import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { WalletLinkButton } from "@/components/wallet-link";
import { ActionButton } from "@/components/forms";
import { PageHeading, Badge } from "@/components/ui";
export default async function WalletSettings() {
  const user=await requireUser();
  const links=await db.walletLink.findMany({where:{userId:user.id,revokedAt:null},orderBy:{verifiedAt:"desc"}});
  return <><PageHeading eyebrow="YOUR WALLET, YOUR APPROVAL" title="Connect to NEAR testnet." description="Fundicate works without a wallet. Linking one enables native testnet pools and never converts simulated balances." />
    <section className="panel padded narrow"><h2>Prove wallet ownership</h2><p>First <Link href="/settings/security">confirm your password in Security</Link>. Then approve a five-minute, single-use message in your wallet. No private key or recovery phrase is sent to Fundicate.</p><WalletLinkButton /><p className="muted">Only NEAR testnet is enabled. The wallet connector loads supported wallet integrations; review the selected wallet’s origin before signing.</p></section>
    <section className="panel padded narrow"><h2>Verified wallets</h2>{links.length===0?<p>No wallets linked. Your standalone communities and simulated treasury remain available.</p>:links.map(link=><div key={link.id} className="list-row"><div><strong className="mono">{link.accountId}</strong><Badge tone="green">Testnet · ownership verified</Badge></div><ActionButton operation="wallet-revoke" body={{id:link.id}} confirm="Revoke this wallet link? Its transfer history will remain.">Revoke link</ActionButton></div>)}</section></>;
}
