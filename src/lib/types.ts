export type MetricName =
  | "weight_kg"
  | "steps"
  | "active_energy_kcal"
  | "resting_hr_bpm"
  | "hrv_ms"
  | "stress_avg"
  | "body_battery_avg"
  | "vo2max"
  | "dietary_energy_kcal"
  | "dietary_protein_g"
  | "dietary_carbs_g"
  | "dietary_fat_g";

export type SourceName = "AppleHealth" | "Garmin" | "Manual";

export interface RawSample {
  source: SourceName;
  metric: MetricName;
  value: number;
  unit?: string;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  meta?: Record<string, unknown>;
}

export interface Workout {
  source: SourceName;
  workoutType: string;
  startTime: string;
  endTime: string;
  durationMin?: number;
  calories?: number;
  distanceKm?: number;
  avgHr?: number;
  meta?: Record<string, unknown>;
}

export interface FastingSession {
  source: SourceName;
  startTime: string;
  endTime: string;
  durationHours?: number;
  meta?: Record<string, unknown>;
}

export interface SleepSession {
  source: SourceName;
  startTime: string;
  endTime: string;
  durationMin?: number;
  sleepScore?: number;
  meta?: Record<string, unknown>;
}

export interface DailyAggregate {
  date: string; // YYYY-MM-DD
  steps: number | null;
  activeEnergyKcal: number | null;
  weightKg: number | null;
  restingHrBpm: number | null;
  hrvMs: number | null;
  stressAvg: number | null;
  bodyBatteryAvg: number | null;
  sleepMinutes: number | null;
  sleepScore: number | null;
  workoutsCount: number;
  workoutMinutes: number | null;
  fastingHours: number | null;
  dietaryEnergyKcal: number | null;
  dietaryProteinG: number | null;
  dietaryCarbsG: number | null;
  dietaryFatG: number | null;
}

export interface SyncState {
  source: string;
  lastSyncedAt: string | null;
  status: "idle" | "ok" | "error";
  message: string | null;
}
