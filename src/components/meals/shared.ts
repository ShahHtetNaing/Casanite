import { APP_TIMEZONE } from "@/lib/config";
import { zonedParts } from "@/lib/date";
import type { MealSlot } from "@/lib/types";

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
};

export const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover";

/** Blank → null, invalid/negative → NaN (caller rejects), else the number. */
export function toNum(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export function currentMeal(): MealSlot {
  const h = zonedParts().hour;
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner";
}

export function nowTime() {
  const p = zonedParts();
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function atTime(day: string, time: string) {
  return new Date(`${day}T${time || "12:00"}:00+08:00`).toISOString();
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-SG", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" });
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
