import { CheckCircle2, Flame, Trophy, Zap } from "lucide-react";
import { EXP_PER_LEVEL } from "@/lib/config";
import type { UserStats } from "@/lib/types";

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" className="size-14 -rotate-90" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="var(--muted)" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="transition-all duration-700"
      />
    </svg>
  );
}

function Tile({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="neon-panel flex flex-col gap-3 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

export function StatsHud({ stats, questsDone, questsTotal }: { stats: UserStats; questsDone: number; questsTotal: number }) {
  const intoLevel = stats.exp % EXP_PER_LEVEL;
  const pct = Math.round((intoLevel / EXP_PER_LEVEL) * 100);
  const questPct = questsTotal === 0 ? 0 : Math.round((questsDone / questsTotal) * 100);

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Progress overview">
      <Tile label="Level" icon={<Zap className="size-3.5 text-blue-500" />}>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-semibold tracking-tight">Lv {stats.level}</p>
          <p className="text-xs text-muted-foreground">
            {intoLevel}/{EXP_PER_LEVEL} EXP
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Experience to next level"
        >
          <div className="exp-bar h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
      </Tile>

      <Tile label="Today's tasks" icon={<CheckCircle2 className="size-3.5 text-violet-500" />}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-3xl font-semibold tracking-tight">
              {questsDone}
              <span className="text-lg text-muted-foreground">/{questsTotal}</span>
            </p>
            <p className="text-xs text-muted-foreground">{questPct}% complete</p>
          </div>
          <Ring pct={questPct} color="var(--chart-2)" />
        </div>
      </Tile>

      <Tile label="Streak" icon={<Flame className="size-3.5 text-amber-500" />}>
        <p className="text-3xl font-semibold tracking-tight">
          {stats.streak} <span className="text-lg font-normal text-muted-foreground">days</span>
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Trophy className="size-3" /> Best {stats.longest_streak} days
        </p>
      </Tile>

      <Tile label="Total EXP" icon={<Trophy className="size-3.5 text-emerald-500" />}>
        <p className="text-3xl font-semibold tracking-tight">{stats.exp.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{EXP_PER_LEVEL - intoLevel} EXP to level {stats.level + 1}</p>
      </Tile>
    </section>
  );
}
