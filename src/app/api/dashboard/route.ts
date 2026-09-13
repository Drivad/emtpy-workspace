import { NextResponse } from "next/server";
import {
  getDailyAggregates,
  getAllSyncState,
  getLatestInsight,
  getRecentWorkouts,
  getRecentFasting,
} from "@/lib/queries";

export const runtime = "nodejs";

export async function GET() {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 29);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const dailyAggregates = getDailyAggregates(startDate, endDate);
  const syncState = getAllSyncState();
  const latestInsight = getLatestInsight();
  const recentWorkouts = getRecentWorkouts(10);
  const recentFasting = getRecentFasting(10);

  return NextResponse.json({
    dailyAggregates,
    syncState,
    latestInsight,
    recentWorkouts,
    recentFasting,
  });
}
