"use client";

import { useCallback, useMemo, useState } from "react";
import { Cpu, LogOut, Plus, Salad, Settings2 } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { EXP_PER_TASK } from "@/lib/config";
import { loadDashboardData, type DashboardData } from "@/lib/dashboard-data";
import { WEEKDAY_SHORT, effectiveFrequency, isScheduledOn, periodKey, zonedParts } from "@/lib/date";
import type { CalendarSummary, HealthLog, RoutineGroup, RoutineItem, UserStats } from "@/lib/types";
import { CalendarWidget } from "./calendar-widget";
import { GroupDialog, ItemDialog, type GroupFormValues, type ItemFormValues } from "./edit-dialogs";
import { FitWidget } from "./fit-widget";
import { GroupCard, type RoutineHandlers } from "./group-card";
import { GuitarBanner } from "./guitar-banner";
import { HealthPanel, type HealthFormValues } from "./health-panel";
import { StatsHud } from "./stats-hud";
import { useGoogleData } from "./use-google-data";

const NON_QUEST_KINDS = new Set(["diet", "goal"]);
const TODAY_FREQUENCIES = new Set(["daily", "weekly"]);
const GOAL_FREQUENCIES = new Set(["monthly", "yearly", "once"]);

function errorMessage(err: unknown) {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return "Something went wrong";
}

export function Dashboard({ initialData, userEmail }: { initialData: DashboardData; userEmail: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState(initialData);
  const [editMode, setEditMode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: RoutineItem | null; groupId: string | null }>({
    open: false,
    item: null,
    groupId: null,
  });
  const [groupDialog, setGroupDialog] = useState<{ open: boolean; group: RoutineGroup | null }>({
    open: false,
    group: null,
  });
  const calendar = useGoogleData<CalendarSummary>("/api/google/calendar");

  const { groups, items, completions, stats } = data;
  const today = zonedParts();

  const reload = useCallback(async () => {
    try {
      setData(await loadDashboardData(supabase));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [supabase]);

  /** Run a mutation, surface errors, then re-sync from the database. */
  const mutate = useCallback(
    async (fn: () => PromiseLike<{ error: { message: string } | null }>, success?: string) => {
      const { error } = await fn();
      if (error) {
        toast.error(error.message);
        throw error;
      }
      if (success) toast.success(success);
      await reload();
    },
    [reload],
  );

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const item of items) {
      const group = groupById.get(item.group_id);
      if (!group) continue;
      const key = periodKey(effectiveFrequency(item, group));
      m.set(item.id, completions.filter((c) => c.item_id === item.id && c.period_key === key).length);
    }
    return m;
  }, [items, completions, groupById]);

  const itemsByGroup = useMemo(() => {
    const m = new Map<string, RoutineItem[]>();
    for (const item of items) m.set(item.group_id, [...(m.get(item.group_id) ?? []), item]);
    return m;
  }, [items]);

  const todayGroups = useMemo(
    () =>
      groups
        .filter((g) => g.is_active && !NON_QUEST_KINDS.has(g.kind))
        .map((g) => ({
          group: g,
          items: (itemsByGroup.get(g.id) ?? []).filter(
            (i) =>
              i.is_active &&
              TODAY_FREQUENCIES.has(effectiveFrequency(i, g)) &&
              isScheduledOn(i, g, today.weekday),
          ),
        }))
        .filter((x) => x.items.length > 0),
    [groups, itemsByGroup, today.weekday],
  );

  const questItems = todayGroups.flatMap((x) => x.items).filter((i) => i.is_trackable);
  const questsDone = questItems.filter((i) => (counts.get(i.id) ?? 0) >= i.target_count).length;

  const goalGroups = groups
    .map((g) => ({
      group: g,
      items: (itemsByGroup.get(g.id) ?? []).filter((i) => GOAL_FREQUENCIES.has(effectiveFrequency(i, g))),
    }))
    .filter((x) => x.items.length > 0 || x.group.kind === "goal");

  const dietGroups = groups.filter((g) => g.kind === "diet" && g.is_active);

  const activity = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const r of data.recentDays) byDay.set(r.completed_on, (byDay.get(r.completed_on) ?? 0) + EXP_PER_TASK);
    const base = Date.UTC(today.year, today.month - 1, today.day);
    return Array.from({ length: 14 }, (_, i) => {
      const iso = new Date(base - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      return { date: iso.slice(5), exp: byDay.get(iso) ?? 0 };
    });
  }, [data.recentDays, today.year, today.month, today.day]);

  // -------------------------------------------------------------------
  // Completion (EXP / streak are computed in Postgres)
  // -------------------------------------------------------------------
  const runCompletion = useCallback(
    async (item: RoutineItem, rpc: "complete_item" | "uncomplete_item") => {
      setBusyId(item.id);
      const before = stats;
      const { data: next, error } = await supabase.rpc(rpc, { p_item: item.id });
      if (error) {
        toast.error(error.message);
      } else {
        const s = next as UserStats;
        if (rpc === "complete_item" && s.exp > before.exp) toast.success(`+${s.exp - before.exp} EXP · ${item.title}`);
        if (s.level > before.level) toast.success(`LEVEL UP! You reached level ${s.level}`, { duration: 6000 });
        await reload();
      }
      setBusyId(null);
    },
    [supabase, stats, reload],
  );

  // -------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------
  const reorder = useCallback(
    async <T extends { id: string; sort_order: number }>(table: string, list: T[], id: string, dir: -1 | 1) => {
      const idx = list.findIndex((x) => x.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= list.length) return;
      const next = [...list];
      [next[idx], next[target]] = [next[target], next[idx]];
      const updates = next
        .map((x, i) => ({ id: x.id, sort_order: (i + 1) * 10, changed: x.sort_order !== (i + 1) * 10 }))
        .filter((x) => x.changed);
      const results = await Promise.all(
        updates.map((u) => supabase.from(table).update({ sort_order: u.sort_order }).eq("id", u.id)),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) toast.error(failed.error.message);
      await reload();
    },
    [supabase, reload],
  );

  const handlers: RoutineHandlers = {
    complete: (item) => void runCompletion(item, "complete_item"),
    uncomplete: (item) => void runCompletion(item, "uncomplete_item"),
    addItem: (groupId) => setItemDialog({ open: true, item: null, groupId }),
    editItem: (item) => setItemDialog({ open: true, item, groupId: item.group_id }),
    deleteItem: (item) => {
      if (!confirm(`Delete "${item.title}"? Earned EXP is kept.`)) return;
      void mutate(() => supabase.from("routines_and_goals").delete().eq("id", item.id), "Item deleted").catch(() => {});
    },
    moveItem: (item, dir) => void reorder("routines_and_goals", itemsByGroup.get(item.group_id) ?? [], item.id, dir),
    editGroup: (group) => setGroupDialog({ open: true, group }),
    deleteGroup: (group) => {
      const n = itemsByGroup.get(group.id)?.length ?? 0;
      if (!confirm(`Delete group "${group.title}" and its ${n} item(s)? Earned EXP is kept.`)) return;
      void mutate(() => supabase.from("routine_groups").delete().eq("id", group.id), "Group deleted").catch(() => {});
    },
    moveGroup: (group, dir) => void reorder("routine_groups", groups, group.id, dir),
  };

  async function saveItem(values: ItemFormValues) {
    const existing = itemDialog.item;
    if (existing) {
      await mutate(() => supabase.from("routines_and_goals").update(values).eq("id", existing.id), "Item updated");
    } else {
      const siblings = itemsByGroup.get(values.group_id) ?? [];
      const sort_order = Math.max(0, ...siblings.map((s) => s.sort_order)) + 10;
      await mutate(() => supabase.from("routines_and_goals").insert({ ...values, sort_order }), "Item added");
    }
    setItemDialog({ open: false, item: null, groupId: null });
  }

  async function saveGroup(values: GroupFormValues) {
    const existing = groupDialog.group;
    if (existing) {
      await mutate(() => supabase.from("routine_groups").update(values).eq("id", existing.id), "Group updated");
    } else {
      const sort_order = Math.max(0, ...groups.map((g) => g.sort_order)) + 10;
      await mutate(() => supabase.from("routine_groups").insert({ ...values, sort_order }), "Group added");
    }
    setGroupDialog({ open: false, group: null });
  }

  const health = {
    create: (v: HealthFormValues) => mutate(() => supabase.from("health_logs").insert(v), "Vitals logged"),
    update: (id: string, v: HealthFormValues) =>
      mutate(() => supabase.from("health_logs").update(v).eq("id", id), "Entry updated"),
    remove: (log: HealthLog) => {
      if (!confirm("Delete this health entry?")) return;
      void mutate(() => supabase.from("health_logs").delete().eq("id", log.id), "Entry deleted").catch(() => {});
    },
  };

  const guitarClasses = "data" in calendar.state && calendar.state.data ? calendar.state.data.guitarClasses : [];

  return (
    <main className="cyber-grid min-h-screen">
      <div className="mx-auto grid max-w-7xl gap-4 p-4 md:p-6">
        <header className="flex flex-wrap items-center gap-3">
          <Cpu className="size-7 text-cyan-300 drop-shadow-[0_0_6px_currentColor]" />
          <div className="flex-1">
            <h1 className="font-display neon-text text-2xl font-black tracking-[0.25em]">CASANITE</h1>
            <p className="font-mono text-[11px] text-muted-foreground">
              {WEEKDAY_SHORT[today.weekday].toUpperCase()} {today.isoDate} · {userEmail}
            </p>
          </div>
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
              editMode ? "border-fuchsia-400/70 bg-fuchsia-400/10 text-fuchsia-200" : "border-border text-muted-foreground"
            }`}
          >
            <Settings2 className="size-3.5" />
            EDIT MODE
            <Switch checked={editMode} onCheckedChange={setEditMode} aria-label="Toggle edit mode" />
          </label>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </header>

        <GuitarBanner guitarClasses={guitarClasses} />
        <StatsHud stats={stats} questsDone={questsDone} questsTotal={questItems.length} />

        <Tabs defaultValue="today" className="gap-4">
          <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="routines">All routines</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="today">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid content-start gap-4 md:grid-cols-2">
                {todayGroups.length === 0 && (
                  <p className="neon-panel p-6 text-sm text-muted-foreground md:col-span-2">
                    No quests scheduled today. Turn on Edit Mode to add some.
                  </p>
                )}
                {todayGroups.map(({ group, items: groupItems }) => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    items={groupItems}
                    counts={counts}
                    editMode={editMode}
                    busyId={busyId}
                    handlers={handlers}
                  />
                ))}
              </div>
              <aside className="grid content-start gap-4">
                <FitWidget />
                <CalendarWidget state={calendar.state} refresh={() => void calendar.refresh()} />
                <section className="neon-panel p-4">
                  <h3 className="mb-2 flex items-center gap-1.5 font-display text-sm font-bold tracking-wider text-emerald-300 uppercase">
                    <Salad className="size-4" /> Diet rules
                  </h3>
                  {dietGroups.length === 0 && <p className="text-xs text-muted-foreground">No diet rules.</p>}
                  {dietGroups.map((g) => (
                    <ul key={g.id} className="space-y-2">
                      {(itemsByGroup.get(g.id) ?? [])
                        .filter((i) => i.is_active)
                        .map((i) => (
                          <li key={i.id} className="rounded-md border border-emerald-400/20 bg-emerald-400/5 p-2">
                            <p className="text-sm font-medium text-emerald-100">{i.title}</p>
                            {i.details && <p className="text-xs">{i.details}</p>}
                            {i.notes && <p className="mt-1 text-[11px] text-muted-foreground">{i.notes}</p>}
                          </li>
                        ))}
                    </ul>
                  ))}
                  {editMode && dietGroups[0] && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full border-dashed"
                      onClick={() => handlers.editGroup(dietGroups[0])}
                    >
                      Edit diet group
                    </Button>
                  )}
                </section>
                <section className="neon-panel p-4">
                  <h3 className="mb-2 font-display text-sm font-bold tracking-wider text-fuchsia-300 uppercase">
                    EXP · last 14 days
                  </h3>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={activity}>
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                          axisLine={false}
                          tickLine={false}
                          interval={1}
                        />
                        <Tooltip
                          cursor={{ fill: "oklch(1 0 0 / 5%)" }}
                          contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }}
                        />
                        <Bar dataKey="exp" name="EXP" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="routines">
            {editMode && (
              <Button className="neon-button mb-4" onClick={() => setGroupDialog({ open: true, group: null })}>
                <Plus /> Add group
              </Button>
            )}
            {!editMode && (
              <p className="mb-4 font-mono text-xs text-muted-foreground">
                Turn on EDIT MODE to add, edit, reorder or delete any group, exercise, habit or goal.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  items={itemsByGroup.get(g.id) ?? []}
                  counts={counts}
                  editMode={editMode}
                  busyId={busyId}
                  handlers={handlers}
                  showSchedule
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="goals">
            <div className="grid gap-4 md:grid-cols-2">
              {goalGroups.map(({ group, items: groupItems }) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  items={groupItems}
                  counts={counts}
                  editMode={editMode}
                  busyId={busyId}
                  handlers={handlers}
                  showSchedule
                  emptyText="No goals yet."
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="health">
            <HealthPanel logs={data.healthLogs} onCreate={health.create} onUpdate={health.update} onDelete={health.remove} />
          </TabsContent>
        </Tabs>
      </div>

      <ItemDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((s) => ({ ...s, open }))}
        item={itemDialog.item}
        groups={groups}
        defaultGroupId={itemDialog.groupId}
        onSave={saveItem}
      />
      <GroupDialog
        open={groupDialog.open}
        onOpenChange={(open) => setGroupDialog((s) => ({ ...s, open }))}
        group={groupDialog.group}
        onSave={saveGroup}
      />
    </main>
  );
}
