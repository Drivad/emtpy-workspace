import { NextRequest, NextResponse } from "next/server";
import { syncGarmin } from "@/lib/garminSync";
import { upsertSyncState } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const days = typeof body.days === "number" ? body.days : 14;

  try {
    const result = await syncGarmin(days);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    upsertSyncState("Garmin", "error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
