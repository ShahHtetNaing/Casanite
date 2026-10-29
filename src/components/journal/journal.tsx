"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Loader2, Salad, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { WEEKDAY_SHORT } from "@/lib/date";
import type { DietLog, ReportWeek, RoutineItem, WeeklyReport } from "@/lib/types";
import { ReportView, formatWeek } from "./report-view";

type Props = {
  initialReports: WeeklyReport[];
  dietItems: RoutineItem[];
  initialDietLogs: DietLog[];
  weekDays: string[];
  today: string;
};

export function Journal({ initialReports, dietItems, initialDietLogs, weekDays, today }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState(initialReports);
  const [selectedId, setSelectedId] = useState(initialReports[0]?.id ?? null);
  const [generating, setGenerating] = useState<ReportWeek | null>(null);
  const [logs, setLogs] = useState(initialDietLogs);
  const pending = useRef(new Map<string, Promise<unknown>>());

  const selected = reports.find((r) => r.id === selectedId) ?? reports[0] ?? null;

  async function generate(week: ReportWeek) {
    setGenerating(week);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? body.error ?? "Could not generate the report");
      const report = body.report as WeeklyReport;
      setReports((prev) =>
        [report, ...prev.filter((r) => r.week_start !== report.week_start)].sort((a, b) => b.week_start.localeCompare(a.week_start)),
      );
      setSelectedId(report.id);
      toast.success("Weekly Quest Report ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate the report");
    } finally {
      setGenerating(null);
    }
  }

  const logFor = (itemId: string, day: string) => logs.find((l) => l.item_id === itemId && l.day === day);

  /** Cycles a cell: not logged → kept → missed → not logged. */
  function cycle(itemId: string, day: string) {
    const current = logFor(itemId, day);
    const next: boolean | null = !current ? true : current.followed ? false : null;
    const before = logs;
    setLogs((prev) => {
      const rest = prev.filter((l) => !(l.item_id === itemId && l.day === day));
      return next === null ? rest : [...rest, { id: current?.id ?? `tmp-${itemId}-${day}`, item_id: itemId, day, followed: next }];
    });

    const key = `${itemId}|${day}`;
    const request = (pending.current.get(key) ?? Promise.resolve()).then(() =>
      next === null
        ? supabase.from("diet_logs").delete().eq("item_id", itemId).eq("day", day)
        : supabase.from("diet_logs").upsert({ item_id: itemId, day, followed: next }, { onConflict: "user_id,item_id,day" }),
    );
    pending.current.set(key, request.catch(() => undefined));
    void request.then(({ error }) => {
      if (error) {
        setLogs(before);
        toast.error(error.message);
      }
    });
  }

  return (
    <AppShell
      title="Journal"
      subtitle="Weekly Quest Report · generated every Sunday night"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!!generating} onClick={() => void generate("previous")}>
            {generating === "previous" && <Loader2 className="size-4 animate-spin" />}
            Last week
          </Button>
          <Button size="sm" disabled={!!generating} onClick={() => void generate("current")}>
            {generating === "current" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Generate now
          </Button>
        </div>
      }
    >
      <section className="neon-panel p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
          <Salad className="size-4" /> Diet check-in · this week
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">Tap a day to mark a rule as kept, tap again for missed, once more to clear.</p>
        {dietItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">No diet rules yet. Add them on the Dashboard in Edit Mode.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">Rule</th>
                  {weekDays.map((d) => (
                    <th key={d} className={`pb-2 font-medium ${d === today ? "text-blue-600 dark:text-blue-300" : ""}`}>
                      {WEEKDAY_SHORT[new Date(`${d}T00:00:00Z`).getUTCDay()]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dietItems.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{item.title}</p>
                      {item.details && <p className="text-xs text-muted-foreground">{item.details}</p>}
                    </td>
                    {weekDays.map((day) => {
                      const log = logFor(item.id, day);
                      const future = day > today;
                      const label = `${item.title} on ${day}: ${!log ? "not logged" : log.followed ? "kept" : "missed"}`;
                      return (
                        <td key={day} className="py-2 text-center">
                          <button
                            type="button"
                            disabled={future}
                            onClick={() => cycle(item.id, day)}
                            aria-label={label}
                            title={label}
                            className={`mx-auto grid size-8 place-items-center rounded-lg border transition-colors disabled:opacity-30 ${
                              !log
                                ? "hover:bg-accent"
                                : log.followed
                                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                                  : "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300"
                            }`}
                          >
                            {log && (log.followed ? <Check className="size-4" /> : <X className="size-4" />)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {reports.length > 1 && (
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Past reports">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={r.id === selected?.id}
              onClick={() => setSelectedId(r.id)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                r.id === selected?.id ? "border-blue-600 bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {formatWeek(r.week_start, r.week_end)}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <ReportView report={selected} />
      ) : (
        <section className="neon-panel grid place-items-center gap-3 p-10 text-center">
          <Sparkles className="size-8 text-blue-500" />
          <div>
            <p className="font-semibold">No quest reports yet</p>
            <p className="text-sm text-muted-foreground">
              A report is written automatically every Sunday night. Click Generate now to get this week&apos;s report so far.
            </p>
          </div>
        </section>
      )}
    </AppShell>
  );
}
