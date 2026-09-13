import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertWorkout } from "@/lib/queries";

const schema = z.object({
  workoutType: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  calories: z.number().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { workoutType, startTime, endTime, calories } = parsed.data;
  const durationMin = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000;

  upsertWorkout({ source: "Manual", workoutType, startTime, endTime, durationMin, calories });
  return NextResponse.json({ ok: true, durationMin });
}
