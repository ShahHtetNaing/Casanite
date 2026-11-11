"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Clock3, Dumbbell, Pause, Pencil, Play, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { TutorialButton } from "@/components/dashboard/tutorial-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { WEEKDAY_SHORT } from "@/lib/date";
import { EXERCISE_NAMES, STARTER_PLAN, workoutGuideFor } from "@/lib/workout-plan";
import type { RoutineGroup, RoutineItem, WorkoutSession, WorkoutSet } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  day: string; today: string; groups: RoutineGroup[]; items: RoutineItem[];
  initialSessions: WorkoutSession[]; priorSessions: WorkoutSession[]; planInstalled: boolean;
};

const DEFAULT_SET: WorkoutSet = { kg: null, reps: 10, seconds: null, completed: false };
const MS_RE = /^https:\/\/www\.muscleandstrength\.com\/exercises\/[a-z0-9-]+\.html$/;
const byDay = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const addDays = (iso: string, delta: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const pretty = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const blank = (value: number | null) => value == null ? "" : String(value);

function WorkoutClock({ day }: { day: string }) {
  const key = `casanite.workoutClock.${day}`;
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { elapsedMs?: number; startedAt?: number | null } | null;
      if (saved && Number.isFinite(saved.elapsedMs) && (saved.elapsedMs ?? 0) >= 0) {
        setElapsedMs(saved.elapsedMs ?? 0);
        setStartedAt(saved.startedAt && Number.isFinite(saved.startedAt) ? saved.startedAt : null);
      }
    } catch { /* Ignore invalid local state. */ }
    setNow(Date.now());
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (loaded) localStorage.setItem(key, JSON.stringify({ elapsedMs, startedAt }));
  }, [key, elapsedMs, startedAt, loaded]);
  useEffect(() => {
    if (startedAt == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  const seconds = Math.max(0, Math.floor((elapsedMs + (startedAt == null ? 0 : Math.max(0, now - startedAt))) / 1000));
  const display = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
    <Clock3 className="size-4 text-primary" /><strong className="tabular-nums">{display}</strong>
    <Button variant="outline" size="xs" disabled={!loaded} onClick={() => {
      if (startedAt == null) { const t = Date.now(); setNow(t); setStartedAt(t); }
      else { setElapsedMs(elapsedMs + Math.max(0, Date.now() - startedAt)); setStartedAt(null); }
    }}>{startedAt == null ? <Play /> : <Pause />}{startedAt == null ? "Start / resume" : "Pause"}</Button>
    <Button size="xs" variant="ghost" disabled={!loaded} onClick={() => {
      if (confirm("Reset the workout clock? Set logs will not be changed.")) { setElapsedMs(0); setStartedAt(null); }
    }}><RotateCcw /> Reset</Button>
  </div>;
}

function templateFor(item: RoutineItem): WorkoutSet[] {
  if (item.workout_template?.length) return item.workout_template.map((s) => ({ ...s, completed: false }));
  const match = item.details?.match(/^(\d{1,2})\s*[x×]\s*(\d{1,3})(s|m)?/i);
  if (match) {
    const count = Math.max(1, Math.min(12, Number(match[1])));
    return Array.from({ length: count }, () => ({ kg: null, reps: match[3] ? null : Number(match[2]),
      seconds: match[3] ? Number(match[2]) * (match[3].toLowerCase() === "m" ? 60 : 1) : null, completed: false }));
  }
  return [{ ...DEFAULT_SET }, { ...DEFAULT_SET }];
}

function validSets(sets: WorkoutSet[]) {
  return sets.length > 0 && sets.length <= 12 && sets.every((s) =>
    (s.kg == null || (Number.isFinite(s.kg) && s.kg >= 0 && s.kg <= 1000 && s.kg * 4 === Math.round(s.kg * 4))) &&
    (s.reps == null || (Number.isInteger(s.reps) && s.reps >= 0 && s.reps <= 500)) &&
    (s.seconds == null || (Number.isInteger(s.seconds) && s.seconds >= 0 && s.seconds <= 36000)) &&
    (!s.completed || (s.reps ?? 0) > 0 || (s.seconds ?? 0) > 0));
}

function SetFields({
  sets, onChange, previous, disabled = false,
}: {
  sets: WorkoutSet[]; onChange: (next: WorkoutSet[]) => void; previous?: WorkoutSet[]; disabled?: boolean;
}) {
  const change = (index: number, patch: Partial<WorkoutSet>) => onChange(sets.map((s, i) => i === index ? { ...s, ...patch } : s));
  const numeric = (index: number, field: "kg" | "reps" | "seconds", label: string, step: string) => (
    <Input
      type="number" inputMode="decimal" min="0" step={step} disabled={disabled}
      aria-label={`${label} set ${index + 1}`} className="h-9 w-full min-w-0 text-center tabular-nums"
      value={blank(sets[index][field])}
      onChange={(e) => change(index, { [field]: e.target.value === "" ? null : Number(e.target.value) })}
    />
  );
  return (
    <div className="grid gap-1 overflow-x-auto">
      <div className="grid min-w-[440px] grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem_2.5rem_2rem] items-center gap-1.5 text-center text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span>Set</span><span>Prev</span><span>KG</span><span>Reps</span><span>Sec</span><span>Done</span><span></span>
      </div>
      {sets.map((set, index) => {
        const p = previous?.[index];
        const prev = p ? [p.kg != null && `${p.kg}kg`, p.reps != null && `×${p.reps}`, p.seconds != null && `${p.seconds}s`].filter(Boolean).join(" ") : "—";
        return (
          <div key={index} className={cn("grid min-w-[440px] grid-cols-[2.5rem_1fr_4.5rem_4.5rem_4.5rem_2.5rem_2rem] items-center gap-1.5 rounded-lg p-1", set.completed && "bg-emerald-500/15")}>
            <span className="text-center text-sm tabular-nums">{index + 1}</span>
            <span className="truncate text-center text-xs text-muted-foreground" title={prev}>{prev}</span>
            {numeric(index, "kg", "Kilograms", "0.25")}
            {numeric(index, "reps", "Reps", "1")}
            {numeric(index, "seconds", "Seconds", "1")}
            <input type="checkbox" aria-label={`Complete set ${index + 1}`} checked={set.completed}
              onChange={(e) => change(index, { completed: e.target.checked })} disabled={disabled}
              className="mx-auto size-5 accent-emerald-500" />
            <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove set ${index + 1}`}
              disabled={disabled || sets.length === 1} onClick={() => onChange(sets.filter((_, i) => i !== index))}><X /></Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="ghost" className="w-fit" disabled={disabled || sets.length >= 12}
        onClick={() => onChange([...sets, { ...sets.at(-1)!, completed: false }])}><Plus /> Add set</Button>
    </div>
  );
}

function ExerciseCard({
  item, saved, previous, onSave, onEdit, onRemove,
}: {
  item: RoutineItem; saved?: WorkoutSession; previous?: WorkoutSession;
  onSave: (item: RoutineItem, sets: WorkoutSet[]) => Promise<void>; onEdit: () => void; onRemove: () => void;
}) {
  const [sets, setSets] = useState<WorkoutSet[]>(() => saved?.sets ?? templateFor(item));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const onChange = (value: WorkoutSet[]) => { setSets(value); setDirty(true); };
  async function save() {
    if (!validSets(sets)) return toast.error("Use 0–1000 kg (0.25 kg steps), whole reps/seconds; a finished set needs reps or seconds.");
    setSaving(true);
    try { await onSave(item, sets); setDirty(false); } catch { /* error shown by parent */ } finally { setSaving(false); }
  }
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center gap-2">
        <Dumbbell className="size-4 shrink-0 text-primary" />
        <CardTitle className="min-w-0 flex-1 text-sm">{item.title}</CardTitle>
        <TutorialButton title={item.title} url={item.youtube_url} guideUrl={item.guide_url} guide={item.guide} />
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${item.title}`} onClick={onEdit}><Pencil /></Button>
        <Button size="icon-xs" variant="ghost" aria-label={`Remove ${item.title}`} onClick={onRemove}><Trash2 /></Button>
      </CardHeader>
      <CardContent className="grid gap-3">
        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
        <p className="text-[11px] text-muted-foreground">Rest suggestion: {item.workout_rest_seconds ?? 90}s · adjustable floating timer</p>
        {previous && <p className="text-xs text-muted-foreground">Previous: {pretty(previous.day)} · use it as a reference, not a required weight.</p>}
        <SetFields sets={sets} onChange={onChange} previous={previous?.sets} disabled={saving} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{sets.filter((s) => s.completed).length}/{sets.length} sets done{dirty ? " · Unsaved changes" : saved ? " · Saved" : " · Not logged"}</p>
          <div className="flex gap-1.5">
            {dirty && <Button size="sm" variant="ghost" onClick={() => { setSets(saved?.sets ?? templateFor(item)); setDirty(false); }}><RotateCcw /> Reset</Button>}
            <Button size="sm" onClick={save} disabled={saving || (!dirty && !!saved)}><Save /> Save sets</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExerciseEditor({ item, groups, onClose, onSave }: {
  item: RoutineItem | null; groups: RoutineGroup[]; onClose: () => void;
  onSave: (values: { p_id: string | null; p_group: string; p_title: string; p_notes: string | null;
    p_sets: WorkoutSet[]; p_guide_url: string | null; p_guide: RoutineItem["guide"]; p_rest_seconds: number }) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(item?.group_id ?? groups[0]?.id ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [sets, setSets] = useState<WorkoutSet[]>(() => templateFor(item ?? ({ details: null, workout_template: null } as RoutineItem)));
  const [rest, setRest] = useState(item?.workout_rest_seconds ?? 90);
  const [url, setUrl] = useState(item?.guide_url ?? "");
  const [busy, setBusy] = useState(false);
  const matched = workoutGuideFor(title);
  const guide = item && title.trim() === item.title ? item.guide : url === matched.guide_url ? matched.guide : null;
  function chooseTitle(value: string) {
    if (item && value !== item.title && title === item.title) { setNotes(""); setSets([{ ...DEFAULT_SET }, { ...DEFAULT_SET }]); }
    setTitle(value);
    setUrl(workoutGuideFor(value).guide_url ?? "");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !groupId || !validSets(sets)) return toast.error("Choose a day and valid set targets.");
    if (url && !MS_RE.test(url)) return toast.error("Use a Muscle & Strength exercise page URL.");
    if (!Number.isInteger(rest) || rest < 30 || rest > 600) return toast.error("Rest must be 30–600 seconds.");
    setBusy(true);
    try { await onSave({ p_id: item?.id ?? null, p_group: groupId, p_title: title.trim(), p_notes: notes.trim() || null,
      p_sets: sets.map((s) => ({ ...s, completed: false })), p_guide_url: url || null, p_guide: guide, p_rest_seconds: rest });
    } catch { /* error shown by parent */ } finally { setBusy(false); }
  }
  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label className="grid gap-1 text-sm font-medium">Workout day
        <select aria-label="Workout day" className="h-9 rounded-lg border bg-background px-2" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-medium">Exercise (choose an exact Muscle & Strength name for the matching video/guide)
        <Input aria-label="Exercise name" list="ms-workout-exercises" value={title} maxLength={150} onChange={(e) => chooseTitle(e.target.value)} autoFocus required />
        <datalist id="ms-workout-exercises">{EXERCISE_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      <p className="text-xs text-muted-foreground">{matched.guide_url ? "Matched exercise page. Video and form guide switch with the exercise." : "No exact match in the exercise catalog. Add a verified URL or use the search guide."}</p>
      <label className="grid gap-1 text-sm font-medium">Exercise guide URL (optional)
        <Input aria-label="Exercise guide URL" type="url" placeholder="https://www.muscleandstrength.com/exercises/…html" value={url} onChange={(e) => setUrl(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Notes / modifications
        <Textarea aria-label="Exercise notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <label className="grid gap-1 text-sm font-medium">Rest between sets (seconds)
        <Input type="number" aria-label="Rest seconds" min="30" max="600" value={rest} onChange={(e) => setRest(Number(e.target.value))} />
      </label>
      <p className="text-xs text-muted-foreground">Set defaults for future workouts; your dated logs will not change.</p>
      <SetFields sets={sets} onChange={setSets} />
      {title.trim() && <TutorialButton key={title} title={title} url={null} guideUrl={url || null} guide={guide} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><Check /> Save exercise</Button></div>
    </form>
  );
}

export function Workout({ day, today, groups: initialGroups, items: initialItems, initialSessions, priorSessions, planInstalled }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [groups, setGroups] = useState(initialGroups);
  const [items, setItems] = useState(initialItems);
  const [sessions, setSessions] = useState(initialSessions);
  const [editing, setEditing] = useState<RoutineItem | "new" | null>(null);
  const [editingGroup, setEditingGroup] = useState<RoutineGroup | "new" | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [previewPlan, setPreviewPlan] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDays, setGroupDays] = useState<number[]>([]);
  const [busyGroup, setBusyGroup] = useState(false);

  const weekday = byDay(day);
  const selected = groups.filter((g) => showAll || g.days_of_week == null || g.days_of_week.includes(weekday));
  const scheduled = selected.map((group) => ({ group, items: items.filter((item) => item.group_id === group.id) }));
  const activeIds = new Set(items.map((i) => i.id));
  const older = sessions.filter((s) => s.item_id == null || !activeIds.has(s.item_id));
  const weekBase = addDays(day, -(weekday + 6) % 7);
  const visit = (date: string) => router.push(date === today ? "/workout" : `/workout?day=${date}`);

  async function refreshLists() {
    const [g, i] = await Promise.all([
      supabase.from("routine_groups").select("*").eq("kind", "exercise").eq("is_active", true).order("sort_order"),
      supabase.from("routines_and_goals").select("*").eq("is_active", true).order("sort_order"),
    ]);
    if (g.error || i.error) throw new Error(g.error?.message ?? i.error?.message);
    const nextGroups = (g.data ?? []) as RoutineGroup[];
    setGroups(nextGroups);
    setItems(((i.data ?? []) as RoutineItem[]).filter((x) => nextGroups.some((group) => group.id === x.group_id)));
    router.refresh();
  }

  async function saveSets(item: RoutineItem, sets: WorkoutSet[]) {
    const { data, error } = await supabase.from("workout_sessions")
      .upsert({ item_id: item.id, day, exercise_name: item.title, sets }, { onConflict: "user_id,item_id,day" }).select("*").single();
    if (error) { toast.error(error.message); throw error; }
    const row = data as WorkoutSession;
    setSessions((prev) => [...prev.filter((s) => s.item_id !== item.id), row]);
    toast.success("Sets saved");
  }

  async function saveExercise(values: Parameters<typeof ExerciseEditor>[0]["onSave"] extends (v: infer T) => Promise<void> ? T : never) {
    const { error } = await supabase.rpc("save_workout_exercise", values);
    if (error) { toast.error(error.message); throw error; }
    await refreshLists();
    setEditing(null);
    toast.success("Exercise saved");
  }

  async function removeExercise(item: RoutineItem) {
    if (!confirm(`Remove "${item.title}" from the active workout? Your past set logs stay available.`)) return;
    const { error } = await supabase.from("routines_and_goals").update({ is_active: false }).eq("id", item.id);
    if (error) return toast.error(error.message);
    await refreshLists();
  }

  function openGroup(g: RoutineGroup | "new") {
    setEditingGroup(g);
    setGroupName(g === "new" ? "" : g.title);
    setGroupDays(g === "new" ? [weekday] : [...(g.days_of_week ?? [])]);
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) return;
    setBusyGroup(true);
    const changes = { title: groupName.trim(), days_of_week: groupDays.length === 0 || groupDays.length === 7 ? null : groupDays };
    const res = editingGroup === "new"
      ? await supabase.from("routine_groups").insert({ ...changes, kind: "exercise", frequency: "daily", sort_order: groups.length * 10 + 100 })
      : await supabase.from("routine_groups").update(changes).eq("id", editingGroup!.id);
    setBusyGroup(false);
    if (res.error) return toast.error(res.error.message);
    await refreshLists();
    setEditingGroup(null);
  }

  async function removeGroup(group: RoutineGroup) {
    if (!confirm(`Archive "${group.title}" and its exercises? Previous sessions and completions stay in history.`)) return;
    const { error } = await supabase.from("routine_groups").update({ is_active: false }).eq("id", group.id);
    if (error) return toast.error(error.message);
    await refreshLists();
  }

  async function install() {
    if (!confirm("Apply the beginner plan? This archives (does not delete) your current exercise groups and leaves all other routines alone.")) return;
    setInstalling(true);
    try {
      const response = await fetch("/api/workout/plan", { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.message ?? "Could not apply plan");
      window.location.assign("/workout");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not apply plan"); setInstalling(false); }
  }

  return (
    <PageShell title="Workout" subtitle="Your routines, form guides and actual sets in one place">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
        <p>Start with <strong>one light set</strong> per exercise for two weeks, then try two if recovered. Saturday is optional. You can edit every kg, rep and set; 0 kg means bodyweight. Save sets after ticking them. Log your daily quest on Dashboard separately for EXP.</p>
        <p className="text-xs text-muted-foreground">Strength and muscle are built gradually. Core work cannot target side fat. Avoid unsupervised flips or forced split stretches; follow your clinician&apos;s glucose plan during exercise.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewPlan((v) => !v)}>{previewPlan ? "Hide" : "Preview"} starter plan</Button>
          {!planInstalled && <Button size="sm" onClick={install} disabled={installing}>Apply plan to my workouts</Button>}
          {planInstalled && <span className="text-xs text-muted-foreground">Starter plan applied · customize below</span>}
          <a className="text-xs font-medium text-primary underline" href="https://www.muscleandstrength.com/workouts/3-day-PPL-workout-for-beginners" target="_blank" rel="noopener noreferrer">M&amp;S beginner PPL reference ↗</a>
          <a className="text-xs font-medium text-primary underline" href="https://www.muscleandstrength.com/workouts/3-day-full-body-dumbbell-workout" target="_blank" rel="noopener noreferrer">3-day full-body alternative ↗</a>
        </div>
        {previewPlan && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{STARTER_PLAN.map((g) => <div key={g.day ?? "mobility"} className="rounded-xl border p-3 text-xs"><strong>{g.day == null ? "Daily (optional)" : WEEKDAY_SHORT[g.day]} · {g.title}</strong><p className="text-muted-foreground">{g.items.map((e) => e.title).join(" · ")}</p></div>)}<div className="rounded-xl border p-3 text-xs"><strong>Fri · Rest</strong><p className="text-muted-foreground">Optional gentle mobility.</p></div></div>}
      </div>

      {day === today && <WorkoutClock day={day} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => visit(addDays(day, -1))}><ChevronLeft /></Button>
        <p className="min-w-36 text-center font-medium">{day === today ? "Today · " : ""}{pretty(day)}</p>
        <Button variant="outline" size="icon-sm" aria-label="Next day" disabled={day >= today} onClick={() => visit(addDays(day, 1))}><ChevronRight /></Button>
        {day !== today && <Button variant="ghost" size="sm" onClick={() => visit(today)}>Today</Button>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setShowAll((v) => !v)}>{showAll ? "Scheduled only" : "All exercises"}</Button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {Array.from({ length: 7 }, (_, index) => {
          const date = addDays(weekBase, index);
          return <Button key={date} size="sm" variant={date === day ? "default" : "outline"} disabled={date > today}
            onClick={() => visit(date)} className="min-w-16 shrink-0">{WEEKDAY_SHORT[byDay(date)]} {date.slice(-2)}</Button>;
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => openGroup("new")}><Plus /> Add workout day</Button>
        {groups.length > 0 && <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add exercise</Button>}
      </div>
      {weekday === 5 && !showAll && <p className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">Friday is a rest day. Mobility below is optional; skip it if you need full rest.</p>}
      {scheduled.length === 0 && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">{weekday === 5 ? "Friday is for rest. A gentle walk or stretch is optional." : groups.length ? "Nothing scheduled today. Pick another day or view all exercises." : "No workouts yet. Preview and apply the starter plan, or add a workout day."}</CardContent></Card>}
      {scheduled.map(({ group, items: exerciseItems }) => <section key={group.id} className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="flex-1 text-base font-semibold">{group.title}</h2>
          <Button variant="ghost" size="icon-xs" aria-label={`Edit day ${group.title}`} onClick={() => openGroup(group)}><Pencil /></Button>
          <Button variant="ghost" size="icon-xs" aria-label={`Archive day ${group.title}`} onClick={() => removeGroup(group)}><Trash2 /></Button>
        </div>
        {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
        <div className="grid gap-3 xl:grid-cols-2">{exerciseItems.map((item) => <ExerciseCard key={`${item.id}-${day}`} item={item}
          saved={sessions.find((s) => s.item_id === item.id)}
          previous={priorSessions.find((s) => s.item_id === item.id && s.exercise_name.trim().toLowerCase() === item.title.trim().toLowerCase())}
          onSave={saveSets} onEdit={() => setEditing(item)} onRemove={() => removeExercise(item)} />)}</div>
        {exerciseItems.length === 0 && <p className="text-sm text-muted-foreground">No exercises in this workout yet.</p>}
      </section>)}
      {older.length > 0 && <Card><CardHeader><CardTitle>Earlier exercises logged on this day</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm">{older.map((s) => <p key={s.id}>{s.exercise_name} · {s.sets.filter((x) => x.completed).length}/{s.sets.length} sets · saved {pretty(s.day)}</p>)}</CardContent></Card>}

      <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing === "new" ? "Add exercise" : "Edit exercise"}</DialogTitle><DialogDescription>Choose a matching movement; changing its name or workout day archives the old exercise without erasing session history.</DialogDescription></DialogHeader>
          {editing && <ExerciseEditor key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} groups={groups} onClose={() => setEditing(null)} onSave={saveExercise} />}
        </DialogContent>
      </Dialog>
      <Dialog open={editingGroup !== null} onOpenChange={(open) => { if (!open) setEditingGroup(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGroup === "new" ? "Add workout day" : "Edit workout day"}</DialogTitle><DialogDescription>Choose all weekdays for this workout group. No selected days means every day.</DialogDescription></DialogHeader>
          <form onSubmit={saveGroup} className="grid gap-3">
            <Input aria-label="Workout day name" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Push" required maxLength={80} />
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Scheduled weekdays</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_SHORT.map((name, value) => <Button key={value} type="button" size="sm"
                  aria-label={`Schedule ${name}`} aria-pressed={groupDays.includes(value)}
                  variant={groupDays.includes(value) ? "default" : "outline"}
                  onClick={() => setGroupDays((days) => days.includes(value) ? days.filter((d) => d !== value) : [...days, value].sort())}>{name}</Button>)}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditingGroup(null)}>Cancel</Button><Button type="submit" disabled={busyGroup}><Check /> Save day</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
