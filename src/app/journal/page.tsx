import { requireOwnerPage } from "@/lib/owner-page";
import { Journal } from "@/components/journal/journal";
import { reportWeek } from "@/lib/date";
import type { DietLog, RoutineItem, WeeklyReport } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const { supabase } = await requireOwnerPage();
  const week = reportWeek("current");
  const [{ data: reports }, { data: dietGroups }, { data: dietLogs }] = await Promise.all([
    supabase
      .from("weekly_reports")
      .select("id, week_start, week_end, stats, report, source, updated_at")
      .order("week_start", { ascending: false })
      .limit(12),
    supabase.from("routine_groups").select("id").eq("kind", "diet").eq("is_active", true),
    supabase.from("diet_logs").select("id, item_id, day, followed").gte("day", week.weekStart).lte("day", week.weekEnd),
  ]);
  const groupIds = (dietGroups ?? []).map((g) => g.id as string);
  const { data: dietItems } = groupIds.length
    ? await supabase.from("routines_and_goals").select("*").in("group_id", groupIds).eq("is_active", true).order("sort_order")
    : { data: [] };

  return (
    <Journal
      initialReports={(reports ?? []) as WeeklyReport[]}
      dietItems={(dietItems ?? []) as RoutineItem[]}
      initialDietLogs={(dietLogs ?? []) as DietLog[]}
      weekDays={week.all}
      today={week.today}
    />
  );
}
