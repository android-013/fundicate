import { notFound } from "next/navigation";
import Link from "next/link";
import { NearPoolActions, NearPoolCreate } from "@/components/near-treasury";
import { PageHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatNativeAmount, type NativePlanItem } from "@/lib/chain-core";
import { getChainWorkspace } from "@/lib/chain-service";
import { communityContext } from "@/lib/community";
import { dateTime } from "@/lib/format";
import { uuid } from "@/lib/validation";

export default async function NativeTreasury({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pool?: string }>;
}) {
  if (process.env.FUNDICATE_MODE !== "near-testnet") notFound();
  const user = await requireUser();
  const { slug } = await params;
  const { community, isMember, isStaff } = await communityContext(slug);
  if (!isMember) notFound();
  const { pool } = await searchParams;
  if (pool !== undefined && !uuid.safeParse(pool).success) notFound();
  const { vaults, wallets, rounds } = await getChainWorkspace(
    user.id,
    community.id,
  );
  const selected = pool ? vaults.find((vault) => vault.id === pool) : vaults[0];
  if (pool && !selected) notFound();
  const now = new Date();
  return (
    <>
      <PageHeading
        title="NEAR testnet treasury"
        description="Run a wallet-approved testnet pool from a finalized Fundicate decision. Testnet balances and receipts have their own history."
        action={
          <Link className="button secondary" href="/settings/wallet">
            NEAR wallet settings
          </Link>
        }
      />
      {vaults.length > 0 && (
        <section className="panel padded">
          <h2>Native pools</h2>
          <div className="row wrap">
            {vaults.map((vault) => (
              <Link
                key={vault.id}
                className="button secondary"
                href={`/communities/${slug}/chain?pool=${vault.id}`}
                aria-current={vault.id === selected?.id ? "page" : undefined}
              >
                {vault.title}
              </Link>
            ))}
          </div>
        </section>
      )}
      {selected && (
        <>
          <section className="panel padded">
            <h2>{selected.title}</h2>
            <p>
              <Link href={`/communities/${slug}/rounds/${selected.roundId}`}>
                {selected.round.title}
              </Link>{" "}
              · {selected.contractId}
            </p>
            <details>
              <summary>Native payout recipients and caps</summary>
              {(
                selected.rulesSnapshot as unknown as {
                  caps: {
                    schemeId: string;
                    recipient: string;
                    request: string;
                  }[];
                }
              ).caps.map((cap) => (
                <div className="list-row" key={cap.schemeId}>
                  <span>{cap.recipient}</span>
                  <span>{formatNativeAmount(BigInt(cap.request))} NEAR</span>
                </div>
              ))}
            </details>
          </section>
          <NearPoolActions
            key={selected.id}
            communityId={community.id}
            vaultId={selected.id}
            canManage={isStaff}
            linkedWallets={wallets.map((wallet) => wallet.accountId)}
            collectionClosesAt={dateTime(selected.collectionClosesAt)}
            expiresAt={dateTime(selected.expiresAt)}
            collectionOpen={now < selected.collectionClosesAt}
            expired={now >= selected.expiresAt}
            plan={((selected.plan ?? []) as unknown as NativePlanItem[]).map(
              (item) => ({
                id: item.operation_id,
                recipient: item.recipient,
                kind: item.kind,
                amount: formatNativeAmount(BigInt(item.amount)),
              }),
            )}
            receipts={selected.operations
              .filter(
                (operation) =>
                  operation.actorId === user.id ||
                  operation.status === "CONFIRMED",
              )
              .map((operation) => ({
                id: operation.id,
                itemId:
                  operation.method === "execute"
                    ? (operation.args as { operation_id: string }).operation_id
                    : undefined,
                signer: operation.expectedSigner,
                kind: operation.kind,
                status: operation.status,
                hash: operation.transactionHash,
                own: operation.actorId === user.id,
              }))}
          />
        </>
      )}
      {isStaff && <NearPoolCreate communityId={community.id} rounds={rounds} />}
    </>
  );
}
