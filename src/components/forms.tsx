"use client";
import { FormEvent, ReactNode, useState } from "react";
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
  const [key, setKey] = useState("");
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
      if (operation === "funding-round")
        body.submissionsCloseAt = new Date(
          String(body.submissionsCloseAt),
        ).toISOString();
      if (operation === "contribute") {
        const token = key || crypto.randomUUID();
        setKey(token);
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
      if (operation === "contribute") setKey("");
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
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        min={min}
        max={max}
        step={type === "number" ? "0.01" : undefined}
      />
      {help && <small>{help}</small>}
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
  return (
    <label className="field">
      <span>{label}</span>
      <select name={name} defaultValue={defaultValue}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export function ProposalForm({
  communityId,
  quorumBps,
  thresholdBps,
  members,
  isStaff,
}: {
  communityId: string;
  quorumBps: number;
  thresholdBps: number;
  members: { id: string; name: string }[];
  isStaff: boolean;
}) {
  const [type, setType] = useState("FUNDING");
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
      submit={isStaff ? "Save proposal" : "Submit for staff review"}
    >
      <label className="field">
        <span>Decision type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="FUNDING">Funding proposal</option>
          <option value="FUNDRAISING">Fundraising goal</option>
          <option value="REMOVAL">Member removal</option>
          <option value="GOVERNANCE">Governance change</option>
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
        <Select
          label="Member under consideration"
          name="targetUserId"
          options={members.map((m) => ({ value: m.id, label: m.name }))}
        />
      )}
      {type === "GOVERNANCE" && (
        <div className="inset">
          <Select
            name="admissionPolicy"
            label="Proposed admission policy"
            options={[
              { value: "VOTE", label: "Member vote (simple majority)" },
              { value: "REVIEW", label: "Moderator / administrator review" },
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
      {isStaff ? (
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
