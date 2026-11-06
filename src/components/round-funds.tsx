import Link from "next/link";
import { ArrowDownToLine, Layers3, ShieldCheck } from "lucide-react";
import type { getRoundFinanceView } from "@/lib/funded-rounds";
import { getV3Settings } from "@/lib/rounds-v3";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { ActionButton, ActionForm, Field } from "./forms";
import { Status } from "./ui";

type FinanceView = NonNullable<Awaited<ReturnType<typeof getRoundFinanceView>>>;
const decimal = (value: bigint) =>
  `${value / 100n}.${(value % 100n).toString().padStart(2, "0")}`;

export function RoundFunds({
  view,
  communityId,
  roundId,
  userId,
}: {
  view: FinanceView;
  communityId: string;
  roundId: string;
  userId?: string;
}) {
  const { settlement: s, totals } = view;
  const v3 = s.rulesVersion === 3 ? getV3Settings(s) : null;
  const base = { communityId, roundId };
  const progress =
    Number(
      totals.received >= s.fundingTarget
        ? 10000n
        : (totals.received * 10000n) / s.fundingTarget,
    ) / 100;
  const remaining = s.maximumContribution - view.ownContributed;
  const targetTenths = (totals.received * 1000n) / s.fundingTarget;
  const targetPercent = `${targetTenths / 10n}.${targetTenths % 10n}`;
  const ownRefunds = view.operations.filter(
    (op) => op.kind === "REFUND" && op.beneficiaryId === userId,
  );
  return (
    <section
      className="panel padded round-funds"
      aria-labelledby="round-funds-heading"
    >
      <div className="row between">
        <div className="row">
          <span className="round-funds-icon">
            <Layers3 size={21} aria-hidden="true" />
          </span>
          <div>
            <span className="eyebrow">
              A DEDICATED ROUND POOL · V{s.rulesVersion}
            </span>
            <h3 id="round-funds-heading">From contribution to outcome.</h3>
          </div>
        </div>
        <Status value={s.status} />
      </div>
      <p className="muted small-text">
        Local simulation · {s.currency} · funds are segregated from the
        community’s spendable treasury. These are recorded local amounts, with
        no blockchain transaction or real wallet transfer.
      </p>
      <p className="muted small-text">
        {v3
          ? `FPTP · ${titleCase(v3.allocationPolicy)} allocation · ${v3.vetoEnabled ? "24-hour rejection veto enabled. Payouts wait the complete window." : "veto disabled. Settlement may follow the final decision."}`
          : "Equal votes · FPTP · winner-all allocation · veto disabled. Settlement can be prepared immediately after the final decision."}
      </p>
      <div className="round-funding-progress">
        <div className="row between">
          <span>Received toward the target</span>
          <strong>
            {moneyFormat(totals.received, s.currency)}{" "}
            <span className="muted">
              / {moneyFormat(s.fundingTarget, s.currency)}
            </span>
          </strong>
        </div>
        <progress
          value={progress}
          max={100}
          aria-label="Funding target progress"
        />
        <small className="muted">
          {targetPercent}% of target · pledges are excluded
        </small>
      </div>
      <dl className="round-fund-metrics">
        {[
          { label: "Held", amount: totals.held },
          { label: "Reserved", amount: totals.reserved },
          { label: "Paid", amount: totals.paid },
          { label: "Refunded", amount: totals.refunded },
        ].map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{moneyFormat(metric.amount, s.currency)}</dd>
          </div>
        ))}
      </dl>
      {s.reason && (
        <p className="notice">Settlement outcome: {titleCase(s.reason)}.</p>
      )}
      {view.settlementBlockedReason && (
        <p className="notice" role="status">
          {view.settlementBlockedReason}
        </p>
      )}
      {view.canContribute ? (
        <div className="round-contribution-form">
          <h4>
            {view.ownContributed > 0n
              ? "Add to your contribution"
              : "Contribute to this pool"}
          </h4>
          <ActionForm
            operation="round-contribute"
            defaults={base}
            submit="Record local contribution"
            confirm="Record this simulated contribution in the dedicated round pool? No real wallet transfer occurs."
          >
            <Field
              name="amount"
              label={`Contribution amount (${s.currency})`}
              type="number"
              min={decimal(
                view.ownContributed > 0n ? 1n : s.minimumContribution,
              )}
              max={decimal(remaining)}
              help={
                view.ownContributed > 0n
                  ? `${moneyFormat(view.ownContributed, s.currency)} contributed so far. Up to ${moneyFormat(remaining, s.currency)} remains under your cumulative cap.`
                  : `Initial minimum ${moneyFormat(s.minimumContribution, s.currency)}; total per contributor maximum ${moneyFormat(s.maximumContribution, s.currency)}.`
              }
            />
          </ActionForm>
        </div>
      ) : !userId ? (
        <p className="notice">
          <Link href="/login">Sign in to check contribution eligibility →</Link>
        </p>
      ) : (
        <p className="muted small-text">
          New contributions require active membership, an open collection
          window, and room under the per-contributor cap. Your existing receipts
          and refund rights remain recorded when membership changes.
        </p>
      )}
      {userId && (
        <div className="round-own-funds">
          <div className="row between">
            <h4>Your contribution history</h4>
            <ArrowDownToLine size={18} aria-hidden="true" />
          </div>
          <p className="muted small-text">
            Received from you:{" "}
            <strong>{moneyFormat(view.ownContributed, s.currency)}</strong> ·
            returned to you:{" "}
            <strong>{moneyFormat(view.ownRefunded, s.currency)}</strong>
          </p>
          {view.ownReceipts.length ? (
            <details>
              <summary>
                View your {view.ownReceipts.length} deposit{" "}
                {view.ownReceipts.length === 1 ? "receipt" : "receipts"}
              </summary>
              <div className="round-fund-receipts">
                {view.ownReceipts.map((receipt) => (
                  <article key={receipt.id}>
                    <div className="row between">
                      <strong>{moneyFormat(receipt.amount, s.currency)}</strong>
                      <span className="small-text muted">
                        {dateTime(receipt.createdAt)}
                      </span>
                    </div>
                    <dl className="detail-list">
                      <div>
                        <dt>Receipt</dt>
                        <dd className="mono">{receipt.id}</dd>
                      </div>
                      <div>
                        <dt>Local transaction</dt>
                        <dd className="mono">{receipt.transactionId}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </details>
          ) : (
            <p className="small-text muted">
              No received contribution receipts for this account.
            </p>
          )}
          {ownRefunds.length > 0 && (
            <div className="round-own-refunds">
              {ownRefunds.map((op) => (
                <div key={op.id} className="row between">
                  <span>
                    Your refund · {moneyFormat(op.amount, s.currency)}
                  </span>
                  <Status value={op.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {(view.canPrepare ||
        view.canProcess ||
        view.canRecover ||
        view.canReconcile) && (
        <div className="round-settlement-controls">
          <h4>
            {view.canRecover
              ? "Recover unresolved contributions"
              : "Settle the published outcome"}
          </h4>
          <p className="muted small-text">
            {v3
              ? "Preparation reserves the published allocation or justified original-source refund plan. "
              : "Preparation freezes the allocation and refund plan. "}
            Processing executes pending local operations and preserves completed
            receipts when retried.
          </p>
          <div className="row">
            {(view.canPrepare || view.canRecover) && (
              <ActionButton
                operation="round-settle"
                body={base}
                confirm={
                  view.canRecover
                    ? "Prepare refunds of this expired unresolved pool to its original contributors?"
                    : "Prepare the immutable allocation and refund plan under the published round rules?"
                }
              >
                {view.canRecover
                  ? "Prepare expiry refunds"
                  : "Prepare settlement"}
              </ActionButton>
            )}
            {view.canProcess && (
              <ActionButton
                operation="round-process"
                body={base}
                className="button primary"
                confirm="Process the pending simulated payout and refund operations? Completed operations will not be duplicated."
              >
                Process pending operations
              </ActionButton>
            )}
            {view.canReconcile && (
              <ActionButton
                operation="round-reconcile"
                body={base}
                confirm="Check the exact local ledger operation before any retry? This does not submit an external transfer or change recipients."
              >
                Reconcile unknown local outcomes
              </ActionButton>
            )}
          </div>
        </div>
      )}
      <details className="round-funding-details">
        <summary>Explore funding rules and settlement details</summary>
        <dl className="detail-list">
          <div>
            <dt>Initial contribution minimum</dt>
            <dd>{moneyFormat(s.minimumContribution, s.currency)}</dd>
          </div>
          <div>
            <dt>Total contributor maximum</dt>
            <dd>{moneyFormat(s.maximumContribution, s.currency)}</dd>
          </div>
          <div>
            <dt>Contribution cutoff</dt>
            <dd>{dateTime(s.collectionClosesAt)}</dd>
          </div>
          <div>
            <dt>Unresolved funding expiry</dt>
            <dd>{dateTime(s.expiresAt)}</dd>
          </div>
          <div>
            <dt>Contribution basis</dt>
            <dd>
              {s.frozenAt
                ? `Frozen ${dateTime(s.frozenAt)}`
                : "Collection has not been frozen"}
            </dd>
          </div>
          <div>
            <dt>Asset</dt>
            <dd className="mono">{s.assetId}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{s.network}</dd>
          </div>
          <div>
            <dt>Published rules version</dt>
            <dd>{s.rulesVersion}</dd>
          </div>
          {s.preparedAt && (
            <div>
              <dt>Settlement prepared</dt>
              <dd>{dateTime(s.preparedAt)}</dd>
            </div>
          )}
          {s.settledAt && (
            <div>
              <dt>Settlement completed</dt>
              <dd>{dateTime(s.settledAt)}</dd>
            </div>
          )}
          <div>
            <dt>Fees</dt>
            <dd>Zero</dd>
          </div>
          <div>
            <dt>Rejection veto</dt>
            <dd>
              {v3?.vetoEnabled
                ? "Enabled · every payout waits the full 24-hour window"
                : "Disabled · no additional holding period after the final decision"}
            </dd>
          </div>
        </dl>
        {v3 ? (
          <p className="small-text muted">
            Awards use the published{" "}
            {titleCase(v3.allocationPolicy).toLowerCase()} plan and each
            scheme’s request cap. Unused caps, missing ranked positions,
            unpayable shares and rejected outcomes return to original sources
            without hidden redistribution. No quorum, failed funding or zero
            support produces no award. Contribution ownership survives
            membership changes.
          </p>
        ) : (
          <p className="small-text muted">
            The winner receives the smaller of its requested amount and the
            received pool, after the funding target is met. Unused money returns
            proportionally to the original contributors, using exact minor-unit
            rounding. A tie, no quorum, no qualified winner, a missed target, or
            unresolved expiry produces refunds. Contribution ownership survives
            membership changes.
          </p>
        )}
        <p className="small-text muted">
          Residual minor units use largest remainders, with ties ordered by
          original source ID. Expiry refunds only unprepared pools; queued plans
          resume unchanged.
          {v3 &&
            " Recovery respects any published veto window. An unknown local execution outcome must be reconciled before retry or release."}
        </p>
        {view.operations.length > 0 && (
          <>
            <h4>Allocation and refund operations</h4>
            <div
              className="table-scroll"
              role="region"
              aria-label="Round settlement operations"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Recipient</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Attempts</th>
                  </tr>
                </thead>
                <tbody>
                  {view.operations.map((op) => (
                    <tr key={op.id}>
                      <td>
                        <strong>{titleCase(op.kind)}</strong>
                        <small className="mono muted">
                          {op.transactionId ?? "No completed local transaction"}
                        </small>
                        {op.lastError && (
                          <small className="inline-error">{op.lastError}</small>
                        )}
                      </td>
                      <td>{op.recipient}</td>
                      <td>{moneyFormat(op.amount, s.currency)}</td>
                      <td>
                        <Status value={op.status} />
                      </td>
                      <td>{op.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
      <div className="round-fund-assurance">
        <ShieldCheck size={17} aria-hidden="true" />
        <span>
          One published policy, a separate pool, and receipts for every recorded
          movement.
        </span>
      </div>
    </section>
  );
}
