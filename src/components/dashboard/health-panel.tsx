"use client";

import { useMemo, useState } from "react";
import { HeartPulse, Pencil, Scale, Trash2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_TIMEZONE } from "@/lib/config";
import type { HealthLog } from "@/lib/types";

export type HealthFormValues = Omit<HealthLog, "id" | "bmi">;

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", fontSize: 12 };
const axisTick = { fontSize: 10, fill: "var(--muted-foreground)" };

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-SG", { timeZone: APP_TIMEZONE, day: "numeric", month: "short" }).format(new Date(iso));

function bmiLabel(bmi: number) {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 23) return "Healthy (Asian cut-off)";
  if (bmi < 27.5) return "Overweight risk";
  return "High risk";
}

function bpLabel(sys: number, dia: number) {
  if (sys >= 140 || dia >= 90) return "High";
  if (sys >= 130 || dia >= 80) return "Elevated (stage 1)";
  if (sys >= 120) return "Elevated";
  return "Normal";
}

const num = (s: string) => (s.trim() === "" ? null : Number(s));

function HealthForm({
  initial,
  lastHeight,
  onSave,
  onCancel,
}: {
  initial: HealthLog | null;
  lastHeight: number | null;
  onSave: (v: HealthFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [loggedAt, setLoggedAt] = useState(toLocalInput(initial?.logged_at ?? new Date().toISOString()));
  const [weight, setWeight] = useState(initial?.weight_kg?.toString() ?? "");
  const [height, setHeight] = useState((initial?.height_cm ?? lastHeight)?.toString() ?? "");
  const [sys, setSys] = useState(initial?.systolic?.toString() ?? "");
  const [dia, setDia] = useState(initial?.diastolic?.toString() ?? "");
  const [hr, setHr] = useState(initial?.heart_rate?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        logged_at: new Date(loggedAt).toISOString(),
        weight_kg: num(weight),
        height_cm: num(height),
        systolic: num(sys),
        diastolic: num(dia),
        heart_rate: num(hr),
        notes: notes.trim() || null,
      });
      if (!initial) {
        setWeight("");
        setSys("");
        setDia("");
        setHr("");
        setNotes("");
        setLoggedAt(toLocalInput(new Date().toISOString()));
      }
    } finally {
      setSaving(false);
    }
  }

  const fields: [string, string, (v: string) => void, string, number, number][] = [
    ["Weight (kg)", weight, setWeight, "0.1", 20, 400],
    ["Height (cm)", height, setHeight, "0.1", 80, 260],
    ["Systolic", sys, setSys, "1", 50, 260],
    ["Diastolic", dia, setDia, "1", 30, 180],
    ["Heart rate", hr, setHr, "1", 25, 250],
  ];

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label>When</Label>
        <Input type="datetime-local" value={loggedAt} onChange={(e) => setLoggedAt(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map(([label, value, set, step, min, max]) => (
          <div key={label} className="grid gap-1.5">
            <Label>{label}</Label>
            <Input type="number" inputMode="decimal" step={step} min={min} max={max} value={value} onChange={(e) => set(e.target.value)} />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="neon-button">
          {saving ? "Saving…" : initial ? "Update log" : "Add log"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

export function HealthPanel({
  logs,
  onCreate,
  onUpdate,
  onDelete,
}: {
  logs: HealthLog[];
  onCreate: (v: HealthFormValues) => Promise<void>;
  onUpdate: (id: string, v: HealthFormValues) => Promise<void>;
  onDelete: (log: HealthLog) => void;
}) {
  const [editing, setEditing] = useState<HealthLog | null>(null);

  const chartData = useMemo(
    () =>
      logs.map((l) => ({
        date: shortDate(l.logged_at),
        weight: l.weight_kg != null ? Number(l.weight_kg) : null,
        bmi: l.bmi != null ? Number(l.bmi) : null,
        systolic: l.systolic,
        diastolic: l.diastolic,
        heartRate: l.heart_rate,
      })),
    [logs],
  );

  const lastHeight = [...logs].reverse().find((l) => l.height_cm != null)?.height_cm ?? null;
  const latestWeight = [...logs].reverse().find((l) => l.weight_kg != null);
  const latestBp = [...logs].reverse().find((l) => l.systolic != null && l.diastolic != null);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="neon-panel p-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              <Scale className="size-3" /> Weight / BMI
            </p>
            {latestWeight ? (
              <>
                <p className="font-display text-2xl font-bold text-cyan-200">
                  {Number(latestWeight.weight_kg)} kg
                  {latestWeight.bmi != null && <span className="ml-3 text-lg text-fuchsia-200">BMI {Number(latestWeight.bmi)}</span>}
                </p>
                {latestWeight.bmi != null && <p className="text-xs text-muted-foreground">{bmiLabel(Number(latestWeight.bmi))}</p>}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </div>
          <div className="neon-panel p-4">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              <HeartPulse className="size-3" /> Blood pressure
            </p>
            {latestBp ? (
              <>
                <p className="font-display text-2xl font-bold text-rose-200">
                  {latestBp.systolic}/{latestBp.diastolic}
                  {latestBp.heart_rate != null && <span className="ml-3 text-lg text-amber-200">{latestBp.heart_rate} bpm</span>}
                </p>
                <p className="text-xs text-muted-foreground">{bpLabel(latestBp.systolic!, latestBp.diastolic!)}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </div>
        </div>

        <div className="neon-panel p-4">
          <h3 className="mb-2 font-display text-sm font-bold tracking-wider text-cyan-300 uppercase">Weight & BMI</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="oklch(1 0 0 / 6%)" />
                <XAxis dataKey="date" tick={axisTick} />
                <YAxis yAxisId="w" tick={axisTick} domain={["auto", "auto"]} />
                <YAxis yAxisId="b" orientation="right" tick={axisTick} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight (kg)" stroke="var(--chart-1)" strokeWidth={2} connectNulls dot={false} />
                <Line yAxisId="b" type="monotone" dataKey="bmi" name="BMI" stroke="var(--chart-2)" strokeWidth={2} connectNulls dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neon-panel p-4">
          <h3 className="mb-2 font-display text-sm font-bold tracking-wider text-rose-300 uppercase">Blood pressure & heart rate</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="oklch(1 0 0 / 6%)" />
                <XAxis dataKey="date" tick={axisTick} />
                <YAxis tick={axisTick} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="systolic" name="Systolic" stroke="oklch(0.7 0.22 20)" strokeWidth={2} connectNulls dot={false} />
                <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="var(--chart-5)" strokeWidth={2} connectNulls dot={false} />
                <Line type="monotone" dataKey="heartRate" name="Heart rate" stroke="var(--chart-4)" strokeWidth={2} connectNulls dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="neon-panel p-4">
          <h3 className="mb-3 font-display text-sm font-bold tracking-wider text-lime-300 uppercase">
            {editing ? "Edit entry" : "Log vitals"}
          </h3>
          <HealthForm
            key={editing?.id ?? "new"}
            initial={editing}
            lastHeight={lastHeight}
            onSave={async (v) => {
              if (editing) {
                await onUpdate(editing.id, v);
                setEditing(null);
              } else {
                await onCreate(v);
              }
            }}
            onCancel={editing ? () => setEditing(null) : undefined}
          />
        </div>
        <div className="neon-panel max-h-96 overflow-y-auto p-4">
          <h3 className="mb-2 font-display text-sm font-bold tracking-wider text-muted-foreground uppercase">History</h3>
          {logs.length === 0 && <p className="text-xs text-muted-foreground">No entries.</p>}
          <ul className="space-y-1">
            {[...logs].reverse().map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded px-1.5 py-1 font-mono text-xs hover:bg-white/[0.03]">
                <span className="w-14 text-muted-foreground">{shortDate(l.logged_at)}</span>
                <span className="flex-1">
                  {l.weight_kg != null && `${Number(l.weight_kg)}kg `}
                  {l.systolic != null && `${l.systolic}/${l.diastolic} `}
                  {l.heart_rate != null && `${l.heart_rate}bpm`}
                </span>
                <Button variant="ghost" size="icon-xs" aria-label="Edit entry" onClick={() => setEditing(l)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Delete entry"
                  className="text-rose-400"
                  onClick={() => onDelete(l)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
