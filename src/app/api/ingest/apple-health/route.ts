import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { ingestAppleHealthXmlStream } from "@/lib/appleHealth";
import { upsertSyncState } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!request.body) {
    return NextResponse.json({ error: "No file body received" }, { status: 400 });
  }

  try {
    const nodeStream = Readable.fromWeb(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request.body as any
    );
    const result = await ingestAppleHealthXmlStream(nodeStream);
    upsertSyncState("AppleHealth", "ok", `Ingested ${result.recordsProcessed} records, ${result.workoutsProcessed} workouts, ${result.sleepProcessed} sleep sessions from ${result.sourceApps.join(", ")}`);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    upsertSyncState("AppleHealth", "error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
