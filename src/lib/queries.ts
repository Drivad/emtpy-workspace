import { getDb } from "./db";
import type {
  RawSample,
  Workout,
  FastingSession,
  SleepSession,
  DailyAggregate,
  SyncState,
} from "./types";

export function upsertSample(s: RawSample): void {
  getDb()
    .prepare(
      `INSERT INTO raw_samples (source, metric, value, unit, start_time, end_time, meta)
       VALUES (@source, @metric, @value, @unit, @startTime, @endTime, @meta)
       ON CONFLICT(source, metric, start_time, end_time) DO UPDATE SET value = excluded.value, unit = excluded.unit, meta = excluded.meta`
    )
    .run({ ...s, unit: s.unit ?? null, meta: s.meta ? JSON.stringify(s.meta) : null });
}

export function upsertWorkout(w: Workout): void {
  getDb()
    .prepare(
      `INSERT INTO workouts (source, workout_type, start_time, end_time, duration_min, calories, distance_km, avg_hr, meta)
       VALUES (@source, @workoutType, @startTime, @endTime, @durationMin, @calories, @distanceKm, @avgHr, @meta)
       ON CONFLICT(source, workout_type, start_time) DO UPDATE SET
         end_time = excluded.end_time, duration_min = excluded.duration_min,
         calories = excluded.calories, distance_km = excluded.distance_km,
         avg_hr = excluded.avg_hr, meta = excluded.meta`
    )
    .run({
      ...w,
      durationMin: w.durationMin ?? null,
      calories: w.calories ?? null,
      distanceKm: w.distanceKm ?? null,
      avgHr: w.avgHr ?? null,
      meta: w.meta ? JSON.stringify(w.meta) : null,
    });
}

export function upsertFasting(f: FastingSession): void {
  getDb()
    .prepare(
      `INSERT INTO fasting_sessions (source, start_time, end_time, duration_hours, meta)
       VALUES (@source, @startTime, @endTime, @durationHours, @meta)
       ON CONFLICT(source, start_time) DO UPDATE SET
         end_time = excluded.end_time, duration_hours = excluded.duration_hours, meta = excluded.meta`
    )
    .run({
      ...f,
      durationHours: f.durationHours ?? null,
      meta: f.meta ? JSON.stringify(f.meta) : null,
    });
}

export function upsertSleep(s: SleepSession): void {
  getDb()
    .prepare(
      `INSERT INTO sleep_sessions (source, start_time, end_time, duration_min, sleep_score, meta)
       VALUES (@source, @startTime, @endTime, @durationMin, @sleepScore, @meta)
       ON CONFLICT(source, start_time) DO UPDATE SET
         end_time = excluded.end_time, duration_min = excluded.duration_min,
         sleep_score = excluded.sleep_score, meta = excluded.meta`
    )
    .run({
      ...s,
      durationMin: s.durationMin ?? null,
      sleepScore: s.sleepScore ?? null,
      meta: s.meta ? JSON.stringify(s.meta) : null,
    });
}

function dayBucket(col: string) {
  return `substr(${col}, 1, 10)`;
}

export function getDailyAggregates(startDate: string, endDate: string): DailyAggregate[] {
  const db = getDb();

  const days: string[] = [];
  for (
    let d = new Date(startDate + "T00:00:00Z");
    d.getTime() <= new Date(endDate + "T00:00:00Z").getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }

  const metricRows = db
    .prepare(
      `SELECT ${dayBucket("start_time")} as date, metric, AVG(value) as avgValue, SUM(value) as sumValue
       FROM raw_samples
       WHERE ${dayBucket("start_time")} BETWEEN ? AND ?
       GROUP BY date, metric`
    )
    .all(startDate, endDate) as { date: string; metric: string; avgValue: number; sumValue: number }[];

  const sleepRows = db
    .prepare(
      `SELECT ${dayBucket("start_time")} as date, SUM(duration_min) as minutes, AVG(sleep_score) as score
       FROM sleep_sessions
       WHERE ${dayBucket("start_time")} BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(startDate, endDate) as { date: string; minutes: number; score: number | null }[];

  const workoutRows = db
    .prepare(
      `SELECT ${dayBucket("start_time")} as date, COUNT(*) as count, SUM(duration_min) as minutes
       FROM workouts
       WHERE ${dayBucket("start_time")} BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(startDate, endDate) as { date: string; count: number; minutes: number }[];

  const fastingRows = db
    .prepare(
      `SELECT ${dayBucket("start_time")} as date, SUM(duration_hours) as hours
       FROM fasting_sessions
       WHERE ${dayBucket("start_time")} BETWEEN ? AND ?
       GROUP BY date`
    )
    .all(startDate, endDate) as { date: string; hours: number }[];

  const byDate = new Map<string, DailyAggregate>();
  for (const date of days) {
    byDate.set(date, {
      date,
      steps: null,
      activeEnergyKcal: null,
      weightKg: null,
      restingHrBpm: null,
      hrvMs: null,
      stressAvg: null,
      bodyBatteryAvg: null,
      sleepMinutes: null,
      sleepScore: null,
      workoutsCount: 0,
      workoutMinutes: null,
      fastingHours: null,
      dietaryEnergyKcal: null,
      dietaryProteinG: null,
      dietaryCarbsG: null,
      dietaryFatG: null,
    });
  }

  for (const row of metricRows) {
    const agg = byDate.get(row.date);
    if (!agg) continue;
    switch (row.metric) {
      case "steps":
        agg.steps = row.sumValue;
        break;
      case "active_energy_kcal":
        agg.activeEnergyKcal = row.sumValue;
        break;
      case "weight_kg":
        agg.weightKg = row.avgValue;
        break;
      case "resting_hr_bpm":
        agg.restingHrBpm = row.avgValue;
        break;
      case "hrv_ms":
        agg.hrvMs = row.avgValue;
        break;
      case "stress_avg":
        agg.stressAvg = row.avgValue;
        break;
      case "body_battery_avg":
        agg.bodyBatteryAvg = row.avgValue;
        break;
      case "dietary_energy_kcal":
        agg.dietaryEnergyKcal = row.sumValue;
        break;
      case "dietary_protein_g":
        agg.dietaryProteinG = row.sumValue;
        break;
      case "dietary_carbs_g":
        agg.dietaryCarbsG = row.sumValue;
        break;
      case "dietary_fat_g":
        agg.dietaryFatG = row.sumValue;
        break;
    }
  }

  for (const row of sleepRows) {
    const agg = byDate.get(row.date);
    if (!agg) continue;
    agg.sleepMinutes = row.minutes;
    agg.sleepScore = row.score;
  }

  for (const row of workoutRows) {
    const agg = byDate.get(row.date);
    if (!agg) continue;
    agg.workoutsCount = row.count;
    agg.workoutMinutes = row.minutes;
  }

  for (const row of fastingRows) {
    const agg = byDate.get(row.date);
    if (!agg) continue;
    agg.fastingHours = row.hours;
  }

  return days.map((d) => byDate.get(d)!);
}

export function getLatestWeightKg(): number | null {
  const row = getDb()
    .prepare(
      `SELECT value FROM raw_samples WHERE metric = 'weight_kg' ORDER BY start_time DESC LIMIT 1`
    )
    .get() as { value: number } | undefined;
  return row ? row.value : null;
}

export function getRecentWorkouts(limit = 10) {
  return getDb()
    .prepare(`SELECT * FROM workouts ORDER BY start_time DESC LIMIT ?`)
    .all(limit);
}

export function getRecentFasting(limit = 10) {
  return getDb()
    .prepare(`SELECT * FROM fasting_sessions ORDER BY start_time DESC LIMIT ?`)
    .all(limit);
}

export function upsertSyncState(source: string, status: SyncState["status"], message: string | null) {
  getDb()
    .prepare(
      `INSERT INTO sync_state (source, last_synced_at, status, message)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET last_synced_at = excluded.last_synced_at, status = excluded.status, message = excluded.message`
    )
    .run(source, new Date().toISOString(), status, message);
}

export function getAllSyncState(): SyncState[] {
  const rows = getDb().prepare(`SELECT * FROM sync_state`).all() as {
    source: string;
    last_synced_at: string | null;
    status: SyncState["status"];
    message: string | null;
  }[];
  return rows.map((r) => ({
    source: r.source,
    lastSyncedAt: r.last_synced_at,
    status: r.status,
    message: r.message,
  }));
}

export function saveInsight(date: string, markdown: string, model: string, inputSummary: unknown) {
  getDb()
    .prepare(
      `INSERT INTO insights (date, content_markdown, model, created_at, input_summary_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET content_markdown = excluded.content_markdown, model = excluded.model, created_at = excluded.created_at, input_summary_json = excluded.input_summary_json`
    )
    .run(date, markdown, model, new Date().toISOString(), JSON.stringify(inputSummary));
}

export function getInsightForDate(date: string) {
  return getDb().prepare(`SELECT * FROM insights WHERE date = ?`).get(date) as
    | { date: string; content_markdown: string; model: string; created_at: string }
    | undefined;
}

export function getLatestInsight() {
  return getDb().prepare(`SELECT * FROM insights ORDER BY date DESC LIMIT 1`).get() as
    | { date: string; content_markdown: string; model: string; created_at: string }
    | undefined;
}
