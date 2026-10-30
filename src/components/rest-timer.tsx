"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Minus, Pause, Play, Plus, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const KEY = "casanite.restTimer";
const PRESETS = [30, 60, 90, 120, 180];

type TimerState = { duration: number; remainingMs: number; endsAt: number | null; open: boolean };
const INITIAL: TimerState = { duration: 90, remainingMs: 90_000, endsAt: null, open: false };

// Module-level so the unlocked AudioContext survives client-side navigation (each page mounts its own RestTimer).
let sharedAudio: AudioContext | null = null;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Floating rest timer. State lives in localStorage so it keeps running across page navigation. */
export function RestTimer() {
  const [state, setState] = useState<TimerState>(INITIAL);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TimerState | null;
      if (saved && typeof saved.duration === "number") {
        // Finished while on another page or closed: show it as done, without a late beep.
        setState(saved.endsAt && saved.endsAt <= Date.now() ? { ...saved, endsAt: null, remainingMs: 0 } : saved);
      }
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, loaded]);

  const beep = useCallback(() => {
    navigator.vibrate?.([200, 100, 200]);
    const ctx = sharedAudio;
    if (!ctx) return;
    void ctx.resume();
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.25);
    });
  }, []);

  useEffect(() => {
    if (!state.endsAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (state.endsAt && t >= state.endsAt) {
        setState((s) => ({ ...s, endsAt: null, remainingMs: 0 }));
        beep();
        toast.success("Rest over. Next set!");
      }
    }, 250);
    return () => clearInterval(id);
  }, [state.endsAt, beep]);

  const running = state.endsAt !== null;
  const remaining = running ? Math.max(0, state.endsAt! - now) : state.remainingMs;
  const pct = state.duration ? Math.min(100, (remaining / (state.duration * 1000)) * 100) : 0;

  function unlockAudio() {
    if (!sharedAudio && typeof window !== "undefined" && "AudioContext" in window) sharedAudio = new AudioContext();
    void sharedAudio?.resume();
  }

  function start() {
    unlockAudio();
    const ms = state.remainingMs > 0 ? state.remainingMs : state.duration * 1000;
    const t = Date.now();
    setNow(t);
    setState((s) => ({ ...s, endsAt: t + ms, remainingMs: ms }));
  }

  function pause() {
    setState((s) => ({ ...s, endsAt: null, remainingMs: Math.max(0, (s.endsAt ?? 0) - Date.now()) }));
  }

  function reset() {
    setState((s) => ({ ...s, endsAt: null, remainingMs: s.duration * 1000 }));
  }

  function setDuration(sec: number) {
    const d = Math.min(Math.max(sec, 5), 3600);
    setState((s) => ({ ...s, duration: d, endsAt: null, remainingMs: d * 1000 }));
  }

  function adjust(deltaSec: number) {
    if (running) {
      setState((s) => ({ ...s, endsAt: Math.max(Date.now() + 1000, (s.endsAt ?? 0) + deltaSec * 1000) }));
    } else if (state.remainingMs > 0 && state.remainingMs !== state.duration * 1000) {
      setState((s) => ({ ...s, remainingMs: Math.max(1000, s.remainingMs + deltaSec * 1000) }));
    } else {
      setDuration(state.duration + deltaSec);
    }
  }

  if (!loaded) return null;

  if (!state.open) {
    return (
      <button
        type="button"
        onClick={() => setState((s) => ({ ...s, open: true }))}
        aria-label="Open rest timer"
        className={cn(
          "fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium shadow-lg transition-colors hover:bg-accent",
          running && "border-primary/40 text-primary",
          !running && remaining === 0 && "border-emerald-500/50 text-emerald-600 dark:text-emerald-300",
        )}
      >
        <Timer className="size-4" />
        {running || remaining !== state.duration * 1000 ? <span className="tabular-nums">{fmt(remaining)}</span> : "Rest timer"}
      </button>
    );
  }

  return (
    <section
      aria-label="Rest timer"
      className="fixed right-4 bottom-4 z-40 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border bg-card p-4 shadow-xl"
    >
      <div className="flex items-center gap-2">
        <Timer className="size-4 text-primary" />
        <h2 className="flex-1 text-sm font-semibold">Rest timer</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Minimize rest timer" onClick={() => setState((s) => ({ ...s, open: false }))}>
          <ChevronDown />
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="icon-sm" aria-label="15 seconds less" onClick={() => adjust(-15)}>
          <Minus />
        </Button>
        <p
          className={cn(
            "text-4xl font-semibold tabular-nums",
            remaining === 0 && "text-emerald-600 dark:text-emerald-300",
          )}
          aria-live="off"
        >
          {fmt(remaining)}
        </p>
        <Button variant="outline" size="icon-sm" aria-label="15 seconds more" onClick={() => adjust(15)}>
          <Plus />
        </Button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setDuration(p)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              state.duration === p ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {p < 60 ? `${p}s` : p % 60 ? `${Math.floor(p / 60)}:${String(p % 60).padStart(2, "0")}` : `${p / 60}m`}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        {running ? (
          <Button onClick={pause}>
            <Pause /> Pause
          </Button>
        ) : (
          <Button onClick={start}>
            <Play /> {remaining > 0 && remaining < state.duration * 1000 ? "Resume" : "Start"}
          </Button>
        )}
        <Button variant="outline" onClick={reset} aria-label="Reset rest timer">
          <RotateCcw /> Reset
        </Button>
      </div>
    </section>
  );
}
