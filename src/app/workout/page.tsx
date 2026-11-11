import { requireOwnerPage } from "@/lib/owner-page";
import { zonedParts } from "@/lib/date";
import type { RoutineGroup, RoutineItem, WorkoutSession } from "@/lib/types";
import { Workout } from "@/components/workout/workout";

export const dynamic = "force-dynamic";

export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { supabase } = await requireOwnerPage();
  const today = zonedParts().isoDate;
  const requested = (await searchParams).day;
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
    && !Number.isNaN(Date.parse(`${requested}T12:00:00Z`))
    && requested <= today ? requested : today;

  const [groups, items, sessions, prior, plan] = await Promise.all([
    supabase.from("routine_groups").select("*").eq("kind", "exercise").eq("is_active", true).order("sort_order"),
    supabase.from("routines_and_goals").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("workout_sessions").select("*").eq("day", day),
    supabase.rpc("workout_previous", { p_day: day }),
    supabase.from("seed_flags").select("name").eq("name", "workout_plan").maybeSingle(),
  ]);
  for (const [name, error] of [["groups", groups.error], ["exercises", items.error],
    ["sessions", sessions.error], ["history", prior.error], ["plan", plan.error]] as const) {
    if (error) throw new Error(`Workout ${name}: ${error.message}. Run the latest supabase/schema.sql in Supabase.`);
  }
  const active = (groups.data ?? []) as RoutineGroup[];
  const groupIds = new Set(active.map((group) => group.id));

  return <Workout
    key={day} day={day} today={today} groups={active}
    items={((items.data ?? []) as RoutineItem[]).filter((item) => groupIds.has(item.group_id))}
    initialSessions={(sessions.data ?? []) as WorkoutSession[]}
    priorSessions={(prior.data ?? []) as WorkoutSession[]}
    planInstalled={!!plan.data}
  />;
}
