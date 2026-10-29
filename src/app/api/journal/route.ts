import { ownerRoute } from "@/lib/owner-route";
import { generateWeeklyReport } from "@/lib/weekly-review";
import type { ReportWeek } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { week?: ReportWeek };
  const week: ReportWeek = body.week === "previous" ? "previous" : "current";
  return ownerRoute(async (supabase, userId) => {
    const refreshed = await supabase.rpc("recompute_user_stats");
    if (refreshed.error) throw new Error(refreshed.error.message);
    return { report: await generateWeeklyReport(supabase, userId, week, "manual") };
  });
}
