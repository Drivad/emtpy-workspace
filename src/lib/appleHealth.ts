import sax from "sax";
import type { Readable } from "node:stream";
import { getDb } from "./db";
import { upsertSample, upsertWorkout, upsertSleep } from "./queries";

const LB_TO_KG = 0.45359237;
const MI_TO_KM = 1.60934;

function normalizeAttrs(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    out[key.toLowerCase()] = raw[key];
  }
  return out;
}

function toIso(healthKitDate: string): string {
  // Apple Health dates look like "2024-01-15 08:30:00 +0000"
  const isoish = healthKitDate.replace(" ", "T").replace(/ ([+-]\d{2}):?(\d{2})$/, "$1:$2");
  const d = new Date(isoish);
  return isNaN(d.getTime()) ? healthKitDate : d.toISOString();
}

function quantityToSample(attrs: Record<string, string>) {
  const type = attrs.type;
  const startTime = toIso(attrs.startdate);
  const endTime = toIso(attrs.enddate);
  const rawValue = parseFloat(attrs.value);
  if (isNaN(rawValue)) return null;

  const sourceApp = attrs.sourcename || "Unknown";

  switch (type) {
    case "HKQuantityTypeIdentifierBodyMass": {
      const value = attrs.unit === "lb" ? rawValue * LB_TO_KG : rawValue;
      return { metric: "weight_kg" as const, value, unit: "kg", startTime, endTime, sourceApp };
    }
    case "HKQuantityTypeIdentifierStepCount":
      return { metric: "steps" as const, value: rawValue, unit: "count", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierActiveEnergyBurned":
      return { metric: "active_energy_kcal" as const, value: rawValue, unit: "kcal", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierRestingHeartRate":
      return { metric: "resting_hr_bpm" as const, value: rawValue, unit: "bpm", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierHeartRateVariabilitySDNN":
      return { metric: "hrv_ms" as const, value: rawValue, unit: "ms", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierVO2Max":
      return { metric: "vo2max" as const, value: rawValue, unit: attrs.unit, startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierDietaryEnergyConsumed":
      return { metric: "dietary_energy_kcal" as const, value: rawValue, unit: "kcal", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierDietaryProtein":
      return { metric: "dietary_protein_g" as const, value: rawValue, unit: "g", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierDietaryCarbohydrates":
      return { metric: "dietary_carbs_g" as const, value: rawValue, unit: "g", startTime, endTime, sourceApp };
    case "HKQuantityTypeIdentifierDietaryFatTotal":
      return { metric: "dietary_fat_g" as const, value: rawValue, unit: "g", startTime, endTime, sourceApp };
    default:
      return null;
  }
}

function minutesBetween(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
}

interface WorkoutAccumulator {
  sourceApp: string;
  workoutType: string;
  startTime: string;
  endTime: string;
  durationMin?: number;
  calories?: number;
  distanceKm?: number;
}

export interface IngestResult {
  recordsProcessed: number;
  workoutsProcessed: number;
  sleepProcessed: number;
  sourceApps: string[];
}

export async function ingestAppleHealthXmlStream(input: Readable): Promise<IngestResult> {
  const parser = sax.createStream(false, { trim: true });
  const db = getDb();
  const sourceApps = new Set<string>();
  let recordsProcessed = 0;
  let workoutsProcessed = 0;
  let sleepProcessed = 0;
  let currentWorkout: WorkoutAccumulator | null = null;

  db.exec("BEGIN");

  parser.on("opentag", (node) => {
    const attrs = normalizeAttrs(node.attributes as Record<string, string>);
    const tagName = node.name.toLowerCase();
    try {
      if (tagName === "record") {
        const type = attrs.type;
        if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
          if ((attrs.value || "").startsWith("HKCategoryValueSleepAnalysisAsleep")) {
            const startTime = toIso(attrs.startdate);
            const endTime = toIso(attrs.enddate);
            upsertSleep({
              source: "AppleHealth",
              startTime,
              endTime,
              durationMin: minutesBetween(startTime, endTime),
              meta: { sourceApp: attrs.sourcename },
            });
            sleepProcessed++;
            sourceApps.add(attrs.sourcename || "Unknown");
          }
        } else {
          const sample = quantityToSample(attrs);
          if (sample) {
            upsertSample({
              source: "AppleHealth",
              metric: sample.metric,
              value: sample.value,
              unit: sample.unit,
              startTime: sample.startTime,
              endTime: sample.endTime,
              meta: { sourceApp: sample.sourceApp },
            });
            recordsProcessed++;
            sourceApps.add(sample.sourceApp);
          }
        }
      } else if (tagName === "workout") {
        const durationUnit = attrs.durationunit || "min";
        const durationRaw = parseFloat(attrs.duration);
        const durationMin = isNaN(durationRaw)
          ? undefined
          : durationUnit === "hr"
          ? durationRaw * 60
          : durationRaw;

        const caloriesRaw = parseFloat(attrs.totalenergyburned);
        const calories = isNaN(caloriesRaw) ? undefined : caloriesRaw;

        const distanceRaw = parseFloat(attrs.totaldistance);
        const distanceUnit = attrs.totaldistanceunit;
        const distanceKm = isNaN(distanceRaw)
          ? undefined
          : distanceUnit === "mi"
          ? distanceRaw * MI_TO_KM
          : distanceRaw;

        currentWorkout = {
          sourceApp: attrs.sourcename || "Unknown",
          workoutType: (attrs.workoutactivitytype || "Unknown").replace("HKWorkoutActivityType", ""),
          startTime: toIso(attrs.startdate),
          endTime: toIso(attrs.enddate),
          durationMin,
          calories,
          distanceKm,
        };
      } else if (tagName === "workoutstatistics" && currentWorkout) {
        const type = attrs.type;
        const sum = parseFloat(attrs.sum);
        if (!isNaN(sum)) {
          if (type === "HKQuantityTypeIdentifierActiveEnergyBurned" && currentWorkout.calories === undefined) {
            currentWorkout.calories = sum;
          } else if (
            (type === "HKQuantityTypeIdentifierDistanceWalkingRunning" ||
              type === "HKQuantityTypeIdentifierDistanceCycling") &&
            currentWorkout.distanceKm === undefined
          ) {
            currentWorkout.distanceKm = attrs.unit === "mi" ? sum * MI_TO_KM : sum;
          }
        }
      }
    } catch {
      // skip malformed record, keep streaming
    }
  });

  parser.on("closetag", (name) => {
    if (name.toLowerCase() === "workout" && currentWorkout) {
      const w = currentWorkout;
      upsertWorkout({
        source: "AppleHealth",
        workoutType: w.workoutType,
        startTime: w.startTime,
        endTime: w.endTime,
        durationMin: w.durationMin ?? minutesBetween(w.startTime, w.endTime),
        calories: w.calories,
        distanceKm: w.distanceKm,
        meta: { sourceApp: w.sourceApp },
      });
      sourceApps.add(w.sourceApp);
      workoutsProcessed++;
      currentWorkout = null;
    }
  });

  return new Promise((resolve, reject) => {
    parser.on("end", () => {
      db.exec("COMMIT");
      resolve({ recordsProcessed, workoutsProcessed, sleepProcessed, sourceApps: [...sourceApps] });
    });
    parser.on("error", (err) => {
      db.exec("ROLLBACK");
      reject(err);
    });
    input.pipe(parser);
  });
}
