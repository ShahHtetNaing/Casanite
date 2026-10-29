import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chatJson } from "./ai";
import { EXP_PER_LEVEL } from "./config";
import { effectiveFrequency, isScheduledOn, periodKey, reportWeek, zonedParts } from "./date";
import type {
  ReportWeek,
  RoutineGroup,
  RoutineItem,
  WeeklyReport,
  WeeklyReportContent,
  WeeklyStats,
} from "./types";

const NON_QUEST_KINDS = new Set(["diet", "goal"]);

const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
/** Items only count from the day they were added (app timezone). */
const existedOn = (item: RoutineItem & { created_at?: string }, date: string) =>
  !item.created_at || date >= zonedParts(new Date(item.created_at)).isoDate;

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data as T;
}

/** Aggregates one week of activity. Every query filters by userId so it also works with the service-role client. */
export async function collectWeeklyStats(supabase: SupabaseClient, userId: string, which: ReportWeek) {
  const { weekStart, weekEnd, days } = reportWeek(which);
  // Snapshot as of the last counted day (today for the current week, Sunday for last week).
  const asOf = days[days.length - 1];
  const asOfEnd = new Date(`${asOf}T23:59:59.999+08:00`).toISOString();
  const startTs = new Date(`${weekStart}T00:00:00+08:00`).toISOString();
  const [groupsRes, itemsRes, compRes, statsRes, tasksRes, openRes, dietRes, weightRes] = await Promise.all([
    supabase.from("routine_groups").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
    supabase.from("routines_and_goals").select("*").eq("user_id", userId).eq("is_active", true).order("sort_order"),
    supabase
      .from("completions")
      .select("item_id, item_title, period_key, completed_on, exp_awarded")
      .eq("user_id", userId)
      .gte("completed_on", weekStart)
      .lte("completed_on", weekEnd),
    supabase.rpc("stats_as_of", { p_user: userId, p_day: asOf }).single(),
    supabase
      .from("checklist_items")
      .select("title")
      .eq("user_id", userId)
      .eq("list", "tasks")
      .eq("done", true)
      .gte("done_at", startTs)
      .lte("done_at", asOfEnd),
    supabase
      .from("checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("list", "tasks")
      .lte("created_at", asOfEnd)
      .or(`done.eq.false,done_at.gt.${asOfEnd}`),
    supabase.from("diet_logs").select("item_id, day, followed").eq("user_id", userId).gte("day", weekStart).lte("day", weekEnd),
    supabase
      .from("health_logs")
      .select("weight_kg, logged_at")
      .eq("user_id", userId)
      .not("weight_kg", "is", null)
      .lte("logged_at", asOfEnd)
      .order("logged_at", { ascending: false })
      .limit(1),
  ]);

  const groups = must(groupsRes, "routine_groups") as RoutineGroup[];
  const items = must(itemsRes, "routines_and_goals") as RoutineItem[];
  const completions = must(compRes, "completions") as {
    item_id: string | null;
    period_key: string;
    completed_on: string;
    exp_awarded: number;
  }[];
  const asOfStats = must(statsRes, "stats_as_of") as { exp: number; streak: number; longest_streak: number };
  const doneTasks = must(tasksRes, "checklist_items") as { title: string }[];
  const dietLogs = must(dietRes, "diet_logs") as { item_id: string; day: string; followed: boolean }[];
  const lastWeight = (must(weightRes, "health_logs") as { weight_kg: number; logged_at: string }[])[0];

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const doneOn = new Map<string, number>();
  for (const c of completions) {
    if (!c.item_id) continue;
    const k = `${c.item_id}|${c.completed_on}`;
    doneOn.set(k, (doneOn.get(k) ?? 0) + 1);
  }

  const byDay = days.map((date) => ({ date, done: 0, scheduled: 0 }));
  const groupStats = new Map<string, WeeklyStats["groups"][number]>();
  const gymStats = new Map<string, WeeklyStats["gym"][number]>();
  const weekly: WeeklyStats["weekly"] = [];
  const weekKey = periodKey("weekly", new Date(`${weekStart}T12:00:00+08:00`));

  for (const item of items) {
    const group = groupById.get(item.group_id);
    if (!group || !item.is_trackable || NON_QUEST_KINDS.has(group.kind)) continue;
    const freq = effectiveFrequency(item, group);
    if (freq === "weekly") {
      const done = completions.filter((c) => c.item_id === item.id && c.period_key === weekKey).length;
      weekly.push({ title: item.title, done: Math.min(done, item.target_count), target: item.target_count });
      continue;
    }
    if (freq !== "daily") continue;
    const gs = groupStats.get(group.id) ?? { title: group.title, kind: group.kind, done: 0, scheduled: 0 };
    groupStats.set(group.id, gs);
    days.forEach((date, i) => {
      if (!existedOn(item, date) || !isScheduledOn(item, group, weekdayOf(date))) return;
      const done = Math.min(doneOn.get(`${item.id}|${date}`) ?? 0, item.target_count);
      gs.scheduled += item.target_count;
      gs.done += done;
      byDay[i].scheduled += item.target_count;
      byDay[i].done += done;
    });
  }

  // Gym = exercise groups tied to specific weekdays (Push / Pull / Legs / Cardio).
  for (const group of groups) {
    const fixedDays = group.days_of_week && group.days_of_week.length > 0 && group.days_of_week.length < 7;
    if (group.kind !== "exercise" || !fixedDays) continue;
    // Weekly-frequency exercises are reported under `weekly`, not as per-session sets.
    const groupItems = items.filter(
      (i) => i.group_id === group.id && i.is_trackable && effectiveFrequency(i, group) === "daily",
    );
    const gym = { title: group.title, scheduledDays: 0, sessionsDone: 0, itemsDone: 0, itemsScheduled: 0 };
    for (const date of days) {
      const scheduled = groupItems.filter((i) => existedOn(i, date) && isScheduledOn(i, group, weekdayOf(date)));
      if (!scheduled.length) continue;
      const done = scheduled.filter((i) => doneOn.has(`${i.id}|${date}`)).length;
      gym.scheduledDays += 1;
      gym.itemsScheduled += scheduled.length;
      gym.itemsDone += done;
      if (done * 2 >= scheduled.length) gym.sessionsDone += 1;
    }
    gymStats.set(group.id, gym);
  }

  const diet = items
    .filter((i) => groupById.get(i.group_id)?.kind === "diet")
    .map((i) => {
      const logs = dietLogs.filter((l) => l.item_id === i.id);
      const followed = logs.filter((l) => l.followed).length;
      const missed = logs.length - followed;
      const eligible = days.filter((d) => existedOn(i, d)).length;
      return { title: i.title, followed, missed, unlogged: Math.max(eligible - logs.length, 0) };
    });

  const exp = asOfStats.exp;
  const expGained = completions.reduce((s, c) => s + (c.exp_awarded ?? 0), 0);
  const stats: WeeklyStats = {
    weekStart,
    weekEnd,
    daysElapsed: days.length,
    level: Math.floor(exp / EXP_PER_LEVEL) + 1,
    levelAtStart: Math.floor(Math.max(exp - expGained, 0) / EXP_PER_LEVEL) + 1,
    exp,
    expGained,
    streak: asOfStats.streak,
    longestStreak: asOfStats.longest_streak,
    activeDays: new Set(completions.map((c) => c.completed_on)).size,
    quests: {
      done: byDay.reduce((s, d) => s + d.done, 0),
      scheduled: byDay.reduce((s, d) => s + d.scheduled, 0),
    },
    byDay,
    groups: [...groupStats.values()],
    gym: [...gymStats.values()],
    weekly,
    tasks: { completed: doneTasks.length, open: openRes.count ?? 0, completedTitles: doneTasks.slice(0, 15).map((t) => t.title) },
    diet,
    weight: lastWeight ? { kg: Number(lastWeight.weight_kg), on: lastWeight.logged_at.slice(0, 10) } : null,
  };

  const dietRules = items
    .filter((i) => groupById.get(i.group_id)?.kind === "diet")
    .map((i) => `- ${i.title}${i.details ? `: ${i.details}` : ""}${i.notes ? ` (${i.notes})` : ""}`)
    .join("\n");

  return { stats, dietRules };
}

const REPORT_SHAPE = `{
  "title": string (short epic headline for the week),
  "rank": "S" | "A" | "B" | "C" | "D" (overall grade for the week),
  "summary": string (3-5 sentence RPG-style narrative of the week that cites the real numbers),
  "streak_message": string (congratulate or encourage based on the current and longest streak),
  "victories": string[] (2-4 wins),
  "weak_points": string[] (2-4 specific weak points backed by the numbers),
  "stat_adjustments": [{ "stat": string (STR, AGI, VIT, INT, WIS or DISCIPLINE), "change": string (e.g. "+2" or "-1"), "reason": string }],
  "habit_tweaks": string[] (2-4 concrete tweaks),
  "focus_areas": string[] (2-4 quests to focus on next week)
}`;

const SYSTEM =
  "You are the Game Master of Casanite, an RPG-style life tracker for Shah Htet Naing in Singapore. " +
  "Write an engaging but concise weekly quest report in second person. Use only the numbers provided; never invent activity. " +
  "His goals: reach 145-150 lb, build calisthenics and flip strength, keep a daily streak, and progress in cybersecurity/PhD studies. " +
  "Diet logs that are 'unlogged' mean he did not record that day; mention logging if most days are unlogged instead of assuming failure.";

const asStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function normalize(raw: Partial<WeeklyReportContent>): WeeklyReportContent {
  const rank = ["S", "A", "B", "C", "D"].includes(raw.rank as string) ? (raw.rank as WeeklyReportContent["rank"]) : "C";
  return {
    title: String(raw.title ?? "Weekly Quest Report"),
    rank,
    summary: String(raw.summary ?? ""),
    streak_message: String(raw.streak_message ?? ""),
    victories: asStrings(raw.victories),
    weak_points: asStrings(raw.weak_points),
    stat_adjustments: (Array.isArray(raw.stat_adjustments) ? raw.stat_adjustments : [])
      .filter((s) => s && typeof s === "object")
      .map((s) => ({ stat: String(s.stat ?? ""), change: String(s.change ?? ""), reason: String(s.reason ?? "") })),
    habit_tweaks: asStrings(raw.habit_tweaks),
    focus_areas: asStrings(raw.focus_areas),
  };
}

export async function generateWeeklyReport(
  supabase: SupabaseClient,
  userId: string,
  which: ReportWeek,
  source: "manual" | "scheduled",
): Promise<WeeklyReport> {
  const { stats, dietRules } = await collectWeeklyStats(supabase, userId, which);
  const raw = await chatJson<Partial<WeeklyReportContent>>(
    SYSTEM,
    `Week ${stats.weekStart} to ${stats.weekEnd} (${stats.daysElapsed} of 7 days elapsed).\n` +
      `Diet rules he follows:\n${dietRules || "- none set"}\n\n` +
      `Weekly data (JSON):\n${JSON.stringify(stats)}`,
    REPORT_SHAPE,
  );
  const { data, error } = await supabase
    .from("weekly_reports")
    .upsert(
      { user_id: userId, week_start: stats.weekStart, week_end: stats.weekEnd, stats, report: normalize(raw), source },
      { onConflict: "user_id,week_start" },
    )
    .select("id, week_start, week_end, stats, report, source, updated_at")
    .single();
  if (error) throw new Error(`weekly_reports: ${error.message}`);
  return data as WeeklyReport;
}
