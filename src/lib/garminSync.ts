import { GarminConnect } from "garmin-connect";
import { upsertSample, upsertSleep, upsertWorkout, upsertSyncState } from "./queries";

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface GarminSyncSummary {
  daysProcessed: number;
  activitiesProcessed: number;
  errors: string[];
}

export async function syncGarmin(days: number): Promise<GarminSyncSummary> {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("GARMIN_EMAIL / GARMIN_PASSWORD are not set in the environment");
  }

  const client = new GarminConnect({ username: email, password });
  await client.login();

  const errors: string[] = [];
  let daysProcessed = 0;

  const today = new Date();
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    const dayStr = dateOnly(date);

    try {
      const [steps, sleepData, heartRate, weightData] = await Promise.all([
        client.getSteps(date).catch(() => null),
        client.getSleepData(date).catch(() => null),
        client.getHeartRate(date).catch(() => null),
        client.getDailyWeightData(date).catch(() => null),
      ]);

      if (typeof steps === "number" && steps > 0) {
        upsertSample({
          source: "Garmin",
          metric: "steps",
          value: steps,
          unit: "count",
          startTime: `${dayStr}T00:00:00.000Z`,
          endTime: `${dayStr}T23:59:59.000Z`,
        });
      }

      if (sleepData?.dailySleepDTO?.sleepStartTimestampGMT) {
        const dto = sleepData.dailySleepDTO;
        const startTime = new Date(dto.sleepStartTimestampGMT).toISOString();
        const endTime = new Date(dto.sleepEndTimestampGMT).toISOString();
        upsertSleep({
          source: "Garmin",
          startTime,
          endTime,
          durationMin: dto.sleepTimeSeconds / 60,
          sleepScore: sleepData.dailySleepDTO.sleepScores?.overall?.value,
        });

        if (typeof sleepData.avgOvernightHrv === "number") {
          upsertSample({
            source: "Garmin",
            metric: "hrv_ms",
            value: sleepData.avgOvernightHrv,
            unit: "ms",
            startTime,
            endTime,
          });
        }
        if (typeof dto.avgSleepStress === "number") {
          upsertSample({
            source: "Garmin",
            metric: "stress_avg",
            value: dto.avgSleepStress,
            unit: "index",
            startTime,
            endTime,
          });
        }
        if (typeof sleepData.bodyBatteryChange === "number") {
          upsertSample({
            source: "Garmin",
            metric: "body_battery_avg",
            value: sleepData.bodyBatteryChange,
            unit: "index",
            startTime,
            endTime,
            meta: { note: "overnight body battery change, not a daily average" },
          });
        }
      }

      if (heartRate?.restingHeartRate) {
        upsertSample({
          source: "Garmin",
          metric: "resting_hr_bpm",
          value: heartRate.restingHeartRate,
          unit: "bpm",
          startTime: `${dayStr}T00:00:00.000Z`,
          endTime: `${dayStr}T23:59:59.000Z`,
        });
      }

      if (weightData?.dateWeightList?.length) {
        const latest = weightData.dateWeightList[weightData.dateWeightList.length - 1];
        upsertSample({
          source: "Garmin",
          metric: "weight_kg",
          value: latest.weight / 1000,
          unit: "kg",
          startTime: new Date(latest.timestampGMT).toISOString(),
          endTime: new Date(latest.timestampGMT).toISOString(),
        });
      }

      daysProcessed++;
    } catch (err) {
      errors.push(`${dayStr}: ${err instanceof Error ? err.message : String(err)}`);
    }

    await sleep(250);
  }

  let activitiesProcessed = 0;
  try {
    const activities = await client.getActivities(0, 50);
    const cutoff = new Date(today);
    cutoff.setUTCDate(cutoff.getUTCDate() - days);

    for (const activity of activities) {
      const startTime = new Date(activity.startTimeGMT);
      if (startTime < cutoff) continue;
      const durationMin = activity.duration / 60;
      const endTime = new Date(startTime.getTime() + activity.duration * 1000);
      upsertWorkout({
        source: "Garmin",
        workoutType: activity.activityType?.typeKey || "unknown",
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMin,
        calories: activity.calories,
        distanceKm: activity.distance ? activity.distance / 1000 : undefined,
        avgHr: activity.averageHR,
      });
      activitiesProcessed++;
    }
  } catch (err) {
    errors.push(`activities: ${err instanceof Error ? err.message : String(err)}`);
  }

  upsertSyncState(
    "Garmin",
    errors.length === 0 ? "ok" : "error",
    errors.length === 0
      ? `Synced ${daysProcessed} days, ${activitiesProcessed} activities`
      : errors.join("; ")
  );

  return { daysProcessed, activitiesProcessed, errors };
}
