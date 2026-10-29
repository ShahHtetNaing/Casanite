export type ItemKind =
  | "exercise"
  | "recovery"
  | "habit"
  | "hygiene"
  | "academic"
  | "goal"
  | "diet";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly" | "once";

export const ITEM_KINDS: ItemKind[] = [
  "exercise",
  "recovery",
  "habit",
  "hygiene",
  "academic",
  "goal",
  "diet",
];
export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "yearly", "once"];
export const GROUP_COLORS = [
  "cyan",
  "fuchsia",
  "violet",
  "lime",
  "amber",
  "sky",
  "emerald",
  "rose",
] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

export interface UserStats {
  user_id: string;
  level: number;
  exp: number;
  streak: number;
  longest_streak: number;
  last_active_date: string | null;
  updated_at: string;
}

export interface RoutineGroup {
  id: string;
  title: string;
  description: string | null;
  kind: ItemKind;
  frequency: Frequency;
  days_of_week: number[] | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export interface RoutineItem {
  id: string;
  group_id: string;
  title: string;
  details: string | null;
  youtube_url: string | null;
  notes: string | null;
  frequency: Frequency | null;
  days_of_week: number[] | null;
  target_count: number;
  target_date: string | null;
  is_trackable: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface Completion {
  id: string;
  item_id: string | null;
  period_key: string;
  completed_on: string;
}

export interface HealthLog {
  id: string;
  logged_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  systolic: number | null;
  diastolic: number | null;
  heart_rate: number | null;
  notes: string | null;
}

export interface FitDay {
  date: string;
  steps: number;
  activeMinutes: number;
  sleepMinutes: number;
}

export interface FitSummary {
  today: FitDay;
  history: FitDay[];
}

export interface CalendarEventLite {
  id: string;
  summary: string;
  location: string | null;
  start: string;
  end: string | null;
  allDay: boolean;
  htmlLink: string | null;
}

export interface CalendarSummary {
  appointments: CalendarEventLite[];
  guitarClasses: CalendarEventLite[];
}
