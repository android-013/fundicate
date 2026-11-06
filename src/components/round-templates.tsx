"use client";

import { FormEvent, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionButton, Field, TextArea } from "./forms";
import { Empty, Status } from "./ui";
import type { RoundTemplateView } from "@/lib/round-templates";
import { dateTime, titleCase } from "@/lib/format";

function TemplateForm({ operation, defaults, children, submit }: { operation: string; defaults: Record<string, unknown>; children: React.ReactNode; submit: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError(""); setDone(false);
    try {
      const body = { ...defaults, ...Object.fromEntries(new FormData(event.currentTarget)) };
      if ("submissionsCloseAt" in body) body.submissionsCloseAt = new Date(String(body.submissionsCloseAt)).toISOString();
      const response = await fetch(`/api/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The template action could not be completed.");
      setDone(true);
      if (result.redirect) router.push(result.redirect);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "The template action failed."); }
    finally { setPending(false); }
  }
  return <form className="form" onSubmit={onSubmit}>{children}{error && <p className="inline-error" role="alert">{error}</p>}{done && <p className="inline-success" role="status">Saved successfully.</p>}<button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : submit}</button></form>;
}

export function RoundTemplates({ view }: { view: RoundTemplateView }) {
  const sourceId = useId();
  const [deadline] = useState(() => {
    const date = new Date(Date.now() + 7 * 86400000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  return <div className="stack">
    <section className="panel">
      <div className="row between"><div><span className="eyebrow">YOUR COMMUNITY PLAYBOOK</span><h2>Repeat the setup. Keep each decision distinct.</h2></div><Link className="button secondary" href={`/communities/${view.slug}/rounds`}>Funding rounds</Link></div>
      <p className="muted">Save a round’s rules once, then create a new draft with fresh deadlines. Votes, received money and published outcomes stay with their original round. Each draft records the exact template revision it uses.</p>
      {view.canManage && view.sources.length > 0 && <details><summary>Save a new template from an existing round</summary><TemplateForm operation="template-save" defaults={{ communityId: view.communityId }} submit="Save template">
        <Field name="name" label="Template name" placeholder="Monthly community grants" />
        <TextArea name="description" label="When should this template be used?" placeholder="Explain this round’s purpose and the rules worth reusing." />
        <label className="field"><span id={sourceId}>Source round</span><select name="sourceRoundId" aria-labelledby={sourceId} required>{view.sources.map((source) => <option value={source.id} key={source.id}>{source.title} · V{source.rulesVersion}</option>)}</select><small>The latest 100 rounds are listed. No ballots or payment history are copied.</small></label>
      </TemplateForm></details>}
      {view.canManage && !view.sources.length && <p>Create your first round before saving its reusable rules.</p>}
    </section>
    {!view.templates.length && <section className="panel"><Empty title="Your library starts with one useful round" description="Save a completed or draft round’s setup to reuse its rules with fresh dates." /></section>}
    {view.templates.map((template) => {
      const latest = template.revisions[0];
      return <section className="panel" key={template.id}>
        <div className="row between"><div><span className="eyebrow">REVISION {latest?.number ?? "—"}</span><h2>{template.name}</h2><p className="muted">{template.description}</p></div><Status value={template.archivedAt ? "ARCHIVED" : "ACTIVE"} /></div>
        {latest && <div className="inset"><p><strong>{latest.rules.round.funded ? `${String(latest.rules.round.fundedVersion)} funded round` : "V1 decision-only"}</strong> · {titleCase(String(latest.rules.round.selectionMethod ?? "FPTP"))} · {titleCase(String(latest.rules.round.allocationPolicy ?? "No payment authority"))}</p><p className="muted small-text">Rules saved {dateTime(latest.createdAt)}. Each new round still requires an explicit opening action.</p></div>}
        {view.canManage && !template.archivedAt && latest && <details><summary>Create a new draft from this template</summary><TemplateForm operation="template-instantiate" defaults={{ communityId: view.communityId, templateId: template.id, revision: latest.number }} submit="Create draft from template"><Field name="title" label={`New round title for ${template.name}`} defaultValue={String(latest.rules.round.title ?? template.name)} /><TextArea name="description" label={`New round purpose for ${template.name}`} defaultValue={String(latest.rules.round.description ?? "")} /><Field name="submissionsCloseAt" label={`Submission deadline for ${template.name}`} type="datetime-local" defaultValue={deadline} help="Your local time. Contribution cutoff and recovery expiry shift by the saved intervals." /></TemplateForm></details>}
        {view.canManage && !template.archivedAt && view.sources.length > 0 && <details><summary>Save a new revision of this template</summary><TemplateForm operation="template-save" defaults={{ communityId: view.communityId, templateId: template.id }} submit="Save new revision"><Field name="name" label={`Updated name for ${template.name}`} defaultValue={template.name} /><TextArea name="description" label={`Updated guidance for ${template.name}`} defaultValue={template.description} /><label className="field"><span>Replacement source round for {template.name}</span><select name="sourceRoundId" required>{view.sources.map((source) => <option key={source.id} value={source.id}>{source.title} · V{source.rulesVersion}</option>)}</select></label></TemplateForm></details>}
        <details><summary>Inspect preserved revision history ({template.revisions.length})</summary>{template.revisions.map((revision) => <details key={revision.id}><summary>Revision {revision.number} · {dateTime(revision.createdAt)}</summary><pre tabIndex={0} role="region" aria-label={`${template.name} revision ${revision.number} rules`} style={{ background: "var(--paper)", color: "var(--ink)", padding: "1rem", maxWidth: "100%", overflowX: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(revision.rules, null, 2)}</pre></details>)}</details>
        {view.canManage && !template.archivedAt && <ActionButton operation="template-archive" body={{ communityId: view.communityId, templateId: template.id }} className="button secondary" confirm="Archive this template? Existing round snapshots and all revisions remain preserved.">Archive {template.name}</ActionButton>}
      </section>;
    })}
    <nav className="row between" aria-label="Template library pages"><p className="muted small-text">Page {view.page} of {view.pageCount} · {view.total} preserved templates</p><div className="row">{view.page > 1 && <Link className="button secondary" href={`/communities/${view.slug}/templates?page=${view.page - 1}`}>Previous page</Link>}{view.page < view.pageCount && <Link className="button secondary" href={`/communities/${view.slug}/templates?page=${view.page + 1}`}>Next page</Link>}</div></nav>
  </div>;
}
