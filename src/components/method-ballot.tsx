"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Method, MethodBallot } from "@/lib/methods-core";

const labels: Record<Method, string> = {
  FPTP: "Single choice",
  IRV: "Ranked choice / IRV",
  STV: "Transferable vote / STV",
  ELO: "Elo pairwise",
  GLICKO_2: "Glicko-2 pairwise",
  FORCED_PAIRWISE: "Forced pairwise (+1 / −1)",
};
export function MethodBallotForm({
  communityId,
  roundId,
  method,
  schemes,
  own,
  canVote,
  power,
  totalPower,
}: {
  communityId: string;
  roundId: string;
  method: Method;
  schemes: { id: string; title: string }[];
  own: unknown;
  canVote: boolean;
  power: string;
  totalPower: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(schemes[0]?.id ?? "");
  const [ranks, setRanks] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, "A" | "B" | "DRAW">>(
    {},
  );
  const [page, setPage] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sorted = [...schemes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  const pairs = sorted.flatMap((a, index) =>
    sorted.slice(index + 1).map((b) => ({ a, b, key: `${a.id}:${b.id}` })),
  );
  const ranked = method === "IRV" || method === "STV";
  const pairwise = method !== "FPTP" && !ranked;
  const pages = Math.max(1, Math.ceil(pairs.length / 20));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    let ballot: MethodBallot;
    if (method === "FPTP") ballot = { schemeId: choice };
    else if (ranked) {
      const values = schemes
        .filter((s) => ranks[s.id])
        .map((s) => ({ id: s.id, rank: Number(ranks[s.id]) }));
      if (
        !values.length ||
        new Set(values.map((v) => v.rank)).size !== values.length
      ) {
        setError("Assign at least one preference and use each rank only once.");
        return;
      }
      ballot = {
        ranking: values.sort((a, b) => a.rank - b.rank).map((v) => v.id),
      };
    } else {
      if (pairs.some((pair) => !answers[pair.key])) {
        setError(
          "Complete every assigned comparison before sealing your ballot.",
        );
        return;
      }
      ballot = {
        pairs: pairs.map((pair) => ({
          a: pair.a.id,
          b: pair.b.id,
          choice: answers[pair.key],
        })),
      };
    }
    if (!window.confirm("Seal this complete ballot? It cannot be changed."))
      return;
    setPending(true);
    try {
      const response = await fetch("/api/round-method-vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId, roundId, ballot }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Ballot could not be recorded.");
      setMessage("Your complete ballot is sealed and recorded.");
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="panel padded method-ballot">
      <h3>{labels[method]}</h3>
      <p>
        <strong>
          Your selection power: {power} of {totalPower} eligible power.
        </strong>
      </p>
      <p className="muted">
        Your frozen power counts once toward participation. Other members’
        ballots and the result stay sealed until selection closes.
      </p>
      <p>
        <Link href="/rules/fundicate-methods-v1">
          Read the full published method specification
        </Link>{" "}
        · <a href="#round-v3-heading">Your frozen power and allocation rules</a>
      </p>
      {own ? (
        <details>
          <summary>Your recorded method ballot</summary>
          <pre
            className="method-transcript"
            tabIndex={0}
            role="region"
            aria-label="Your recorded method ballot"
          >
            {JSON.stringify(own, null, 2)}
          </pre>
        </details>
      ) : canVote && !message ? (
        <form className="form" onSubmit={submit}>
          <fieldset disabled={pending}>
            {method === "FPTP" && (
              <label className="field">
                <span>Your chosen scheme</span>
                <select
                  value={choice}
                  onChange={(e) => {
                    setChoice(e.target.value);
                    setError("");
                  }}
                >
                  {schemes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {ranked && (
              <>
                <p>
                  Rank your preferences from 1. Leave unwanted schemes unranked;
                  when all your choices leave the count, your ballot exhausts.
                  Duplicate ranks are rejected.
                </p>
                {schemes.map((s) => (
                  <label className="field" key={s.id}>
                    <span>Preference for {s.title}</span>
                    <select
                      value={ranks[s.id] ?? ""}
                      onChange={(e) => {
                        setRanks({ ...ranks, [s.id]: e.target.value });
                        setError("");
                      }}
                    >
                      <option value="">Unranked</option>
                      {schemes.map((_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </>
            )}
            {pairwise && (
              <>
                <p>
                  {pairs.length} assigned comparisons ·{" "}
                  {Object.values(answers).filter(Boolean).length} complete.
                  Every unordered pair is required, including all 1,225
                  comparisons for 50 schemes. Progress stays in this form while
                  you move between pages.
                </p>
                {pairs.slice(page * 20, (page + 1) * 20).map((pair) => (
                  <label className="field" key={pair.key}>
                    <span>
                      {pair.a.title} versus {pair.b.title}
                    </span>
                    <select
                      value={answers[pair.key] ?? ""}
                      onChange={(e) => {
                        setAnswers({
                          ...answers,
                          [pair.key]: e.target.value as "A" | "B" | "DRAW",
                        });
                        setError("");
                      }}
                    >
                      <option value="">Choose a result</option>
                      <option value="A">Prefer {pair.a.title}</option>
                      <option value="B">Prefer {pair.b.title}</option>
                      {method !== "FORCED_PAIRWISE" && (
                        <option value="DRAW">Equal preference / draw</option>
                      )}
                    </select>
                  </label>
                ))}
                {!pairs.length && (
                  <p>
                    One candidate has no comparisons. Submit an uncontested
                    complete ballot.
                  </p>
                )}
                <div className="row">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous comparisons
                  </button>
                  <span role="status">
                    Page {page + 1} of {pages}
                  </span>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={page + 1 >= pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next comparisons
                  </button>
                </div>
              </>
            )}
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? "Recording…" : "Seal my method ballot"}
          </button>
        </form>
      ) : (
        <p className="notice">
          {message ||
            "This account cannot submit a selection ballot in the current window."}
        </p>
      )}
    </section>
  );
}
