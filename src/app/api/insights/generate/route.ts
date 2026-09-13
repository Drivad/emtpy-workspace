import { NextResponse } from "next/server";
import { generateDailyInsight } from "@/lib/insights";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await generateDailyInsight();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
