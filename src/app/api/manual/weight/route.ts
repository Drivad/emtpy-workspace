import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertSample } from "@/lib/queries";

const schema = z.object({
  weightKg: z.number().positive(),
  date: z.string(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { weightKg, date } = parsed.data;
  const timestamp = new Date(date).toISOString();

  upsertSample({
    source: "Manual",
    metric: "weight_kg",
    value: weightKg,
    unit: "kg",
    startTime: timestamp,
    endTime: timestamp,
  });
  return NextResponse.json({ ok: true });
}
