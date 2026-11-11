"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { nearAction, testnetConnector } from "@/lib/near-wallet-client";

export function NearWalletLink() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [accountId, setAccountId] = useState("");

  async function chooseWallet() {
    setPending(true);
    setMessage("");
    try {
      const connector = await testnetConnector();
      const wallet = await connector.connect();
      const [account] = await wallet.getAccounts();
      if (!account) throw new Error("Select a testnet wallet account.");
      setAccountId(account.accountId);
    } catch {
      setMessage(
        "Wallet connection did not complete. Open the testnet wallet chooser again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function linkWallet() {
    setPending(true);
    setMessage("");
    try {
      const connector = await testnetConnector();
      const { wallet, accounts } = await connector.getConnectedWallet();
      if (!accounts.some((account) => account.accountId === accountId))
        throw new Error("Reconnect the selected testnet account.");
      const challenge = await nearAction<{
        id: string;
        message: string;
        recipient: string;
        nonce: string;
      }>("wallet-challenge", { accountId });
      const signed = await wallet.signMessage({
        network: "testnet",
        signerId: accountId,
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: Uint8Array.from(atob(challenge.nonce), (byte) =>
          byte.charCodeAt(0),
        ),
      });
      if (signed?.accountId !== accountId)
        throw new Error(
          "The signed account differs from the selected account.",
        );
      await nearAction("wallet-verify", {
        challengeId: challenge.id,
        accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
      });
      setMessage("Testnet wallet verified and linked.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet verification did not complete.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="row wrap">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={chooseWallet}
        >
          Choose testnet wallet
        </button>
        {accountId && (
          <button
            type="button"
            className="button primary"
            disabled={pending}
            onClick={linkWallet}
          >
            Sign to link {accountId}
          </button>
        )}
      </div>
      <p role="status" className="muted">
        {message}
      </p>
    </>
  );
}
