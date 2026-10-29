"use client";

import { Activity, Footprints, Moon, RefreshCw } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Button } from "@/components/ui/button";
import type { FitSummary } from "@/lib/types";
import { GoogleStatus } from "./google-status";
import { useGoogleData } from "./use-google-data";

const STEP_GOAL = 8000;

function Metric({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-black/20 p-2.5">
      <p className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        {icon}
        {label}
      </p>
      <p className="font-display text-lg font-bold">{value}</p>
      {sub && <p className="font-mono text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function FitWidget() {
  const { state, refresh } = useGoogleData<FitSummary>("/api/google/fit");
  const data = "data" in state ? state.data : undefined;
  const today = data?.today;

  return (
    <section className="neon-panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold tracking-wider text-lime-300 uppercase">Google Fit Sync</h3>
        <Button size="xs" variant="outline" onClick={() => void refresh()} disabled={state.status === "loading"}>
          <RefreshCw className={state.status === "loading" ? "animate-spin" : undefined} />
          Sync
        </Button>
      </header>

      {(state.status === "not_connected" || state.status === "error") && (
        <GoogleStatus status={state.status} message={state.message} />
      )}

      {today && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Metric
              icon={<Footprints className="size-3" />}
              label="Steps"
              value={today.steps.toLocaleString()}
              sub={`${Math.min(100, Math.round((today.steps / STEP_GOAL) * 100))}% of ${STEP_GOAL / 1000}k`}
            />
            <Metric icon={<Activity className="size-3" />} label="Active" value={`${today.activeMinutes}m`} />
            <Metric
              icon={<Moon className="size-3" />}
              label="Sleep"
              value={`${Math.floor(today.sleepMinutes / 60)}h ${today.sleepMinutes % 60}m`}
            />
          </div>
          <div className="mt-3 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.history}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(8)}
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "oklch(1 0 0 / 5%)" }}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="steps" name="Steps" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {state.status === "loading" && !today && <p className="text-xs text-muted-foreground">Syncing…</p>}
    </section>
  );
}
