import { Flame, Shield, Trophy, Zap } from "lucide-react";
import { EXP_PER_LEVEL } from "@/lib/config";
import type { UserStats } from "@/lib/types";

export function StatsHud({ stats, questsDone, questsTotal }: { stats: UserStats; questsDone: number; questsTotal: number }) {
  const intoLevel = stats.exp % EXP_PER_LEVEL;
  const pct = Math.round((intoLevel / EXP_PER_LEVEL) * 100);
  const questPct = questsTotal === 0 ? 0 : Math.round((questsDone / questsTotal) * 100);

  return (
    <section className="neon-panel scanlines grid gap-5 p-5 md:grid-cols-[auto_1fr_auto]">
      <div className="flex items-center gap-4">
        <div className="relative grid size-20 place-items-center rounded-xl border-2 border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_24px_-4px] shadow-cyan-400/60">
          <Shield className="absolute size-16 text-cyan-400/15" />
          <div className="text-center">
            <p className="font-mono text-[10px] tracking-widest text-cyan-300/80">LVL</p>
            <p className="font-display text-3xl font-black text-cyan-200">{stats.level}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-2">
        <div className="flex items-baseline justify-between font-mono text-xs">
          <span className="flex items-center gap-1 text-cyan-300">
            <Zap className="size-3.5" /> EXP
          </span>
          <span className="text-muted-foreground">
            {intoLevel}/{EXP_PER_LEVEL} → LV {stats.level + 1} · total {stats.exp}
          </span>
        </div>
        <div
          className="h-3 overflow-hidden rounded-full border border-cyan-400/30 bg-black/40"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Experience to next level"
        >
          <div className="exp-bar h-full rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-baseline justify-between font-mono text-xs">
          <span className="text-fuchsia-300">TODAY&apos;S QUESTS</span>
          <span className="text-muted-foreground">
            {questsDone}/{questsTotal} ({questPct}%)
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
          <div className="h-full rounded-full bg-fuchsia-400 transition-all duration-700" style={{ width: `${questPct}%` }} />
        </div>
      </div>

      <div className="flex items-center gap-3 md:flex-col md:items-end md:justify-center">
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2">
          <Flame className={stats.streak > 0 ? "size-6 text-amber-400 drop-shadow-[0_0_6px_currentColor]" : "size-6 text-muted-foreground"} />
          <div>
            <p className="font-display text-xl leading-none font-bold text-amber-200">{stats.streak}</p>
            <p className="font-mono text-[10px] text-amber-300/70">DAY STREAK</p>
          </div>
        </div>
        <p className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          <Trophy className="size-3" /> best {stats.longest_streak}
        </p>
      </div>
    </section>
  );
}
