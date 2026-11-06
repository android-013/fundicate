import { communityContext } from "@/lib/community";
import { requireUser } from "@/lib/auth";
import { getChainWorkspace } from "@/lib/chain-service";
import { ChainWorkspace } from "@/components/chain-workspace";
import { PageHeading } from "@/components/ui";
import type { NativePlanItem } from "@/lib/chain-core";
export default async function NativeTreasury({params}:{params:Promise<{slug:string}>}) {
  const user=await requireUser();const {slug}=await params;const {community}=await communityContext(slug);
  const view=await getChainWorkspace(user.id,community.id);
  return <><PageHeading eyebrow="EXPLICIT ASSETS, VERIFIED RECEIPTS" title="NEAR testnet pools" description="Optional native custody with wallet approvals and independent finality observations."/><ChainWorkspace communityId={community.id} enabled={view.enabled} wallets={view.wallets} rounds={view.rounds} vaults={view.vaults.map(v=>({id:v.id,title:v.title,collectionClosesAt:v.collectionClosesAt.toISOString(),expiresAt:v.expiresAt.toISOString(),contractId:v.contractId,plan:v.plan as NativePlanItem[]|null,operations:v.operations.slice(0,200).map(o=>({id:o.id,kind:o.kind,status:o.status,amount:o.amount.toFixed(0),recipient:o.recipient,transactionHash:o.transactionHash,expectedSigner:o.expectedSigner}))}))}/></>;
}
