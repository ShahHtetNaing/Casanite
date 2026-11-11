import type { SupabaseClient } from "@supabase/supabase-js";
import { periodKey, zonedParts } from "./date";
import type { Completion, HealthLog, RoutineGroup, RoutineItem, UserStats, WeeklyReport } from "./types";

export interface DashboardSummary {
  tasksOpen: number;
  shoppingOpen: number;
  tasks: { id: string; title: string }[];
  meals: number;
  protein: number;
  carbs: number;
  calories: number;
}

export interface DashboardData {
  stats: UserStats;
  groups: RoutineGroup[];
  items: RoutineItem[];
  completions: Completion[];
  recentDays: { completed_on: string }[];
  healthLogs: HealthLog[];
  latestReport: WeeklyReport | null;
  summary: DashboardSummary | null;
}

export function currentPeriodKeys(now = new Date()) {
  return [
    periodKey("daily", now),
    periodKey("weekly", now),
    periodKey("monthly", now),
    periodKey("yearly", now),
    "once",
  ];
}

function daysAgoIso(days: number) {
  const p = zonedParts();
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

export async function loadStats(supabase: SupabaseClient) {
  const stats = must(await supabase.rpc("bootstrap_owner"), "bootstrap_owner") as UserStats;
  const extras = await supabase.rpc("bootstrap_extras");
  if (extras.error) console.error("[bootstrap_extras]", extras.error.message);
  return stats;
}

export async function loadDashboardData(supabase: SupabaseClient): Promise<DashboardData> {
  const stats = await loadStats(supabase);
  const today = zonedParts().isoDate;
  const [groups, items, completions, recentDays, healthLogs, latestReport, tasksOpen, shoppingOpen, tasks, meals] = await Promise.all([
    supabase.from("routine_groups").select("*").order("sort_order").order("created_at"),
    supabase.from("routines_and_goals").select("*").order("sort_order").order("created_at"),
    supabase
      .from("completions")
      .select("id, item_id, period_key, completed_on")
      .in("period_key", currentPeriodKeys()),
    supabase.from("completions").select("completed_on").gte("completed_on", daysAgoIso(29)),
    supabase.from("health_logs").select("*").order("logged_at", { ascending: false }).limit(365),
    supabase
      .from("weekly_reports")
      .select("id, week_start, week_end, stats, report, source, updated_at")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("checklist_items").select("id", { count: "exact", head: true }).eq("list", "tasks").eq("done", false),
    supabase.from("checklist_items").select("id", { count: "exact", head: true }).eq("list", "shopping").eq("done", false),
    supabase.from("checklist_items").select("id,title").eq("list", "tasks").eq("done", false).order("created_at").limit(3),
    supabase.from("meal_logs").select("protein_g,carbs_g,calories_kcal").eq("day", today),
  ]);
  if (latestReport.error) console.error("[weekly_reports]", latestReport.error.message);
  const summaryError = tasksOpen.error ?? shoppingOpen.error ?? tasks.error ?? meals.error;
  if (summaryError) console.error("[dashboard summary]", summaryError.message);
  const routineGroups = (must(groups, "routine_groups") as RoutineGroup[]).filter((group) => group.kind !== "exercise");
  const groupIds = new Set(routineGroups.map((group) => group.id));

  return {
    stats,
    groups: routineGroups,
    items: (must(items, "routines_and_goals") as RoutineItem[]).filter((item) => groupIds.has(item.group_id)),
    completions: must(completions, "completions") as Completion[],
    recentDays: must(recentDays, "completions history") as { completed_on: string }[],
    healthLogs: (must(healthLogs, "health_logs") as HealthLog[]).reverse(),
    latestReport: (latestReport.data ?? null) as WeeklyReport | null,
    summary: summaryError ? null : {
      tasksOpen: tasksOpen.count ?? 0, shoppingOpen: shoppingOpen.count ?? 0, tasks: tasks.data ?? [],
      meals: meals.data?.length ?? 0,
      protein: (meals.data ?? []).reduce((sum, meal) => sum + Number(meal.protein_g ?? 0), 0),
      carbs: (meals.data ?? []).reduce((sum, meal) => sum + Number(meal.carbs_g ?? 0), 0),
      calories: (meals.data ?? []).reduce((sum, meal) => sum + Number(meal.calories_kcal ?? 0), 0),
    },
  };
}
