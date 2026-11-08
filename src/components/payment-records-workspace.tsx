"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { listExternalPayments } from "@/lib/payment-records";
import { dateTime, moneyFormat, titleCase } from "@/lib/format";
import { Badge, Empty } from "./ui";

type View = Awaited<ReturnType<typeof listExternalPayments>>;

async function send(operation: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "The record could not be saved.");
  return data as { message?: string };
}

function localDateTime() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function PaymentRecordsWorkspace({ view }: { view: View }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [occurredAt] = useState(localDateTime);

  async function submit(event: FormEvent<HTMLFormElement>, recordId?: string) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body: Record<string, unknown> = {
      communityId: view.communityId,
      reference: String(fields.get("reference") ?? ""),
      note: String(fields.get("note") ?? ""),
    };
    setPending(true);
    setError("");
    setMessage("");
    try {
      body.occurredAt = new Date(
        String(fields.get("occurredAt")),
      ).toISOString();
      if (recordId) body.recordId = recordId;
      else {
        body.kind = fields.get("kind");
        body.amount = fields.get("amount");
        body.currency = view.currency;
        for (const field of ["roundId", "counterpartyId", "evidenceUrl"])
          if (fields.get(field)) body[field] = String(fields.get(field));
      }
      const data = await send(
        recordId ? "payment-reverse" : "payment-record",
        body,
      );
      setMessage(
        data.message || "External payment record saved. No money moved.",
      );
      form.reset();
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The record could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <section className="notice" aria-label="Payment recording limits">
        <div>
          <strong>
            Staff-recorded external payments · independently unverified.
          </strong>
          <p>
            Fundicate does not collect, hold or transfer money. Evidence links
            and staff entries do not establish bank settlement. These records do
            not change voting power, simulated treasury balances or round
            settlement.
          </p>
          <p>
            Only active community members can inspect these records. Do not
            include account credentials, full bank details or private documents
            in notes or evidence links.
          </p>
        </div>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      <section className="panel padded">
        <h2>Unreversed recorded amounts ({view.currency})</h2>
        <p className="muted">
          Totals cover this community’s unreversed payment records across all
          pages. Reversed originals and correction entries are excluded from
          totals and preserved in history. These are staff attestations, not an
          available balance.
        </p>
        <dl className="detail-list">
          {view.totals.map((total) => (
            <div key={total.kind}>
              <dt>{titleCase(total.kind)}</dt>
              <dd>{moneyFormat(BigInt(total.amount), view.currency)}</dd>
            </div>
          ))}
        </dl>
        {!view.totals.length && <p>No external payments recorded yet.</p>}
      </section>
      {view.canManage && (
        <section className="panel padded">
          <h2>Record a payment made elsewhere</h2>
          <p className="muted">
            Use a unique external reference. Retrying the same reference and
            details returns the existing entry. Corrections require a new
            reversal; earlier records stay intact.
          </p>
          <p>
            <Link href="/settings/security" className="text-link">
              Confirm your password before recording a sensitive action
            </Link>
            .
          </p>
          <form className="form" onSubmit={(event) => void submit(event)}>
            <fieldset disabled={pending}>
              <div className="form-grid">
                <label className="field">
                  <span>Payment type</span>
                  <select name="kind">
                    <option value="CONTRIBUTION">Contribution</option>
                    <option value="PAYOUT">Payout</option>
                    <option value="REFUND">Refund</option>
                  </select>
                </label>
                <label className="field">
                  <span>Amount ({view.currency})</span>
                  <input
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="9999999.99"
                    step="0.01"
                    required
                  />
                </label>
                <label className="field">
                  <span>External reference</span>
                  <input
                    name="reference"
                    minLength={3}
                    maxLength={120}
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="field">
                  <span>Payment date and time (your local time)</span>
                  <input
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={occurredAt}
                    required
                  />
                </label>
                <label className="field">
                  <span>Related round (optional)</span>
                  <select name="roundId">
                    <option value="">No related round</option>
                    {view.rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Related member (optional)</span>
                  <select name="counterpartyId">
                    <option value="">No member linked</option>
                    {view.counterparties.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>Evidence link (optional, HTTPS)</span>
                <input
                  name="evidenceUrl"
                  type="url"
                  pattern="https://.*"
                  maxLength={2048}
                  placeholder="https://example.org/receipt"
                />
              </label>
              <label className="field">
                <span>Context (optional)</span>
                <textarea
                  name="note"
                  maxLength={2000}
                  rows={3}
                  placeholder="Explain what this payment relates to. Do not include sensitive bank details."
                />
              </label>
            </fieldset>
            <button className="button primary" type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record external payment"}
            </button>
          </form>
        </section>
      )}
      <section className="panel padded">
        <h2>Payment history</h2>
        <p className="muted">
          {view.total} records · page {view.page} of {view.pageCount} · up to
          100 records per page.
        </p>
        {!view.records.length ? (
          <Empty
            title="No external payment records"
            description="Community staff can record payments handled elsewhere. Practice treasury entries remain in the Treasury tab."
          />
        ) : (
          <div className="stack">
            {view.records.map((record) => (
              <article
                className="inset"
                key={record.id}
                style={{ overflowWrap: "anywhere" }}
              >
                <div className="row between">
                  <h3>
                    {titleCase(record.kind)} ·{" "}
                    {moneyFormat(BigInt(record.amount), record.currency)}
                  </h3>
                  <Badge>
                    {record.kind === "REVERSAL"
                      ? "Correction record"
                      : record.reversedById
                        ? "Reversed"
                        : "Staff recorded"}
                  </Badge>
                </div>
                <p>
                  <strong>Reference:</strong> {record.reference}
                </p>
                <p className="muted small-text">
                  Occurred {dateTime(record.occurredAt)} · recorded{" "}
                  {dateTime(record.createdAt)} by {record.recordedByName}
                  {record.counterpartyName
                    ? ` · related member: ${record.counterpartyName}`
                    : ""}
                </p>
                {record.note && (
                  <p style={{ whiteSpace: "pre-wrap" }}>{record.note}</p>
                )}
                {record.roundId && (
                  <p>
                    <Link
                      className="text-link"
                      href={`/communities/${view.slug}/rounds/${record.roundId}`}
                    >
                      Related funding round
                    </Link>
                  </p>
                )}
                {record.evidenceUrl && (
                  <p>
                    <a
                      className="text-link"
                      href={record.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open staff-provided evidence (external site)
                    </a>
                  </p>
                )}
                {record.reversesId && (
                  <p className="muted small-text">
                    Reverses record {record.reversesId}. The original remains in
                    history.
                  </p>
                )}
                {record.reversedById && (
                  <p className="muted small-text">
                    Correction record: {record.reversedById}.
                  </p>
                )}
                {view.canManage &&
                  record.kind !== "REVERSAL" &&
                  !record.reversedById && (
                    <details>
                      <summary>
                        Correct this record with a full reversal
                      </summary>
                      <p>
                        A reversal corrects tracking only. It does not refund or
                        transfer money. Record the replacement payment
                        separately if needed.
                      </p>
                      <form
                        className="form"
                        onSubmit={(event) => void submit(event, record.id)}
                      >
                        <fieldset disabled={pending}>
                          <label className="field">
                            <span>Reversal reference</span>
                            <input
                              name="reference"
                              minLength={3}
                              maxLength={120}
                              required
                            />
                          </label>
                          <label className="field">
                            <span>
                              Correction date and time (your local time)
                            </span>
                            <input
                              name="occurredAt"
                              type="datetime-local"
                              defaultValue={occurredAt}
                              required
                            />
                          </label>
                          <label className="field">
                            <span>Reason for correction</span>
                            <textarea
                              name="note"
                              minLength={10}
                              maxLength={2000}
                              rows={3}
                              required
                            />
                          </label>
                        </fieldset>
                        <button
                          className="button secondary"
                          type="submit"
                          disabled={pending}
                        >
                          Record full reversal
                        </button>
                      </form>
                    </details>
                  )}
              </article>
            ))}
          </div>
        )}
        <nav className="row between" aria-label="Payment record pages">
          {view.page > 1 ? (
            <Link
              className="button secondary"
              href={`/communities/${view.slug}/payments?page=${view.page - 1}`}
            >
              Previous page
            </Link>
          ) : (
            <span />
          )}
          {view.page < view.pageCount && (
            <Link
              className="button secondary"
              href={`/communities/${view.slug}/payments?page=${view.page + 1}`}
            >
              Next page
            </Link>
          )}
        </nav>
      </section>
    </div>
  );
}
