"use client";
import { FormEvent, ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";

type Values = Record<string, unknown>;
export function ActionForm({
  operation,
  defaults = {},
  children,
  submit = "Save changes",
  className = "",
  confirm,
}: {
  operation: string;
  defaults?: Values;
  children: ReactNode;
  submit?: string;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState<{ token: string; payload: string } | null>(
    null,
  );
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const body: Values = { ...defaults, ...Object.fromEntries(form) };
      if (operation === "application") {
        body.answers = Object.fromEntries(
          [...form.entries()]
            .filter(([k]) => k.startsWith("answer."))
            .map(([k, v]) => [k.slice(7), v]),
        );
      }
      if (operation === "proposal") {
        body.publish = form.get("publish") === "on";
        body.opensAt = new Date(String(body.opensAt)).toISOString();
        body.closesAt = new Date(String(body.closesAt)).toISOString();
        if (body.type === "GOVERNANCE")
          body.allowMemberProposals = form.get("allowMemberProposals") === "on";
      }
      if (operation === "funding-round") {
        body.submissionsCloseAt = new Date(
          String(body.submissionsCloseAt),
        ).toISOString();
        body.funded = form.get("funded") === "on";
        if (body.funded) {
          body.collectionClosesAt = new Date(
            String(body.collectionClosesAt),
          ).toISOString();
          body.expiresAt = new Date(String(body.expiresAt)).toISOString();
          if (body.fundedVersion === "V4")
            body.selectionSeats = Number(form.get("selectionSeats"));
          if (["V3", "V4"].includes(String(body.fundedVersion))) {
            body.vetoEnabled = form.get("vetoEnabled") === "on";
            body.rankedSharesBps = [];
            if (body.allocationPolicy === "RANKED_CUTS") {
              const shares = String(form.get("rankedSharesBps") ?? "")
                .split(",")
                .map((value) => value.trim());
              if (
                !shares.length ||
                shares.length > 50 ||
                shares.some((share) => !/^\d{1,3}(?:\.\d{1,2})?$/.test(share))
              )
                throw new Error(
                  "Enter 1–50 percentages separated by commas, with up to two decimal places each.",
                );
              const basisPoints = shares.map((share) => {
                const [whole, fraction = ""] = share.split(".");
                return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
              });
              if (
                basisPoints.some((share) => share < 1 || share > 10000) ||
                basisPoints.reduce((total, share) => total + share, 0) !== 10000
              )
                throw new Error(
                  "Every ranked share must be positive and all shares must total exactly 100%.",
                );
              body.rankedSharesBps = basisPoints;
            }
          }
        }
      }
      if (["contribute", "round-contribute"].includes(operation)) {
        const payload = JSON.stringify(body);
        const token =
          key?.payload === payload ? key.token : crypto.randomUUID();
        setKey({ token, payload });
        body.idempotencyKey = token;
      }
      const res = await fetch(`/api/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Please try again.");
      setMessage(data.message || "Saved.");
      if (["contribute", "round-contribute"].includes(operation)) setKey(null);
      if (data.redirect) router.push(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className={`form ${className}`}>
      <fieldset disabled={pending}>{children}</fieldset>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="form-success">
          <CheckCircle2 size={17} />
          {message}
        </div>
      )}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <ArrowRight size={17} />
        )}{" "}
        {pending ? "Working…" : submit}
      </button>
    </form>
  );
}
export function ActionButton({
  operation,
  body,
  children,
  className = "button secondary",
  confirm,
}: {
  operation: string;
  body: Values;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function run() {
    if (pending) return;
    if (confirm && !window.confirm(confirm)) return;
    setPending(true);
    setError("");
    setDone(false);
    try {
      const res = await fetch(`/api/${operation}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDone(true);
      if (data.redirect) router.push(data.redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <span className="action-wrap">
      <button
        type="button"
        className={className}
        onClick={run}
        disabled={pending}
      >
        {pending ? <LoaderCircle size={15} className="spin" /> : null}
        {children}
      </button>
      {error && (
        <span className="inline-error" role="alert">
          {error}
        </span>
      )}
      {done && (
        <span className="inline-success" role="status">
          Recorded
        </span>
      )}
    </span>
  );
}
export function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  min,
  max,
  help,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  help?: string;
  step?: string | number;
}) {
  const fieldId = useId();
  return (
    <label className="field">
      <span id={`${fieldId}-label`}>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step ?? (type === "number" ? "0.01" : undefined)}
        aria-labelledby={`${fieldId}-label`}
        aria-describedby={help ? `${fieldId}-help` : undefined}
      />
      {help && <small id={`${fieldId}-help`}>{help}</small>}
    </label>
  );
}
export function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={4}
      />
    </label>
  );
}
export function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  const fieldId = useId();
  return (
    <label className="field">
      <span id={`${fieldId}-label`}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        aria-labelledby={`${fieldId}-label`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function CommunityGovernanceFields() {
  const governanceLabelId = useId();
  const [strict, setStrict] = useState(false);
  const [questions, setQuestions] = useState("");
  const questionCount = questions.split(/\r?\n/).filter((q) => q.trim()).length;
  return (
    <>
      <label className="field">
        <span id={governanceLabelId}>Governance profile</span>
        <select
          name="governanceProfile"
          aria-labelledby={governanceLabelId}
          value={strict ? "STRICT" : "LEGACY"}
          onChange={(e) => setStrict(e.target.value === "STRICT")}
        >
          <option value="LEGACY">Legacy · flexible community governance</option>
          <option value="STRICT">
            Strict · member governed admission and removal
          </option>
        </select>
      </label>
      <p className="notice">
        {strict
          ? "Strict governance requires a majority admission ballot and an exact two-thirds removal ballot, including for the administrator. Staff cannot suspend voting access unilaterally. This profile is fixed at creation."
          : "Legacy governance preserves staff review, emergency suspension review, and voluntary authority transfers. Its existing decisions and safeguards remain available."}
      </p>
      <label className="field">
        <span>Membership questions (one per line, up to five)</span>
        <textarea
          name="questions"
          value={questions}
          onChange={(e) => setQuestions(e.target.value)}
          rows={4}
          placeholder="What would you like to contribute to our community?"
        />
      </label>
      {strict && (
        <section className="inset governance-founder">
          <h3>Your founding membership</h3>
          <p className="muted small-text">
            The founder makes the same contribution declaration as future
            members. A pledge records intent; it does not deposit money or
            increase any pool.
          </p>
          <Field
            name="founderContribution"
            label="Your declared contribution"
            type="number"
            min="0"
            max="9999999.99"
            help="Use the treasury currency and meet the minimum membership pledge above."
          />
          <TextArea
            name="founderIntroduction"
            label="Your founding introduction"
            placeholder="Explain what you hope to contribute (at least 20 characters)."
          />
          {questionCount > 0 && (
            <TextArea
              name="founderAnswers"
              label="Your answers to the membership questions"
              placeholder={`Write ${questionCount} ${questionCount === 1 ? "answer" : "answers"}, one per line, in the question order above.`}
            />
          )}
        </section>
      )}
    </>
  );
}
export function ProposalForm({
  communityId,
  quorumBps,
  thresholdBps,
  members,
  isStaff,
  governanceProfile = "LEGACY",
  adminId,
  successors = [],
  removalOnly = false,
  initialType = "FUNDING",
}: {
  communityId: string;
  quorumBps: number;
  thresholdBps: number;
  members: { id: string; name: string }[];
  isStaff: boolean;
  governanceProfile?: "LEGACY" | "STRICT";
  adminId?: string;
  successors?: { id: string; name: string }[];
  removalOnly?: boolean;
  initialType?: string;
}) {
  const [type, setType] = useState(removalOnly ? "REMOVAL" : initialType);
  const [targetId, setTargetId] = useState(members[0]?.id ?? "");
  const strictRemoval = governanceProfile === "STRICT" && type === "REMOVAL";
  const strictAdminRemoval =
    governanceProfile === "STRICT" &&
    type === "REMOVAL" &&
    targetId === adminId;
  const local = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  const [dates] = useState(() => {
    const start = new Date();
    return {
      start: local(start),
      end: local(new Date(start.getTime() + 7 * 86400000)),
    };
  });
  return (
    <ActionForm
      operation="proposal"
      defaults={{ communityId }}
      submit={
        strictRemoval
          ? strictAdminRemoval
            ? "Open administrator removal ballot"
            : "Open member removal ballot"
          : isStaff
            ? "Save proposal"
            : "Submit for staff review"
      }
    >
      <label className="field">
        <span>Decision type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          {!removalOnly && <option value="FUNDING">Funding proposal</option>}
          {!removalOnly && (
            <option value="FUNDRAISING">Fundraising goal</option>
          )}
          <option value="REMOVAL">Member removal</option>
          {!removalOnly && (
            <option value="GOVERNANCE">Governance change</option>
          )}
        </select>
      </label>
      <Field
        label="Proposal title"
        name="title"
        placeholder="What should we make happen?"
      />
      <TextArea
        label="The proposal"
        name="description"
        placeholder="Explain the purpose, expected impact, and how success will be measured."
      />
      {["FUNDING", "FUNDRAISING"].includes(type) && (
        <Field
          label={type === "FUNDING" ? "Requested amount" : "Fundraising target"}
          name="amount"
          type="number"
          min="0.01"
          max="9999999.99"
        />
      )}
      {type === "FUNDING" && (
        <Field
          label="Recipient or project account label"
          name="recipient"
          placeholder="Campus garden project"
          help="A local label for the simulated payment. No wallet transfer occurs."
        />
      )}
      {type === "REMOVAL" && (
        <>
          <label className="field">
            <span>Member under consideration</span>
            <select
              name="targetUserId"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              required
            >
              {!members.length && <option value="">No eligible members</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {strictAdminRemoval && (
            <div className="inset">
              <Select
                name="successorId"
                label="Published administrator successor"
                options={successors
                  .filter((m) => m.id !== adminId)
                  .map((m) => ({ value: m.id, label: m.name }))}
              />
              <p className="muted small-text">
                Approval removes the incumbent and appoints this active member
                in one action. The nominee is public before voting. While the
                ballot is open, authority transfer and the nominee’s departure
                or removal are locked so the decision can be carried out.
              </p>
            </div>
          )}
        </>
      )}
      {type === "GOVERNANCE" && (
        <div className="inset">
          <Select
            name="admissionPolicy"
            label="Proposed admission policy"
            options={[
              { value: "VOTE", label: "Member vote (simple majority)" },
              ...(governanceProfile === "LEGACY"
                ? [
                    {
                      value: "REVIEW",
                      label: "Moderator / administrator review",
                    },
                  ]
                : []),
            ]}
          />
          <label className="checkbox">
            <input type="checkbox" name="allowMemberProposals" defaultChecked />
            Allow member proposal submissions
          </label>
          <p className="muted">
            If approved, the quorum and threshold below also become the defaults
            for future funding ballots. Existing ballots retain their frozen
            rules.
          </p>
        </div>
      )}
      <div className="form-grid">
        <Select
          label="Minimum participation (quorum)"
          name="quorumBps"
          defaultValue={String(quorumBps)}
          options={[
            { value: "2500", label: "25% of eligible voters" },
            { value: "5000", label: "50% of eligible voters" },
            { value: "7500", label: "75% of eligible voters" },
            { value: "10000", label: "All eligible voters" },
          ]}
        />
        <Select
          label="Approval threshold"
          name="thresholdBps"
          defaultValue={String(thresholdBps)}
          options={[
            { value: "5001", label: "Simple majority (>50% of yes/no votes)" },
            { value: "6667", label: "At least 66.67% of yes/no votes" },
            { value: "7500", label: "At least 75% of yes/no votes" },
            { value: "10000", label: "Unanimous yes/no votes" },
          ]}
        />
      </div>
      {type === "REMOVAL" && (
        <p className="notice">
          Member removal always requires an exact two-thirds majority of yes/no
          votes. The member under review cannot vote in their own ballot.
        </p>
      )}
      <div className="form-grid">
        <Field
          label="Opens at (your local time)"
          name="opensAt"
          type="datetime-local"
          defaultValue={dates.start}
        />
        <Field
          label="Closes at (your local time)"
          name="closesAt"
          type="datetime-local"
          defaultValue={dates.end}
        />
      </div>
      <Field
        label="Supporting link (optional)"
        name="supportingUrl"
        type="url"
        required={false}
      />
      {strictRemoval ? (
        <>
          <input type="hidden" name="publish" value="on" />
          <p className="notice">
            Any active member can open and finalize this removal ballot. It
            opens directly with a frozen voter list
            {strictAdminRemoval
              ? " and the published successor; incumbent approval is not required"
              : ""}
            . Staff cannot cancel an open strict ballot.
          </p>
        </>
      ) : isStaff ? (
        <label className="checkbox">
          <input type="checkbox" name="publish" defaultChecked />
          Open voting and freeze the eligible voter list
        </label>
      ) : (
        <p className="notice">
          Your proposal will be saved as a draft for a moderator to open.
        </p>
      )}
    </ActionForm>
  );
}
