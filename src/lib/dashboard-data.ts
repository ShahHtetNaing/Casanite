import type { SupabaseClient } from "@supabase/supabase-js";
import { periodKey, zonedParts } from "./date";
import type { Completion, HealthLog, RoutineGroup, RoutineItem, UserStats } from "./types";

export interface DashboardData {
  stats: UserStats;
  groups: RoutineGroup[];
  items: RoutineItem[];
  completions: Completion[];
  recentDays: { completed_on: string }[];
  healthLogs: HealthLog[];
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
  return must(await supabase.rpc("bootstrap_owner"), "bootstrap_owner") as UserStats;
}

export async function loadDashboardData(supabase: SupabaseClient): Promise<DashboardData> {
  const stats = await loadStats(supabase);
  const [groups, items, completions, recentDays, healthLogs] = await Promise.all([
    supabase.from("routine_groups").select("*").order("sort_order").order("created_at"),
    supabase.from("routines_and_goals").select("*").order("sort_order").order("created_at"),
    supabase
      .from("completions")
      .select("id, item_id, period_key, completed_on")
      .in("period_key", currentPeriodKeys()),
    supabase.from("completions").select("completed_on").gte("completed_on", daysAgoIso(13)),
    supabase.from("health_logs").select("*").order("logged_at", { ascending: true }).limit(365),
  ]);

  return {
    stats,
    groups: must(groups, "routine_groups") as RoutineGroup[],
    items: must(items, "routines_and_goals") as RoutineItem[],
    completions: must(completions, "completions") as Completion[],
    recentDays: must(recentDays, "completions history") as { completed_on: string }[],
    healthLogs: must(healthLogs, "health_logs") as HealthLog[],
  };
}
