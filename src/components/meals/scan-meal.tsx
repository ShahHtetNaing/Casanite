"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Milk, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DietWarning } from "@/lib/milk-fruit";
import { MEAL_SLOTS, type MealSlot } from "@/lib/types";
import type { ScanResult } from "@/app/api/meals/scan/route";
import { MEAL_LABEL, selectClass, toNum, type MealFields } from "./shared";

const MAX_SIDE = 1280;

async function toDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

const fmt = (n: number | null) => (n == null ? "" : String(n));

export function ScanMeal({
  defaultMeal,
  warningsFor,
  onLog,
  Warnings,
}: {
  defaultMeal: MealSlot;
  warningsFor: (v: { meal: MealSlot; description: string; with_milk: boolean }) => DietWarning[];
  onLog: (v: MealFields) => Promise<boolean>;
  Warnings: (p: { warnings: DietWarning[] }) => React.ReactNode;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);
  const [f, setF] = useState({ description: "", kcal: "", protein: "", carbs: "", fiber: "", veg: "" });
  const [withMilk, setWithMilk] = useState(false);

  function reset() {
    setPhoto(null);
    setResult(null);
    setHint("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await toDataUrl(file));
      setResult(null);
    } catch {
      toast.error("Couldn't read that image");
    }
  }

  async function analyze() {
    if (!photo) return;
    setBusy(true);
    try {
      const res = await fetch("/api/meals/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo, hint }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? body.error ?? "Scan failed");
      const r = body as ScanResult;
      setResult(r);
      setF({
        description: r.description,
        kcal: fmt(r.calories_kcal),
        protein: fmt(r.protein_g),
        carbs: fmt(r.carbs_g),
        fiber: fmt(r.fiber_g),
        veg: fmt(r.veg_servings),
      });
      setWithMilk(r.contains_milk);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  }

  const itemText = result ? [f.description, ...result.items.map((i) => i.name)].join(", ") : "";
  const warnings = result && f.description.trim() ? warningsFor({ meal, description: itemText, with_milk: withMilk }) : [];

  async function log() {
    if (!result) return;
    const nums = [toNum(f.kcal), toNum(f.protein), toNum(f.carbs), toNum(f.fiber), toNum(f.veg)];
    if (!f.description.trim()) return toast.error("Describe what you ate");
    if (nums.some((n) => Number.isNaN(n))) return toast.error("Numbers must be positive");
    setBusy(true);
    const ok = await onLog({
      meal,
      description: f.description.trim().slice(0, 500),
      calories_kcal: nums[0] == null ? null : Math.round(nums[0]),
      protein_g: nums[1],
      carbs_g: nums[2],
      fiber_g: nums[3],
      veg_servings: nums[4],
      with_milk: withMilk,
      micronutrients: result.micronutrients,
      items: result.items,
      source: "photo",
    });
    setBusy(false);
    if (ok) reset();
  }

  const field = (key: keyof typeof f, label: string, w = "w-24") => (
    <label className="grid gap-0.5 text-xs text-muted-foreground">
      {label}
      <Input type="number" inputMode="decimal" step="any" min="0" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} aria-label={label} className={w} />
    </label>
  );

  return (
    <div className="grid gap-3">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Meal photo" />
      {!photo ? (
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Camera /> Scan Meal (take or upload a photo)
        </Button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo} alt="Meal to scan" className="aspect-square w-full rounded-xl border object-cover" />
          <div className="grid content-start gap-2">
            {!result ? (
              <>
                <Input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Optional hint, e.g. half portion, no skin" aria-label="Scan hint" maxLength={200} />
                <div className="flex gap-2">
                  <Button type="button" onClick={analyze} disabled={busy}>
                    {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Analyzing…" : "Analyze"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                    <X /> Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {result.items.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5 text-xs">
                    {result.items.map((i, n) => (
                      <li key={n} className="rounded-full border px-2.5 py-0.5">
                        {i.name}
                        {i.grams != null && <span className="text-muted-foreground"> · {i.grams} g</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <select className={`${selectClass} w-full`} value={meal} onChange={(e) => setMeal(e.target.value as MealSlot)} aria-label="Scan meal slot">
                    {MEAL_SLOTS.map((m) => (
                      <option key={m} value={m}>
                        {MEAL_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="Scanned meal name" maxLength={500} />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  {field("kcal", "Calories kcal")}
                  {field("protein", "Protein g")}
                  {field("carbs", "Carbs g")}
                  {field("fiber", "Fiber g")}
                  {field("veg", "Veg servings")}
                  <label className="flex cursor-pointer items-center gap-1.5 pb-1.5 text-sm">
                    <input type="checkbox" checked={withMilk} onChange={(e) => setWithMilk(e.target.checked)} className="size-4 accent-primary" />
                    <Milk className="size-3.5" /> Has milk
                  </label>
                </div>
                {result.micronutrients.length > 0 && (
                  <p className="text-xs">
                    <span className="font-medium">Vitamins & minerals:</span> {result.micronutrients.join(", ")}
                  </p>
                )}
                {result.notes && <p className="text-xs text-muted-foreground">{result.notes}</p>}
                <Warnings warnings={warnings} />
                <div className="flex gap-2">
                  <Button type="button" onClick={log} disabled={busy}>
                    Log Meal
                  </Button>
                  <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                    <X /> Discard
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">AI estimates from a photo can be off. Check the numbers before logging.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
