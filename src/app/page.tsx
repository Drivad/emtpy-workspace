"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { TrendChart } from "@/components/TrendChart";
import { StatTile } from "@/components/StatTile";
import { ManualEntry } from "@/components/ManualEntry";
import type { DailyAggregate, SyncState } from "@/lib/types";

interface DashboardResponse {
  dailyAggregates: DailyAggregate[];
  syncState: SyncState[];
  latestInsight?: { date: string; content_markdown: string; model: string; created_at: string };
  recentWorkouts: {
    id: number;
    source: string;
    workout_type: string;
    start_time: string;
    duration_min: number | null;
    calories: number | null;
  }[];
  recentFasting: {
    id: number;
    source: string;
    start_time: string;
    end_time: string;
    duration_hours: number | null;
  }[];
}

function average(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function statusDotColor(status: SyncState["status"]): string {
  if (status === "ok") return "var(--status-good)";
  if (status === "error") return "var(--status-critical)";
  return "var(--text-muted)";
}

export default function Home() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    setData(await res.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAppleHealthUpload(file: File) {
    setBusy("apple-health");
    setMessage("Parsing Apple Health export… this can take a few minutes for large files.");
    try {
      const res = await fetch("/api/ingest/apple-health", { method: "POST", body: file });
      const json = await res.json();
      setMessage(
        res.ok
          ? `Imported ${json.recordsProcessed} records, ${json.workoutsProcessed} workouts, ${json.sleepProcessed} sleep sessions from: ${json.sourceApps.join(", ")}`
          : `Import failed: ${json.error}`
      );
    } catch (err) {
      setMessage(`Import failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setBusy(null);
    refresh();
  }

  async function handleGarminSync() {
    setBusy("garmin");
    setMessage("Syncing with Garmin Connect…");
    try {
      const res = await fetch("/api/sync/garmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 }),
      });
      const json = await res.json();
      setMessage(
        res.ok
          ? `Synced ${json.daysProcessed} days and ${json.activitiesProcessed} activities from Garmin.`
          : `Garmin sync failed: ${json.error}`
      );
    } catch (err) {
      setMessage(`Garmin sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setBusy(null);
    refresh();
  }

  async function handleGenerateInsight() {
    setBusy("insight");
    setMessage("Asking Claude for today's strategy…");
    try {
      const res = await fetch("/api/insights/generate", { method: "POST" });
      const json = await res.json();
      setMessage(res.ok ? "Today's insight is ready." : `Insight generation failed: ${json.error}`);
    } catch (err) {
      setMessage(`Insight generation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
    setBusy(null);
    refresh();
  }

  const aggregates = data?.dailyAggregates ?? [];
  const last7 = aggregates.slice(-7);
  const latestWeight = [...aggregates].reverse().find((d) => d.weightKg !== null)?.weightKg ?? null;
  const avgSteps = average(last7.map((d) => d.steps));
  const avgSleepMin = average(last7.map((d) => d.sleepMinutes));
  const workoutsThisWeek = last7.reduce((sum, d) => sum + d.workoutsCount, 0);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Health Strategy</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Apple Health, Garmin, Fastic and Trainiac in one place, with a daily AI briefing instead of guesswork.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
        {(data?.syncState ?? []).length === 0 && (
          <span className="text-xs text-[var(--text-muted)]">No sources synced yet</span>
        )}
        {data?.syncState.map((s) => (
          <div key={s.source} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: statusDotColor(s.status) }}
            />
            <span className="font-medium text-[var(--text-primary)]">{s.source}</span>
            <span>
              {s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString("en-GB") : "never synced"}
            </span>
          </div>
        ))}

        <div className="flex-1" />

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAppleHealthUpload(file);
            e.target.value = "";
          }}
        />
        <button
          className="rounded border border-[var(--gridline)] text-sm px-3 py-1.5 text-[var(--text-primary)] disabled:opacity-50"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy !== null}
        >
          {busy === "apple-health" ? "Importing…" : "Upload Apple Health export.xml"}
        </button>
        <button
          className="rounded border border-[var(--gridline)] text-sm px-3 py-1.5 text-[var(--text-primary)] disabled:opacity-50"
          onClick={handleGarminSync}
          disabled={busy !== null}
        >
          {busy === "garmin" ? "Syncing…" : "Sync Garmin now"}
        </button>
        <button
          className="rounded bg-[var(--series-1)] text-white text-sm px-3 py-1.5 disabled:opacity-50"
          onClick={handleGenerateInsight}
          disabled={busy !== null}
        >
          {busy === "insight" ? "Thinking…" : "Generate today's insight"}
        </button>
      </section>

      {message && <p className="text-sm text-[var(--text-secondary)]">{message}</p>}

      <section className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-5">
        {data?.latestInsight ? (
          <>
            <div className="text-xs text-[var(--text-muted)] mb-2">
              {new Date(data.latestInsight.created_at).toLocaleString("en-GB")} · {data.latestInsight.model}
            </div>
            <div className="prose prose-sm max-w-none text-[var(--text-primary)] prose-headings:text-[var(--text-primary)] prose-strong:text-[var(--text-primary)]">
              <ReactMarkdown>{data.latestInsight.content_markdown}</ReactMarkdown>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--text-muted)]">
            No insight generated yet. Sync some data, then click &quot;Generate today&apos;s insight&quot;.
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile
          label="Latest weight"
          value={latestWeight !== null ? `${latestWeight.toFixed(1)} kg` : "—"}
        />
        <StatTile
          label="Avg steps (7d)"
          value={avgSteps !== null ? avgSteps.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "—"}
        />
        <StatTile
          label="Avg sleep (7d)"
          value={avgSleepMin !== null ? `${(avgSleepMin / 60).toFixed(1)} h` : "—"}
        />
        <StatTile label="Workouts (7d)" value={String(workoutsThisWeek)} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <TrendChart title="Weight" data={aggregates} dataKey="weightKg" color="var(--series-1)" unit="kg" decimals={1} />
        <TrendChart title="Active energy" data={aggregates} dataKey="activeEnergyKcal" color="var(--series-2)" unit="kcal" kind="bar" />
        <TrendChart title="Steps" data={aggregates} dataKey="steps" color="var(--series-3)" unit="steps" kind="bar" />
        <TrendChart
          title="Sleep"
          data={aggregates.map((d) => ({ ...d, sleepMinutes: d.sleepMinutes !== null ? d.sleepMinutes / 60 : null }))}
          dataKey="sleepMinutes"
          color="var(--series-4)"
          unit="h"
          decimals={1}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Recent workouts</h3>
          {data?.recentWorkouts.length ? (
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              {data.recentWorkouts.map((w) => (
                <li key={w.id} className="flex justify-between">
                  <span>
                    {w.workout_type} <span className="text-[var(--text-muted)]">({w.source})</span>
                  </span>
                  <span>
                    {new Date(w.start_time).toLocaleDateString("en-GB")}
                    {w.duration_min ? ` · ${Math.round(w.duration_min)} min` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No workouts yet</p>
          )}
        </div>
        <div className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
          <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Recent fasting sessions</h3>
          {data?.recentFasting.length ? (
            <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
              {data.recentFasting.map((f) => (
                <li key={f.id} className="flex justify-between">
                  <span>{new Date(f.start_time).toLocaleDateString("en-GB")}</span>
                  <span>{f.duration_hours ? `${f.duration_hours.toFixed(1)} h` : "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              No fasting sessions yet — Apple Health has no dedicated fasting type, so log these manually below.
            </p>
          )}
        </div>
      </section>

      <ManualEntry onSaved={refresh} />
    </div>
  );
}
