"use client";

import { useMemo, useRef, useState } from "react";
import { Pencil, Pill, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { medicineFields } from "@/lib/medication-log";
import { createClient } from "@/lib/supabase/client";
import type { MedicineLog } from "@/lib/types";
import { formatTime, nowTime, timeOf } from "./shared";

export function MedicinesCard({ day, today, initialLogs, loadError }: {
  day: string; today: string; initialLogs: MedicineLog[]; loadError: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState(initialLogs);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [time, setTime] = useState(day === today ? nowTime() : "12:00");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  function reset() {
    setEditing(null);
    setName("");
    setDose("");
    setTime(day === today ? nowTime() : "12:00");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const fields = medicineFields(name, dose, day, time);
    if (!fields) return toast.error("Enter the medicine, dose actually taken and a valid time.");
    saving.current = true;
    setBusy(true);
    try {
      const request = editing
        ? supabase.from("medicine_logs").update(fields).eq("id", editing)
        : supabase.from("medicine_logs").insert(fields);
      const { data, error } = await request.select("*").single();
      if (error) return toast.error(error.message);
      setLogs((prev) => editing ? prev.map((log) => log.id === editing ? data as MedicineLog : log) : [...prev, data as MedicineLog]);
      reset();
      toast.success(editing ? "Medicine record updated" : "Medicine taken recorded");
    } catch {
      toast.error("Could not save. Check your connection and try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function remove(log: MedicineLog) {
    if (saving.current || !confirm(`Delete this record of ${log.medicine_name} taken?`)) return;
    saving.current = true;
    setBusy(true);
    try {
      const { error } = await supabase.from("medicine_logs").delete().eq("id", log.id);
      if (error) return toast.error(error.message);
      setLogs((prev) => prev.filter((item) => item.id !== log.id));
      if (editing === log.id) reset();
    } catch {
      toast.error("Could not delete. Check your connection and try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return <Card>
    <CardHeader className="flex flex-row items-center gap-2">
      <Pill className="size-4 text-primary" /><CardTitle>Medicines taken</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-4">
      {loadError ? <p role="alert" className="text-sm text-destructive">Medicine history could not be loaded. If you just updated Casanite, run the latest database schema, then reload this page before logging.</p> : <>
        <p className="text-xs text-muted-foreground">Record each dose only after taking it. Insulin has its own log alongside this card; supplements are below.</p>
        {logs.length === 0 ? <p className="text-sm text-muted-foreground">No medicines recorded for this day.</p> : <ul className="grid gap-2">
          {[...logs].sort((a, b) => a.taken_at.localeCompare(b.taken_at)).map((log) => <li key={log.id} className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm">
            <div className="min-w-0 flex-1 break-words"><p className="font-medium">{log.medicine_name}</p><p className="text-muted-foreground">{log.dose_taken} · Taken {formatTime(log.taken_at)}</p></div>
            <Button variant="ghost" size="icon-xs" disabled={busy} aria-label={`Edit ${log.medicine_name} record`} onClick={() => {
              setEditing(log.id); setName(log.medicine_name); setDose(log.dose_taken); setTime(timeOf(log.taken_at));
            }}><Pencil /></Button>
            <Button variant="ghost" size="icon-xs" disabled={busy} aria-label={`Delete ${log.medicine_name} record`} onClick={() => remove(log)}><Trash2 /></Button>
          </li>)}
        </ul>}
        <form onSubmit={save}>
          <fieldset disabled={busy} className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{editing ? "Edit medicine record" : "Record medicine taken"}</legend>
            <label className="grid gap-1 text-xs">Medicine name<Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name as prescribed" /></label>
            <label className="grid gap-1 text-xs">Dose actually taken<Input required maxLength={120} value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Include the amount and unit" /></label>
            <label className="grid gap-1 text-xs">Time taken (Singapore)<Input required type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2"><Button type="submit" size="sm"><Plus />{busy ? "Saving…" : editing ? "Save medicine record" : "Record taken"}</Button>{editing && <Button type="button" variant="outline" size="sm" onClick={reset}>Cancel edit</Button>}</div>
          </fieldset>
        </form>
      </>}
      <p className="text-xs text-muted-foreground">A personal record, not a prescription or dosing recommendation. Follow your clinician&apos;s instructions.</p>
    </CardContent>
  </Card>;
}
