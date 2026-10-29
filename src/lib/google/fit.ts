import "server-only";
import { google } from "googleapis";
import type { Auth } from "googleapis";
import { zonedParts } from "@/lib/date";
import type { FitDay, FitSummary } from "@/lib/types";

const DAY_MS = 86_400_000;
const SLEEP_ACTIVITY_TYPE = 72;

/** UTC epoch ms of local midnight for the app timezone, `daysAgo` days back. */
function zonedMidnight(daysAgo: number, now = new Date()) {
  const p = zonedParts(now);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const offset = asUtc - Math.floor(now.getTime() / 60_000) * 60_000;
  return Date.UTC(p.year, p.month - 1, p.day) - offset - daysAgo * DAY_MS;
}

export async function fetchFitSummary(auth: Auth.OAuth2Client, days = 7): Promise<FitSummary> {
  const fitness = google.fitness({ version: "v1", auth });
  const start = zonedMidnight(days - 1);
  const end = Date.now();

  const byDate = new Map<string, FitDay>();
  for (let i = 0; i < days; i++) {
    const date = zonedParts(new Date(start + i * DAY_MS + DAY_MS / 2)).isoDate;
    byDate.set(date, { date, steps: 0, activeMinutes: 0, sleepMinutes: 0 });
  }

  const [agg, sessions] = await Promise.all([
    fitness.users.dataset.aggregate({
      userId: "me",
      requestBody: {
        aggregateBy: [
          { dataTypeName: "com.google.step_count.delta" },
          { dataTypeName: "com.google.active_minutes" },
        ],
        bucketByTime: { durationMillis: String(DAY_MS) },
        startTimeMillis: String(start),
        endTimeMillis: String(end),
      },
    }),
    fitness.users.sessions.list({
      userId: "me",
      activityType: [SLEEP_ACTIVITY_TYPE],
      startTime: new Date(start - DAY_MS / 2).toISOString(),
      endTime: new Date(end).toISOString(),
    }),
  ]);

  for (const bucket of agg.data.bucket ?? []) {
    const date = zonedParts(new Date(Number(bucket.startTimeMillis))).isoDate;
    const day = byDate.get(date);
    if (!day) continue;
    for (const ds of bucket.dataset ?? []) {
      const total = (ds.point ?? []).reduce(
        (sum, pt) => sum + (pt.value?.[0]?.intVal ?? 0),
        0,
      );
      if (ds.dataSourceId?.includes("step_count")) day.steps += total;
      else if (ds.dataSourceId?.includes("active_minutes")) day.activeMinutes += total;
    }
  }

  // Attribute each sleep session to the local date it ended on (the morning).
  for (const s of sessions.data.session ?? []) {
    const startMs = Number(s.startTimeMillis);
    const endMs = Number(s.endTimeMillis);
    if (!startMs || !endMs) continue;
    const day = byDate.get(zonedParts(new Date(endMs)).isoDate);
    if (day) day.sleepMinutes += Math.round((endMs - startMs) / 60_000);
  }

  const history = [...byDate.values()];
  return { today: history[history.length - 1], history };
}
