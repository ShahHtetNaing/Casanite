import { Dumbbell, Flame, ListChecks, Salad, Swords, Target, TrendingUp, Zap } from "lucide-react";
import { WEEKDAY_SHORT } from "@/lib/date";
import type { WeeklyReport } from "@/lib/types";

const RANK_STYLE: Record<string, string> = {
  S: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  A: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  B: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  C: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  D: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
};

export function RankBadge({ rank, className = "" }: { rank: string; className?: string }) {
  return (
    <span
      className={`grid size-12 shrink-0 place-items-center rounded-xl text-2xl font-bold ${RANK_STYLE[rank] ?? RANK_STYLE.C} ${className}`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

export function formatWeek(start: string, end: string) {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

const pct = (done: number, total: number) => (total === 0 ? 0 : Math.round((done / total) * 100));

function Bar({ value, className = "bg-blue-500" }: { value: number; className?: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${className}`} style={{ width: `${value}%` }} />
    </div>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="neon-panel p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function List({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <section className="neon-panel p-4">
      <h3 className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
        {icon}
        {title}
      </h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}

export function ReportView({ report }: { report: WeeklyReport }) {
  const { stats: s, report: r } = report;
  const questPct = pct(s.quests.done, s.quests.scheduled);
  return (
    <div className="grid gap-4">
      <section className="neon-panel p-5">
        <div className="flex items-start gap-4">
          <RankBadge rank={r.rank} />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Weekly Quest Report · {formatWeek(report.week_start, report.week_end)}
              {s.daysElapsed < 7 && ` · ${s.daysElapsed}/7 days`}
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">{r.title}</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed">{r.summary}</p>
        {r.streak_message && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-orange-500/10 p-3 text-sm text-orange-700 dark:text-orange-300">
            <Flame className="mt-0.5 size-4 shrink-0" />
            {r.streak_message}
          </p>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<ListChecks className="size-3.5 text-blue-500" />} label="Daily quests" value={`${questPct}%`} hint={`${s.quests.done}/${s.quests.scheduled} done`} />
        <Stat
          icon={<Zap className="size-3.5 text-violet-500" />}
          label="EXP gained"
          value={`+${s.expGained}`}
          hint={s.level > s.levelAtStart ? `Lv ${s.levelAtStart} → Lv ${s.level}` : `Lv ${s.level}`}
        />
        <Stat icon={<Flame className="size-3.5 text-orange-500" />} label="Streak" value={`${s.streak} days`} hint={`Best ${s.longestStreak} · active ${s.activeDays}/${s.daysElapsed} days`} />
        <Stat icon={<Target className="size-3.5 text-emerald-500" />} label="Tasks done" value={String(s.tasks.completed)} hint={`${s.tasks.open} still open`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="neon-panel p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Dumbbell className="size-4 text-fuchsia-500" /> Gym consistency
          </h3>
          {s.gym.length === 0 && <p className="text-xs text-muted-foreground">No gym days scheduled this week.</p>}
          <ul className="space-y-3">
            {s.gym.map((g) => (
              <li key={g.title}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{g.title}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {g.sessionsDone}/{g.scheduledDays} sessions · {g.itemsDone}/{g.itemsScheduled} sets
                  </span>
                </div>
                <Bar value={pct(g.itemsDone, g.itemsScheduled)} className="bg-fuchsia-500" />
              </li>
            ))}
          </ul>
        </section>
        <section className="neon-panel p-4">
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Salad className="size-4 text-emerald-500" /> Diet rules
          </h3>
          {s.diet.length === 0 && <p className="text-xs text-muted-foreground">No diet rules set.</p>}
          <ul className="space-y-3">
            {s.diet.map((d) => (
              <li key={d.title}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{d.title}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {d.followed} kept · {d.missed} missed{d.unlogged ? ` · ${d.unlogged} not logged` : ""}
                  </span>
                </div>
                <Bar value={pct(d.followed, d.followed + d.missed + d.unlogged)} className="bg-emerald-500" />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="neon-panel p-4">
        <h3 className="mb-3 text-sm font-semibold">Quests per day</h3>
        <div className="grid grid-cols-7 gap-2">
          {s.byDay.map((d) => {
            const v = pct(d.done, d.scheduled);
            return (
              <div key={d.date} className="text-center">
                <div className="mx-auto flex h-20 w-full max-w-10 items-end overflow-hidden rounded-md bg-muted">
                  <div className="w-full rounded-md bg-blue-500" style={{ height: `${v}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{WEEKDAY_SHORT[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</p>
                <p className="text-xs tabular-nums">{v}%</p>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <List title="Victories" icon={<Swords className="size-4" />} items={r.victories} tone="text-emerald-600 dark:text-emerald-300" />
        <List title="Weak points" icon={<Target className="size-4" />} items={r.weak_points} tone="text-rose-600 dark:text-rose-300" />
        <List title="Habit tweaks" icon={<TrendingUp className="size-4" />} items={r.habit_tweaks} tone="text-blue-600 dark:text-blue-300" />
        <List title="Next week's focus" icon={<Flame className="size-4" />} items={r.focus_areas} tone="text-violet-600 dark:text-violet-300" />
      </div>

      {r.stat_adjustments.length > 0 && (
        <section className="neon-panel p-4">
          <h3 className="mb-3 text-sm font-semibold">Stat adjustments</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {r.stat_adjustments.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border p-3">
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold tabular-nums ${
                    a.change.trim().startsWith("-") ? "bg-rose-500/15 text-rose-600 dark:text-rose-300" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                  }`}
                >
                  {a.stat} {a.change}
                </span>
                <span className="text-sm">{a.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
