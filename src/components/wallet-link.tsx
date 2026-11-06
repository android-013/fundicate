"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { testnetWallet, walletRequest } from "@/lib/near-client";
export function WalletLinkButton() {
  const [pending,setPending]=useState(false),[error,setError]=useState("");
  const router=useRouter();
  async function link() {
    setPending(true);setError("");
    try {
      const wallet=await testnetWallet();
      const [account]=await wallet.getAccounts({network:"testnet"});
      if(!account)throw new Error("Choose a NEAR testnet account in your wallet.");
      const challenge=await walletRequest("wallet-challenge",{accountId:account.accountId});
      const nonce=Uint8Array.from(atob(challenge.nonce),(c)=>c.charCodeAt(0));
      const proof=await wallet.signMessage({message:challenge.message,recipient:challenge.recipient,nonce,network:"testnet",signerId:account.accountId});
      await walletRequest("wallet-verify",{challengeId:challenge.id,accountId:proof.accountId,publicKey:proof.publicKey,signature:proof.signature});
      router.refresh();
    } catch(e) {setError(e instanceof Error ? e.message:"Wallet connection could not finish.");}
    finally {setPending(false);}
  }
  return <div><button type="button" className="button primary" disabled={pending} onClick={link}>{pending?"Waiting for wallet…":"Connect and verify testnet wallet"}</button>{error&&<p role="alert" className="form-error">{error}</p>}</div>;
}
