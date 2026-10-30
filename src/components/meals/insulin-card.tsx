"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Syringe, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { MEAL_SLOTS, type InsulinLog, type MealSlot, type NutritionSettings } from "@/lib/types";
import { MEAL_LABEL, atTime, currentMeal, formatTime, nowTime, selectClass, timeOf, toNum } from "./shared";

type Props = { day: string; today: string; initialLogs: InsulinLog[]; settings: NutritionSettings };

function validUnits(s: string) {
  const n = toNum(s);
  if (n === null || Number.isNaN(n) || n <= 0 || n > 100) {
    toast.error("Units must be between 0 and 100");
    return null;
  }
  return n;
}

export function InsulinCard({ day, today, initialLogs, settings }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState(initialLogs);
  const defaultTime = day === today ? nowTime() : "12:00";
  const [lantusUnits, setLantusUnits] = useState(String(settings.lantus_units));
  const [lantusTime, setLantusTime] = useState(defaultTime);
  const [mealUnits, setMealUnits] = useState(String(settings.prandial_units));
  const [mealTime, setMealTime] = useState(defaultTime);
  const [meal, setMeal] = useState<MealSlot>(day === today ? currentMeal() : "lunch");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUnits, setEditUnits] = useState("");
  const [editTime, setEditTime] = useState("");

  const lantus = logs.find((l) => l.kind === "lantus");
  const prandial = logs.filter((l) => l.kind === "prandial").sort((a, b) => a.taken_at.localeCompare(b.taken_at));

  async function add(kind: InsulinLog["kind"], unitsText: string, time: string, mealSlot: MealSlot | null) {
    const units = validUnits(unitsText);
    if (units === null) return;
    const { data, error } = await supabase
      .from("insulin_logs")
      .insert({ day, kind, units, meal: mealSlot, taken_at: atTime(day, time) })
      .select("*")
      .single();
    if (error) return toast.error(error.code === "23505" ? "Lantus is already logged for this day" : error.message);
    setLogs((prev) => [...prev, data as InsulinLog]);
  }

  async function saveEdit(log: InsulinLog) {
    const units = validUnits(editUnits);
    if (units === null) return;
    const { data, error } = await supabase
      .from("insulin_logs")
      .update({ units, taken_at: atTime(day, editTime) })
      .eq("id", log.id)
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setLogs((prev) => prev.map((l) => (l.id === log.id ? (data as InsulinLog) : l)));
    setEditing(null);
  }

  async function remove(log: InsulinLog) {
    if (!confirm(`Delete this ${log.units} u dose?`)) return;
    const { error } = await supabase.from("insulin_logs").delete().eq("id", log.id);
    if (error) return toast.error(error.message);
    setLogs((prev) => prev.filter((l) => l.id !== log.id));
  }

  function row(log: InsulinLog, label: string) {
    if (editing === log.id) {
      return (
        <div key={log.id} className="flex items-center gap-2">
          <Input type="number" step="0.5" value={editUnits} onChange={(e) => setEditUnits(e.target.value)} aria-label="Units" className="w-20" />
          <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} aria-label="Time" className="w-28" />
          <Button size="icon-sm" aria-label="Save dose" onClick={() => saveEdit(log)}>
            <Check />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => setEditing(null)}>
            <X />
          </Button>
        </div>
      );
    }
    return (
      <div key={log.id} className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-sm">
        <span className="font-semibold tabular-nums">{log.units} u</span>
        <span className="flex-1 text-muted-foreground">
          {label} · {formatTime(log.taken_at)}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit dose"
          onClick={() => {
            setEditing(log.id);
            setEditUnits(String(log.units));
            setEditTime(timeOf(log.taken_at));
          }}
        >
          <Pencil />
        </Button>
        <Button variant="ghost" size="icon-xs" aria-label="Delete dose" onClick={() => remove(log)}>
          <Trash2 />
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Syringe className="size-4 text-primary" />
        <CardTitle className="flex-1">Insulin</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <p className="text-sm font-medium">
            Lantus <span className="font-normal text-muted-foreground">· long-acting, once a day</span>
          </p>
          {lantus ? (
            row(lantus, "Lantus")
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="number" step="0.5" value={lantusUnits} onChange={(e) => setLantusUnits(e.target.value)} aria-label="Lantus units" className="w-20" />
              <span className="text-sm text-muted-foreground">u</span>
              <Input type="time" value={lantusTime} onChange={(e) => setLantusTime(e.target.value)} aria-label="Lantus time" className="w-28" />
              <Button size="sm" onClick={() => add("lantus", lantusUnits, lantusTime, null)}>
                <Plus /> Log Lantus
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-medium">
            Meal-time insulin <span className="font-normal text-muted-foreground">· {prandial.length} of 2–3 doses</span>
          </p>
          {prandial.map((l) => row(l, l.meal ? MEAL_LABEL[l.meal] : "Meal"))}
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" step="0.5" value={mealUnits} onChange={(e) => setMealUnits(e.target.value)} aria-label="Meal-time units" className="w-20" />
            <span className="text-sm text-muted-foreground">u</span>
            <select className={`${selectClass} w-28`} value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)} aria-label="Meal">
              {MEAL_SLOTS.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABEL[m]}
                </option>
              ))}
            </select>
            <Input type="time" value={mealTime} onChange={(e) => setMealTime(e.target.value)} aria-label="Meal-time dose time" className="w-28" />
            <Button size="sm" variant="outline" onClick={() => add("prandial", mealUnits, mealTime, meal)}>
              <Plus /> Log dose
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">For tracking only. Follow your doctor&apos;s dosing plan.</p>
      </CardContent>
    </Card>
  );
}
