import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { upsertFasting } from "@/lib/queries";

const schema = z.object({
  startTime: z.string(),
  endTime: z.string(),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { startTime, endTime } = parsed.data;
  const durationHours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;

  upsertFasting({ source: "Manual", startTime, endTime, durationHours });
  return NextResponse.json({ ok: true, durationHours });
}
