"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { Field } from "@/components/forms";
import type { PreparedTransfer } from "@/lib/chain-core";
import { nearAction, testnetConnector } from "@/lib/near-wallet-client";

type SourceRound = {
  id: string;
  title: string;
  schemes: { id: string; title: string }[];
};
type Receipt = {
  id: string;
  itemId?: string;
  kind: string;
  signer: string;
  status: string;
  hash: string | null;
  own: boolean;
};
type Allocation = {
  id: string;
  kind: "PAYOUT" | "REFUND";
  recipient: string;
  amount: string;
};
type NearAction =
  "register" | "reserve" | "deposit" | "commit" | "execute" | "recover";

export function NearPoolCreate({
  communityId,
  rounds,
}: {
  communityId: string;
  rounds: SourceRound[];
}) {
  const router = useRouter();
  const [roundId, setRoundId] = useState(rounds[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const fieldId = useId();
  const round = rounds.find((item) => item.id === roundId);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!round) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      await nearAction("chain-create", {
        communityId,
        roundId,
        title: fields.get("title"),
        collectionMinutes: Number(fields.get("minutes")),
        caps: round.schemes.map((scheme) => ({
          schemeId: scheme.id,
          recipient: fields.get(`recipient-${scheme.id}`),
          request: fields.get(`cap-${scheme.id}`),
        })),
      });
      setMessage(
        "Pool saved. Register it with the treasury controller wallet.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Pool creation did not complete.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel padded">
      <h2>Create a testnet pool</h2>
      {round ? (
        <>
          <p className="muted">
            Use a finalized V4 decision. Set fresh NEAR caps and recipients for
            this pool. Confirm your password in{" "}
            <Link href="/settings/security">Security</Link> before creating it.
          </p>
          <form className="stack" onSubmit={create}>
            <label className="field" htmlFor={fieldId}>
              Source decision
              <select
                id={fieldId}
                value={roundId}
                onChange={(event) => setRoundId(event.target.value)}
              >
                {rounds.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Pool title"
              name="title"
              defaultValue="NEAR testnet demo"
              required
              maxLength={120}
            />
            <Field
              label="Collection length in minutes"
              name="minutes"
              type="number"
              defaultValue="10"
              min={1}
              max={43199}
              step={1}
              required
            />
            {round.schemes.map((scheme) => (
              <fieldset className="panel padded" key={scheme.id}>
                <legend>{scheme.title}</legend>
                <Field
                  label="Recipient NEAR account"
                  name={`recipient-${scheme.id}`}
                  required
                  maxLength={64}
                />
                <Field
                  label="Maximum payout in NEAR"
                  name={`cap-${scheme.id}`}
                  required
                  maxLength={40}
                />
              </fieldset>
            ))}
            <button type="submit" className="button primary" disabled={pending}>
              Create pool
            </button>
          </form>
        </>
      ) : (
        <p className="muted">
          Finalize an unrejected V4 round with an approved allocation first.
        </p>
      )}
      <p className="muted" role="status">
        {message}
      </p>
    </section>
  );
}

export function NearPoolActions({
  communityId,
  vaultId,
  canManage,
  linkedWallets,
  receipts,
  plan,
  collectionClosesAt,
  expiresAt,
  collectionOpen,
  expired,
}: {
  communityId: string;
  vaultId: string;
  canManage: boolean;
  linkedWallets: string[];
  receipts: Receipt[];
  plan: Allocation[];
  collectionClosesAt: string;
  expiresAt: string;
  collectionOpen: boolean;
  expired: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [recentHash, setRecentHash] = useState<{ id: string; hash: string }>();
  const registered = receipts.some(
    (receipt) => receipt.kind === "REGISTER" && receipt.status === "CONFIRMED",
  );
  const planConfirmed = receipts.some(
    (receipt) =>
      ["COMMIT", "RECOVER"].includes(receipt.kind) &&
      receipt.status === "CONFIRMED",
  );
  const confirmed = (item: Allocation) =>
    receipts.some(
      (receipt) => receipt.itemId === item.id && receipt.status === "CONFIRMED",
    );

  async function reconcile(operationId: string, transactionHash?: string) {
    if (transactionHash)
      await nearAction("chain-submitted", { operationId, transactionHash });
    const result = await nearAction<{ status: string }>("chain-reconcile", {
      operationId,
    });
    setMessage(`Receipt status: ${result.status}.`);
  }

  async function sign(
    action: NearAction,
    fields: { amount?: string; operationId?: string } = {},
  ) {
    setPending(true);
    setMessage("");
    let started = false;
    try {
      const connector = await testnetConnector();
      const { wallet, accounts } = await connector
        .getConnectedWallet()
        .catch(() => {
          throw new Error(
            "Connect a linked wallet in NEAR wallet settings first.",
          );
        });
      const account = accounts.find((item) =>
        linkedWallets.includes(item.accountId),
      );
      if (!account)
        throw new Error(
          "Link the selected wallet in NEAR wallet settings first.",
        );
      const prepared = await nearAction<PreparedTransfer>("chain-prepare", {
        communityId,
        vaultId,
        accountId: account.accountId,
        action,
        ...fields,
        idempotencyKey: crypto.randomUUID(),
      });
      const instruction = await nearAction<PreparedTransfer>(
        "chain-authorize",
        { operationId: prepared.operationId },
      );
      started = true;
      const outcome = await wallet.signAndSendTransaction({
        network: "testnet",
        signerId: instruction.signerId,
        receiverId: instruction.contractId,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: instruction.method,
              args: instruction.args,
              gas: instruction.gas,
              deposit: instruction.deposit,
            },
          },
        ],
      });
      const hash = outcome?.transaction?.hash;
      if (!hash)
        throw new Error("The wallet did not return a transaction hash.");
      setRecentHash({ id: instruction.operationId, hash });
      await reconcile(instruction.operationId, hash);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Wallet approval did not complete.";
      setMessage(
        started
          ? `${reason} Check wallet history and reconcile this handoff below before retrying.`
          : reason,
      );
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  async function observe(
    event: FormEvent<HTMLFormElement>,
    operationId: string,
  ) {
    event.preventDefault();
    const hash = new FormData(event.currentTarget)
      .get("hash")
      ?.toString()
      .trim();
    setPending(true);
    setMessage("");
    try {
      await reconcile(operationId, hash);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Receipt verification did not complete.",
      );
    } finally {
      setPending(false);
      router.refresh();
    }
  }

  return (
    <>
      <section className="panel padded">
        <h2>Wallet actions</h2>
        <p className="muted">
          <Link href="/settings/wallet">Connect or switch wallets</Link> before
          signing. Collection closes {collectionClosesAt}. Recovery expiry is{" "}
          {expiresAt}.
        </p>
        <div className="row wrap">
          {canManage && !registered && collectionOpen && (
            <button
              type="button"
              className="button primary"
              disabled={pending}
              onClick={() => sign("register")}
            >
              Register pool on NEAR
            </button>
          )}
          {canManage &&
            registered &&
            !planConfirmed &&
            !collectionOpen &&
            !expired && (
              <button
                type="button"
                className="button primary"
                disabled={pending}
                onClick={() => sign("commit")}
              >
                Publish allocation
              </button>
            )}
          {registered && expired && !plan.length && (
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => sign("recover")}
            >
              Recover expired pool
            </button>
          )}
        </div>
        {registered && collectionOpen && !planConfirmed && (
          <form
            className="row wrap"
            onSubmit={(event) => {
              event.preventDefault();
              void sign("deposit", {
                amount: String(new FormData(event.currentTarget).get("amount")),
              });
            }}
          >
            <Field
              label="Contribution in NEAR"
              name="amount"
              placeholder="0.2"
              required
              maxLength={40}
            />
            <button type="submit" className="button primary" disabled={pending}>
              Deposit with wallet
            </button>
          </form>
        )}
        {canManage && (
          <details>
            <summary>Top up the contract operating reserve</summary>
            <form
              className="row wrap"
              onSubmit={(event) => {
                event.preventDefault();
                void sign("reserve", {
                  amount: String(
                    new FormData(event.currentTarget).get("amount"),
                  ),
                });
              }}
            >
              <Field
                label="Operating reserve in NEAR"
                name="amount"
                placeholder="0.1 minimum"
                required
                maxLength={40}
              />
              <button
                type="submit"
                className="button secondary"
                disabled={pending}
              >
                Approve reserve top-up
              </button>
            </form>
          </details>
        )}
        <p className="muted" role="status">
          {message}
        </p>
      </section>
      {!!plan.length && (
        <section className="panel padded">
          <h2>Immutable allocation</h2>
          {plan.map((item) => (
            <div className="list-row" key={item.id}>
              <span>
                {item.kind === "PAYOUT" ? "Payout" : "Original-source refund"} ·{" "}
                {item.amount} NEAR · {item.recipient}
              </span>
              {planConfirmed &&
                (canManage || item.kind === "REFUND") &&
                !confirmed(item) && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={pending}
                    onClick={() => sign("execute", { operationId: item.id })}
                  >
                    Approve {item.kind === "PAYOUT" ? "payout" : "refund"}
                  </button>
                )}
            </div>
          ))}
        </section>
      )}
      <section className="panel padded">
        <h2>Recent testnet operations</h2>
        {receipts.length === 0 && (
          <p className="muted">
            Register the pool to start recording transactions.
          </p>
        )}
        {receipts.map((receipt) => (
          <div key={receipt.id} className="list-row">
            <div>
              <strong>
                {receipt.kind} · {receipt.status}
              </strong>
              <small className="muted">{receipt.signer}</small>
              {receipt.hash && (
                <a
                  href={`https://testnet.nearblocks.io/txns/${receipt.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              )}
            </div>
            {receipt.own &&
              ["UNKNOWN", "SUBMITTED"].includes(receipt.status) && (
                <form
                  className="row wrap"
                  onSubmit={(event) => void observe(event, receipt.id)}
                >
                  {!receipt.hash && (
                    <Field
                      label="Wallet transaction hash"
                      name="hash"
                      maxLength={44}
                      required
                      defaultValue={
                        recentHash?.id === receipt.id
                          ? recentHash.hash
                          : undefined
                      }
                    />
                  )}
                  <button
                    className="button secondary"
                    type="submit"
                    disabled={pending}
                  >
                    Verify receipt
                  </button>
                </form>
              )}
          </div>
        ))}
      </section>
    </>
  );
}
