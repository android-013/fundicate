"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookmarkPlus, Check, SlidersHorizontal } from "lucide-react";
import {
  dashboardWidgets,
  type AnalyticsFilters,
  type AnalyticsSection,
} from "@/lib/analytics-core";
export const widgetNames: Record<string, string> = {
  treasury: "Treasury overview",
  votes: "Voting & decisions",
  communities: "Your communities",
  network: "Network & growth",
  activity: "Community updates",
  contributions: "Personal contributions",
};
export function CustomizeDashboard({ widgets }: { widgets: string[] }) {
  const [chosen, setChosen] = useState(widgets);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/dashboard-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Dashboard saved");
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="customize-dashboard">
      <summary className="button secondary">
        <SlidersHorizontal size={15} />
        Customize
      </summary>
      <div className="customize-panel">
        <h3>Make this space yours.</h3>
        <p>
          Keep the signals you care about. Detailed analytics are always
          available.
        </p>
        {dashboardWidgets.map((widget) => (
          <label className="checkbox" key={widget}>
            <input
              type="checkbox"
              checked={chosen.includes(widget)}
              onChange={(e) =>
                setChosen((v) =>
                  e.target.checked
                    ? [...v, widget]
                    : v.filter((w) => w !== widget),
                )
              }
            />
            {widgetNames[widget]}
          </label>
        ))}
        <button
          type="button"
          className="button primary"
          disabled={busy || !chosen.length}
          onClick={save}
        >
          {busy ? "Saving…" : "Save dashboard"}
        </button>
        {status && <span role="status">{status}</span>}
      </div>
    </details>
  );
}
export function SaveAnalyticsView({
  filters,
  section,
}: {
  filters: AnalyticsFilters;
  section: AnalyticsSection;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function save() {
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch("/api/analytics-save-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, section, filters }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("View saved");
      router.refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="save-view">
      <summary className="button secondary">
        <BookmarkPlus size={15} />
        Save view
      </summary>
      <div className="save-view-panel">
        <label className="field">
          <span>View name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="My monthly treasury report"
          />
        </label>
        <button
          type="button"
          className="button primary"
          onClick={save}
          disabled={busy || name.trim().length < 2}
        >
          <Check size={15} />
          {busy ? "Saving…" : "Save analysis"}
        </button>
        {status && <span role="status">{status}</span>}
      </div>
    </details>
  );
}
