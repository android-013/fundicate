"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { nearAction, testnetConnector } from "@/lib/near-wallet-client";

export function NearWalletLogin() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function signIn() {
    setPending(true);
    setMessage("");
    try {
      const connector = await testnetConnector();
      const wallet = await connector.connect();
      const [account] = await wallet.getAccounts();
      if (!account) throw new Error("Select a testnet wallet account.");
      const challenge = await nearAction<{
        id: string;
        message: string;
        nonce: string;
        recipient: string;
      }>("wallet-login-challenge", { accountId: account.accountId });
      const signed = await wallet.signMessage({
        network: "testnet",
        signerId: account.accountId,
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: Uint8Array.from(atob(challenge.nonce), (byte) =>
          byte.charCodeAt(0),
        ),
      });
      if (!signed || signed.accountId !== account.accountId)
        throw new Error("Wallet sign-in was cancelled or the account changed.");
      await nearAction("wallet-login-verify", {
        challengeId: challenge.id,
        accountId: signed.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
      });
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Wallet sign-in did not complete.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-switch">
      <button
        type="button"
        className="button secondary"
        disabled={pending}
        onClick={signIn}
      >
        {pending ? "Waiting for wallet…" : "Continue with NEAR testnet"}
      </button>
      <p className="muted">
        New here? Your wallet creates your account. No email, password or
        transfer required.
      </p>
      <p role="status">{message}</p>
    </div>
  );
}
