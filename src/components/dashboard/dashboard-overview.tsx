"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, CheckCheck, Flame, HeartPulse, ListTodo, ShoppingCart, Utensils } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EXP_PER_LEVEL } from "@/lib/config";
import { zonedParts } from "@/lib/date";
import type { DashboardData } from "@/lib/dashboard-data";

const number = (value: number) => new Intl.NumberFormat("en-SG", { maximumFractionDigits: 1 }).format(value);
const metricClass = "neon-panel group flex min-w-0 flex-col gap-3 p-5 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary";

function Metric({ label, value, detail, icon, href, onClick }: {
  label: string; value: string; detail: string; icon: React.ReactNode; href?: string; onClick?: () => void;
}) {
  const content = <>
    <span className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground"><span>{label}</span>{icon}</span>
    <span className="font-display text-4xl leading-none tracking-wide">{value}</span>
    <span className="mt-auto flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{detail}</span><ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-1" /></span>
  </>;
  return href ? <Link href={href} className={metricClass}>{content}</Link> : <button type="button" onClick={onClick} className={metricClass}>{content}</button>;
}

export function DashboardOverview({ data, done, total, onSelect }: {
  data: DashboardData; done: number; total: number; onSelect: (tab: string) => void;
}) {
  const { stats, summary } = data;
  const latestWeight = [...data.healthLogs].reverse().find((log) => log.weight_kg != null);
  const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  const levelProgress = stats.exp % EXP_PER_LEVEL;
  const today = zonedParts();
  return <section className="grid gap-4" aria-label="Daily overview">
    <div className="neon-panel relative overflow-hidden p-5 sm:p-7">
      <div className="pointer-events-none absolute right-0 top-0 size-64 translate-x-1/3 -translate-y-1/2 rounded-full border-[36px] border-primary/5" aria-hidden />
      <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div>
          <p className="app-eyebrow">{today.isoDate} / personal overview</p>
          <h2 className="mt-3 font-display text-4xl tracking-wide sm:text-5xl">Today, in focus.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">A little structure for your health, learning and everyday life. Choose the next useful thing—not everything at once.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/tasks" className={buttonVariants({ size: "sm" })}><ListTodo /> Open daily tasks</Link>
            <Button type="button" size="sm" variant="outline" onClick={() => onSelect("health")}><HeartPulse /> Review / log health</Button>
          </div>
        </div>
        <div className="rounded-xl border border-dashed bg-background/50 p-4">
          <div className="flex items-center justify-between gap-3"><p className="text-xs font-medium text-muted-foreground">Daily habits</p><CheckCheck className="size-4 text-primary" /></div>
          <div className="my-2 flex items-baseline gap-2"><strong className="font-display text-4xl font-normal tracking-wide">{done}/{total}</strong><span className="text-xs text-muted-foreground">{total ? `${pct}% complete` : "No habits scheduled"}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Daily habit completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <button type="button" className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary underline-offset-4 hover:underline" onClick={() => onSelect("today")}>View today&apos;s habits <ArrowRight className="size-3" /></button>
        </div>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Open daily tasks" value={summary ? String(summary.tasksOpen) : "—"} detail={summary ? "Your next actions, ready to organise" : "Summary unavailable; open your list"} icon={<ListTodo className="size-4" />} href="/tasks" />
      <Metric label="Latest recorded weight" value={latestWeight ? `${number(Number(latestWeight.weight_kg))} kg` : "—"}
        detail={latestWeight ? `Recorded ${zonedParts(new Date(latestWeight.logged_at)).isoDate}` : "Add your first health entry"} icon={<HeartPulse className="size-4" />} onClick={() => onSelect("health")} />
      <Metric label="Protein logged today" value={summary ? `${number(summary.protein)} g` : "—"}
        detail={summary ? `${summary.meals} meal${summary.meals === 1 ? "" : "s"} logged · estimates only` : "Meal summary unavailable"} icon={<Utensils className="size-4" />} href="/meals" />
      <Metric label="Current streak" value={`${stats.streak} days`} detail={`Best ${stats.longest_streak} days · view your goals`} icon={<Flame className="size-4" />} onClick={() => onSelect("goals")} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="neon-panel p-5">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Next on your list</h3><Link href="/tasks" className="text-xs font-medium text-primary hover:underline">Manage tasks</Link></div>
        {summary == null ? <p className="text-sm text-muted-foreground">The task summary could not be loaded. Your full list is still available.</p> : summary.tasks.length ?
          <ul className="divide-y divide-dashed">{summary.tasks.map((task, index) => <li key={task.id}><Link href="/tasks" className="group flex items-center gap-3 py-2.5 text-sm"><span className="font-mono text-[10px] text-primary">0{index + 1}</span><span className="min-w-0 flex-1 break-words">{task.title}</span><ArrowRight className="size-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /></Link></li>)}</ul> :
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Your list is clear. Add one useful task, or take a proper break.</p>}
      </section>
      <section className="neon-panel grid gap-4 p-5">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold">Your progress</span><span className="font-mono text-muted-foreground">LEVEL {stats.level} · {stats.exp} EXP</span></div>
        <div><div className="mb-1.5 flex justify-between gap-3 text-xs text-muted-foreground"><span>Next level</span><span>{levelProgress}/{EXP_PER_LEVEL} EXP</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Experience to next level" aria-valuemin={0} aria-valuemax={EXP_PER_LEVEL} aria-valuenow={levelProgress}><div className="h-full bg-primary" style={{ width: `${levelProgress / EXP_PER_LEVEL * 100}%` }} /></div></div>
        <p className="text-xs text-muted-foreground">{summary ? `Nutrition logged: ${number(summary.calories)} kcal · ${number(summary.carbs)} g carbs (estimates)` : "Nutrition summary unavailable"}</p>
        <div className="grid grid-cols-2 gap-2 border-t border-dashed pt-3">
          <Link href="/shopping" className="flex items-center gap-2 rounded-lg p-2 text-xs transition-colors hover:bg-accent"><ShoppingCart className="size-4 text-primary" /><span>{summary ? summary.shoppingOpen : "—"} to buy</span><ArrowRight className="ml-auto size-3" /></Link>
          <Link href="/journal" className="flex items-center gap-2 rounded-lg p-2 text-xs transition-colors hover:bg-accent"><BookOpen className="size-4 text-primary" /><span>Weekly journal</span><ArrowRight className="ml-auto size-3" /></Link>
        </div>
      </section>
    </div>
  </section>;
}
