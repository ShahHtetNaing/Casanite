"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Info, Milk, Pencil, Plus, Settings2, Target, Trash2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { checkMeal, MILK_SAFE_FRUITS, type DietWarning } from "@/lib/milk-fruit";
import { cn } from "@/lib/utils";
import { MEAL_SLOTS, type InsulinLog, type MealLog, type MealSlot, type NutritionSettings, type Supplement, type SupplementLog } from "@/lib/types";
import { InsulinCard } from "./insulin-card";
import { SupplementsCard } from "./supplements-card";
import { MEAL_LABEL, currentMeal, selectClass, toNum } from "./shared";

type MealFields = Omit<MealLog, "id" | "day" | "created_at">;

type Props = {
  day: string;
  today: string;
  initialMeals: MealLog[];
  recentMeals: MealFields[];
  initialInsulin: InsulinLog[];
  initialSupplements: Supplement[];
  initialSupplementLogs: SupplementLog[];
  initialSettings: NutritionSettings;
  latestWeightKg: number | null;
};

const KG_TO_LB = 2.20462;

function shiftDay(day: string, delta: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-SG", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
}

export function Meals(props: Props) {
  const { day, today } = props;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [meals, setMeals] = useState(props.initialMeals);
  const [settings, setSettings] = useState(props.initialSettings);
  const [editing, setEditing] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const totals = meals.reduce(
    (t, m) => ({
      protein: t.protein + Number(m.protein_g ?? 0),
      carbs: t.carbs + Number(m.carbs_g ?? 0),
      veg: t.veg + Number(m.veg_servings ?? 0),
    }),
    { protein: 0, carbs: 0, veg: 0 },
  );

  // Rules apply per sitting: everything logged under one meal slot counts as eaten together.
  function slotWarnings(slot: MealSlot, list: MealLog[], extra?: { description: string; with_milk: boolean }, skipId?: string) {
    const entries = list.filter((m) => m.meal === slot && m.id !== skipId);
    const texts = [...entries.map((m) => m.description), ...(extra ? [extra.description] : [])];
    if (!texts.some((t) => t.trim())) return [];
    return checkMeal(texts, entries.some((m) => m.with_milk) || !!extra?.with_milk);
  }

  function alertDanger(slot: MealSlot, list: MealLog[]) {
    const danger = slotWarnings(slot, list).filter((w) => w.level === "danger");
    for (const w of danger) toast.warning(w.message, { duration: 10000 });
  }

  async function addMeal(v: MealFields) {
    const { data, error } = await supabase.from("meal_logs").insert({ ...v, day }).select("*").single();
    if (error) return toast.error(error.message), false;
    const next = [...meals, data as MealLog];
    setMeals(next);
    alertDanger(v.meal, next);
    return true;
  }

  async function updateMeal(id: string, v: MealFields) {
    const { data, error } = await supabase.from("meal_logs").update(v).eq("id", id).select("*").single();
    if (error) return toast.error(error.message), false;
    const next = meals.map((m) => (m.id === id ? (data as MealLog) : m));
    setMeals(next);
    setEditing(null);
    alertDanger(v.meal, next);
    return true;
  }

  async function deleteMeal(m: MealLog) {
    if (!confirm(`Delete "${m.description}"?`)) return;
    const { error } = await supabase.from("meal_logs").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    setMeals((prev) => prev.filter((x) => x.id !== m.id));
  }

  const quickPicks = useMemo(() => {
    const seen = new Set<string>();
    return props.recentMeals.filter((m) => {
      const k = m.description.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);
  }, [props.recentMeals]);

  const goTo = (d: string) => router.push(d === today ? "/meals" : `/meals?day=${d}`);

  return (
    <PageShell title="Meals" subtitle="Log what you actually eat, plus insulin and supplements">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" onClick={() => goTo(shiftDay(day, -1))}>
          <ChevronLeft />
        </Button>
        <p className="min-w-44 text-center font-medium">{day === today ? `Today · ${formatDay(day)}` : formatDay(day)}</p>
        <Button variant="outline" size="icon-sm" aria-label="Next day" disabled={day >= today} onClick={() => goTo(shiftDay(day, 1))}>
          <ChevronRight />
        </Button>
        {day !== today && (
          <Button variant="ghost" size="sm" onClick={() => goTo(today)}>
            Today
          </Button>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center gap-2">
            <Target className="size-4 text-primary" />
            <CardTitle className="flex-1">Daily totals</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings((v) => !v)}>
              <Settings2 /> Targets
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Macro label="Protein" value={totals.protein} target={settings.protein_g_target} unit="g" />
              <Macro label="Carbs" value={totals.carbs} target={settings.carbs_g_target} unit="g" limit />
              <Macro label="Veg" value={totals.veg} target={settings.veg_target} unit="servings" />
            </div>
            <WeightGoal kg={props.latestWeightKg} min={settings.goal_lbs_min} max={settings.goal_lbs_max} />
            {showSettings && <SettingsForm settings={settings} onSaved={(s) => (setSettings(s), setShowSettings(false))} onCancel={() => setShowSettings(false)} />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Milk className="size-4 text-primary" />
            <CardTitle>Milk + fruit rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">OK with milk:</span>{" "}
              {MILK_SAFE_FRUITS.map((f) => f[0].toUpperCase() + f.slice(1)).join(", ")}
            </p>
            <p>
              <span className="font-medium text-red-600 dark:text-red-400">Never with milk:</span> citrus (orange, lemon, lime…), berries,
              melons. Have them separately or as juice without milk.
            </p>
            <p className="text-xs text-muted-foreground">Foods logged under the same meal count as eaten together.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {MEAL_SLOTS.map((slot) => {
          const entries = meals.filter((m) => m.meal === slot);
          const warnings = slotWarnings(slot, meals);
          return (
            <Card key={slot}>
              <CardHeader>
                <CardTitle>{MEAL_LABEL[slot]}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {entries.length === 0 && <p className="text-sm text-muted-foreground">Nothing logged.</p>}
                {entries.map((m) =>
                  editing === m.id ? (
                    <MealForm
                      key={m.id}
                      initial={m}
                      warningsFor={(v) => slotWarnings(v.meal, meals, v, m.id)}
                      onSubmit={(v) => updateMeal(m.id, v)}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <div key={m.id} className="flex items-start gap-2 rounded-xl border p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {m.description}
                          {m.with_milk && <Milk className="ml-1.5 inline size-3.5 text-muted-foreground" aria-label="with milk" />}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[m.protein_g != null && `${m.protein_g} g protein`, m.carbs_g != null && `${m.carbs_g} g carbs`, m.veg_servings != null && `${m.veg_servings} veg`]
                            .filter(Boolean)
                            .join(" · ") || "No macros"}
                        </p>
                      </div>
                      <Button variant="ghost" size="icon-xs" aria-label="Edit meal" onClick={() => setEditing(m.id)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-xs" aria-label="Delete meal" onClick={() => deleteMeal(m)}>
                        <Trash2 />
                      </Button>
                    </div>
                  ),
                )}
                <Warnings warnings={warnings} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Plus className="size-4 text-primary" />
          <CardTitle>Log food</CardTitle>
        </CardHeader>
        <CardContent>
          <MealForm
            key={meals.length}
            initial={null}
            defaultMeal={day === today ? currentMeal() : "lunch"}
            quickPicks={quickPicks}
            warningsFor={(v) => slotWarnings(v.meal, meals, v)}
            onSubmit={addMeal}
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <InsulinCard day={day} today={today} initialLogs={props.initialInsulin} settings={settings} />
        <SupplementsCard day={day} initialSupplements={props.initialSupplements} initialLogs={props.initialSupplementLogs} />
      </div>
    </PageShell>
  );
}

function Macro({ label, value, target, unit, limit }: { label: string; value: number; target: number; unit: string; limit?: boolean }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const over = limit && value > target;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums text-muted-foreground", over && "font-medium text-amber-600 dark:text-amber-400")}>
          {Math.round(value * 10) / 10} / {target} {unit}
          {limit ? " max" : ""}
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

function WeightGoal({ kg, min, max }: { kg: number | null; min: number; max: number }) {
  if (kg == null) {
    return <p className="text-sm text-muted-foreground">Goal: {min}–{max} lb. Log a weight in Health or Body Scan to track progress.</p>;
  }
  const lb = Math.round(kg * KG_TO_LB * 10) / 10;
  const toGo = Math.round((lb - max) * 10) / 10;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-muted/60 p-3 text-sm">
      <span>
        Latest weight <span className="font-semibold tabular-nums">{lb} lb</span> ({kg} kg)
      </span>
      <span className="text-muted-foreground">
        Goal {min}–{max} lb ·{" "}
        {toGo > 0 ? `${toGo} lb to go` : lb < min ? `${Math.round((min - lb) * 10) / 10} lb under goal` : "in your goal range"}
      </span>
    </div>
  );
}

function Warnings({ warnings }: { warnings: DietWarning[] }) {
  if (!warnings.length) return null;
  return (
    <div className="grid gap-1.5" role="alert">
      {warnings.map((w) => (
        <p
          key={w.message}
          className={cn(
            "flex gap-2 rounded-lg border p-2 text-xs",
            w.level === "danger"
              ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
          )}
        >
          {w.level === "danger" ? <AlertTriangle className="mt-px size-3.5 shrink-0" /> : <Info className="mt-px size-3.5 shrink-0" />}
          {w.message}
        </p>
      ))}
    </div>
  );
}

function MealForm({
  initial,
  defaultMeal = "lunch",
  quickPicks = [],
  warningsFor,
  onSubmit,
  onCancel,
}: {
  initial: MealLog | null;
  defaultMeal?: MealSlot;
  quickPicks?: MealFields[];
  warningsFor: (v: { meal: MealSlot; description: string; with_milk: boolean }) => DietWarning[];
  onSubmit: (v: MealFields) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [meal, setMeal] = useState<MealSlot>(initial?.meal ?? defaultMeal);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [protein, setProtein] = useState(initial?.protein_g != null ? String(initial.protein_g) : "");
  const [carbs, setCarbs] = useState(initial?.carbs_g != null ? String(initial.carbs_g) : "");
  const [veg, setVeg] = useState(initial?.veg_servings != null ? String(initial.veg_servings) : "");
  const [withMilk, setWithMilk] = useState(initial?.with_milk ?? false);
  const [saving, setSaving] = useState(false);

  const warnings = description.trim() ? warningsFor({ meal, description, with_milk: withMilk }) : [];

  function pick(m: MealFields) {
    setDescription(m.description);
    setProtein(m.protein_g != null ? String(m.protein_g) : "");
    setCarbs(m.carbs_g != null ? String(m.carbs_g) : "");
    setVeg(m.veg_servings != null ? String(m.veg_servings) : "");
    setWithMilk(m.with_milk);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const nums = [toNum(protein), toNum(carbs), toNum(veg)];
    if (!description.trim()) return toast.error("Describe what you ate");
    if (nums.some((n) => Number.isNaN(n))) return toast.error("Macros must be positive numbers");
    setSaving(true);
    await onSubmit({ meal, description: description.trim(), protein_g: nums[0], carbs_g: nums[1], veg_servings: nums[2], with_milk: withMilk });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-2", initial && "rounded-xl border border-primary/40 p-3")}>
      {quickPicks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-muted-foreground">Recent:</span>
          {quickPicks.map((m) => (
            <button
              key={m.description}
              type="button"
              onClick={() => pick(m)}
              className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-accent"
            >
              {m.description}
            </button>
          ))}
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <select className={selectClass} value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)} aria-label="Meal">
          {MEAL_SLOTS.map((m) => (
            <option key={m} value={m}>
              {MEAL_LABEL[m]}
            </option>
          ))}
        </select>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Chicken rice, no skin + kopi-o kosong"
          aria-label="What you ate"
          maxLength={500}
          autoFocus={!!initial}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="number" inputMode="decimal" step="any" min="0" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Protein g" aria-label="Protein grams" className="w-28" />
        <Input type="number" inputMode="decimal" step="any" min="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} placeholder="Carbs g" aria-label="Carbs grams" className="w-28" />
        <Input type="number" inputMode="decimal" step="any" min="0" value={veg} onChange={(e) => setVeg(e.target.value)} placeholder="Veg servings" aria-label="Veg servings" className="w-28" />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input type="checkbox" checked={withMilk} onChange={(e) => setWithMilk(e.target.checked)} className="size-4 accent-primary" />
          With milk
        </label>
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              <X /> Cancel
            </Button>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {initial ? <Check /> : <Plus />} {initial ? "Save" : "Add"}
          </Button>
        </div>
      </div>
      <Warnings warnings={warnings} />
    </form>
  );
}

function SettingsForm({ settings, onSaved, onCancel }: { settings: NutritionSettings; onSaved: (s: NutritionSettings) => void; onCancel: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const fields: { key: keyof NutritionSettings; label: string }[] = [
    { key: "protein_g_target", label: "Protein target (g)" },
    { key: "carbs_g_target", label: "Carbs max (g)" },
    { key: "veg_target", label: "Veg target (servings)" },
    { key: "goal_lbs_min", label: "Goal weight min (lb)" },
    { key: "goal_lbs_max", label: "Goal weight max (lb)" },
    { key: "lantus_units", label: "Lantus default (u)" },
    { key: "prandial_units", label: "Meal-time default (u)" },
  ];
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.key, String(settings[f.key])])) as Record<keyof NutritionSettings, string>);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = { ...settings };
    for (const f of fields) {
      const n = toNum(values[f.key]);
      if (n === null || Number.isNaN(n)) return toast.error(`${f.label} must be a number`);
      next[f.key] = n;
    }
    if (next.goal_lbs_min > next.goal_lbs_max) return toast.error("Goal min must be at most goal max");
    if (next.lantus_units <= 0 || next.prandial_units <= 0) return toast.error("Insulin defaults must be above 0");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("nutrition_settings")
      .upsert({ user_id: auth.user?.id, ...next }, { onConflict: "user_id" })
      .select("lantus_units, prandial_units, goal_lbs_min, goal_lbs_max, protein_g_target, carbs_g_target, veg_target")
      .single();
    setSaving(false);
    if (error) return toast.error(error.message);
    const saved = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Number(v)])) as unknown as NutritionSettings;
    onSaved(saved);
    toast.success("Targets saved");
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-xl border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fields.map((f) => (
          <label key={f.key} className="grid gap-1 text-xs text-muted-foreground">
            {f.label}
            <Input type="number" step="any" value={values[f.key]} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          <Check /> Save targets
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
