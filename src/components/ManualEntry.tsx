"use client";

import { useState } from "react";

interface Props {
  onSaved: () => void;
}

function toIso(localDateTime: string): string {
  return new Date(localDateTime).toISOString();
}

export function ManualEntry({ onSaved }: Props) {
  const [fastingStart, setFastingStart] = useState("");
  const [fastingEnd, setFastingEnd] = useState("");
  const [workoutType, setWorkoutType] = useState("Strength");
  const [workoutStart, setWorkoutStart] = useState("");
  const [workoutEnd, setWorkoutEnd] = useState("");
  const [workoutCalories, setWorkoutCalories] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [weightDate, setWeightDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submitFasting(e: React.FormEvent) {
    e.preventDefault();
    if (!fastingStart || !fastingEnd) return;
    setBusy("fasting");
    setMessage(null);
    const res = await fetch("/api/manual/fasting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startTime: toIso(fastingStart), endTime: toIso(fastingEnd) }),
    });
    setBusy(null);
    if (res.ok) {
      setFastingStart("");
      setFastingEnd("");
      setMessage("Fasting session logged.");
      onSaved();
    } else {
      setMessage("Failed to log fasting session.");
    }
  }

  async function submitWorkout(e: React.FormEvent) {
    e.preventDefault();
    if (!workoutStart || !workoutEnd) return;
    setBusy("workout");
    setMessage(null);
    const res = await fetch("/api/manual/workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workoutType,
        startTime: toIso(workoutStart),
        endTime: toIso(workoutEnd),
        calories: workoutCalories ? Number(workoutCalories) : undefined,
      }),
    });
    setBusy(null);
    if (res.ok) {
      setWorkoutStart("");
      setWorkoutEnd("");
      setWorkoutCalories("");
      setMessage("Workout logged.");
      onSaved();
    } else {
      setMessage("Failed to log workout.");
    }
  }

  async function submitWeight(e: React.FormEvent) {
    e.preventDefault();
    if (!weightKg || !weightDate) return;
    setBusy("weight");
    setMessage(null);
    const res = await fetch("/api/manual/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weightKg: Number(weightKg), date: weightDate }),
    });
    setBusy(null);
    if (res.ok) {
      setWeightKg("");
      setMessage("Weight logged.");
      onSaved();
    } else {
      setMessage("Failed to log weight.");
    }
  }

  const inputClass =
    "w-full rounded border border-[var(--gridline)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)]";
  const buttonClass =
    "rounded bg-[var(--series-1)] text-white text-sm px-3 py-1.5 disabled:opacity-50";

  return (
    <div className="rounded-lg border border-[var(--gridline)] bg-[var(--surface-1)] p-4">
      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">
        Manual entry (fallback for anything Apple Health doesn&apos;t carry)
      </h3>
      {message && <p className="text-xs text-[var(--text-secondary)] mb-3">{message}</p>}
      <div className="grid gap-4 md:grid-cols-3">
        <form onSubmit={submitFasting} className="space-y-2">
          <div className="text-xs text-[var(--text-muted)]">Fasting session</div>
          <input
            type="datetime-local"
            className={inputClass}
            value={fastingStart}
            onChange={(e) => setFastingStart(e.target.value)}
            required
          />
          <input
            type="datetime-local"
            className={inputClass}
            value={fastingEnd}
            onChange={(e) => setFastingEnd(e.target.value)}
            required
          />
          <button type="submit" className={buttonClass} disabled={busy === "fasting"}>
            {busy === "fasting" ? "Saving…" : "Log fast"}
          </button>
        </form>

        <form onSubmit={submitWorkout} className="space-y-2">
          <div className="text-xs text-[var(--text-muted)]">Workout</div>
          <input
            type="text"
            className={inputClass}
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            placeholder="Strength, Running…"
          />
          <input
            type="datetime-local"
            className={inputClass}
            value={workoutStart}
            onChange={(e) => setWorkoutStart(e.target.value)}
            required
          />
          <input
            type="datetime-local"
            className={inputClass}
            value={workoutEnd}
            onChange={(e) => setWorkoutEnd(e.target.value)}
            required
          />
          <input
            type="number"
            className={inputClass}
            value={workoutCalories}
            onChange={(e) => setWorkoutCalories(e.target.value)}
            placeholder="Calories (optional)"
          />
          <button type="submit" className={buttonClass} disabled={busy === "workout"}>
            {busy === "workout" ? "Saving…" : "Log workout"}
          </button>
        </form>

        <form onSubmit={submitWeight} className="space-y-2">
          <div className="text-xs text-[var(--text-muted)]">Weight</div>
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="kg"
          />
          <input
            type="date"
            className={inputClass}
            value={weightDate}
            onChange={(e) => setWeightDate(e.target.value)}
            required
          />
          <button type="submit" className={buttonClass} disabled={busy === "weight"}>
            {busy === "weight" ? "Saving…" : "Log weight"}
          </button>
        </form>
      </div>
    </div>
  );
}
