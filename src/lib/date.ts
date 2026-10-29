import { APP_TIMEZONE } from "./config";
import type { Frequency, RoutineGroup, RoutineItem } from "./types";

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar parts of `date` as seen in the app timezone. */
export function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAY_SHORT.indexOf(get("weekday")),
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function isoWeek(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const weekYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { weekYear, week };
}

/** Mirrors public.period_key_for() in schema.sql. */
export function periodKey(freq: Frequency, date = new Date()) {
  const p = zonedParts(date);
  const mm = String(p.month).padStart(2, "0");
  switch (freq) {
    case "daily":
      return p.isoDate;
    case "weekly": {
      const { weekYear, week } = isoWeek(p.year, p.month, p.day);
      return `${weekYear}-W${String(week).padStart(2, "0")}`;
    }
    case "monthly":
      return `${p.year}-${mm}`;
    case "yearly":
      return String(p.year);
    default:
      return "once";
  }
}

export function effectiveFrequency(item: RoutineItem, group: RoutineGroup): Frequency {
  return item.frequency ?? group.frequency;
}

export function effectiveDays(item: RoutineItem, group: RoutineGroup): number[] | null {
  return item.days_of_week ?? group.days_of_week;
}

export function isScheduledOn(item: RoutineItem, group: RoutineGroup, weekday: number) {
  const days = effectiveDays(item, group);
  return !days || days.length === 0 || days.includes(weekday);
}

export function formatDays(days: number[] | null) {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  return [...days]
    .sort()
    .map((d) => WEEKDAY_SHORT[d])
    .join(" / ");
}
