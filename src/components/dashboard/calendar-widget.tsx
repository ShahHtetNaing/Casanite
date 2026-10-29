"use client";

import { CalendarClock, Guitar, RefreshCw, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_TIMEZONE } from "@/lib/config";
import type { CalendarEventLite, CalendarSummary } from "@/lib/types";
import { GoogleStatus } from "./google-status";
import type { GoogleState } from "./use-google-data";
import { formatEventTime } from "./guitar-alert";

function formatDay(e: CalendarEventLite) {
  const date = new Date(e.allDay ? `${e.start}T00:00:00+08:00` : e.start);
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function EventRow({ e, icon }: { e: CalendarEventLite; icon: React.ReactNode }) {
  const soon = new Date(e.start).getTime() - Date.now() < 48 * 3_600_000;
  return (
    <li className={cn("flex gap-2 rounded-md border border-transparent p-1.5", soon && "border-rose-400/40 bg-rose-400/5")}>
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {e.htmlLink ? (
            <a href={e.htmlLink} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {e.summary}
            </a>
          ) : (
            e.summary
          )}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {formatDay(e)} · {formatEventTime(e.start, e.allDay)}
          {e.location && ` · ${e.location}`}
        </p>
      </div>
      {soon && <span className="font-mono text-[10px] text-rose-300">SOON</span>}
    </li>
  );
}

export function CalendarWidget({ state, refresh }: { state: GoogleState<CalendarSummary>; refresh: () => void }) {
  const data = "data" in state ? state.data : undefined;

  return (
    <section className="neon-panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-sm font-bold tracking-wider text-sky-300 uppercase">
          <CalendarClock className="size-4" /> Calendar
        </h3>
        <Button size="xs" variant="outline" onClick={refresh} disabled={state.status === "loading"}>
          <RefreshCw className={state.status === "loading" ? "animate-spin" : undefined} />
        </Button>
      </header>

      {(state.status === "not_connected" || state.status === "error") && (
        <GoogleStatus status={state.status} message={state.message} />
      )}

      {data && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Doctor appointments</p>
            {data.appointments.length === 0 ? (
              <p className="text-xs text-muted-foreground">None in the next 60 days.</p>
            ) : (
              <ul className="space-y-1">
                {data.appointments.map((e) => (
                  <EventRow key={e.id} e={e} icon={<Stethoscope className="size-3.5 text-rose-300" />} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Guitar class (Sat, Tampines)</p>
            {data.guitarClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No &quot;guitar&quot; events found — the Saturday reminder still fires before 10:00.
              </p>
            ) : (
              <ul className="space-y-1">
                {data.guitarClasses.slice(0, 2).map((e) => (
                  <EventRow key={e.id} e={e} icon={<Guitar className="size-3.5 text-fuchsia-300" />} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {state.status === "loading" && !data && <p className="text-xs text-muted-foreground">Loading…</p>}
    </section>
  );
}
