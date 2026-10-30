"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Pencil, Pill, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Supplement, SupplementLog } from "@/lib/types";

type Props = { day: string; initialSupplements: Supplement[]; initialLogs: SupplementLog[] };

export function SupplementsCard({ day, initialSupplements, initialLogs }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [supplements, setSupplements] = useState(initialSupplements);
  const [taken, setTaken] = useState(() => new Set(initialLogs.map((l) => l.supplement_id)));
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const pending = useRef(new Map<string, Promise<unknown>>());

  function setTakenFor(id: string, on: boolean) {
    setTaken((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function toggle(s: Supplement, on: boolean) {
    setTakenFor(s.id, on);
    // Serialize per supplement so quick double-taps settle in click order.
    const request = (pending.current.get(s.id) ?? Promise.resolve()).then(() =>
      on
        ? supabase.from("supplement_logs").upsert({ supplement_id: s.id, day }, { onConflict: "user_id,supplement_id,day", ignoreDuplicates: true })
        : supabase.from("supplement_logs").delete().eq("supplement_id", s.id).eq("day", day),
    );
    pending.current.set(s.id, request.catch(() => undefined));
    const { error } = await request;
    if (error) {
      setTakenFor(s.id, !on);
      toast.error(error.message);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const sort = Math.max(0, ...supplements.map((s) => s.sort_order)) + 1;
    const { data, error } = await supabase
      .from("supplements")
      .insert({ name: name.trim(), dose: dose.trim() || null, sort_order: sort })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setSupplements((prev) => [...prev, data as Supplement]);
    setName("");
    setDose("");
  }

  async function save(s: Supplement, patch: { name: string; dose: string }) {
    if (!patch.name.trim()) return toast.error("Name can't be empty"), false;
    const { data, error } = await supabase
      .from("supplements")
      .update({ name: patch.name.trim(), dose: patch.dose.trim() || null })
      .eq("id", s.id)
      .select("*")
      .single();
    if (error) return toast.error(error.message), false;
    setSupplements((prev) => prev.map((x) => (x.id === s.id ? (data as Supplement) : x)));
    return true;
  }

  async function remove(s: Supplement) {
    if (!confirm(`Delete ${s.name} and its history?`)) return;
    const { error } = await supabase.from("supplements").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    setSupplements((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Pill className="size-4 text-primary" />
        <CardTitle className="flex-1">
          Supplements{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {supplements.filter((s) => taken.has(s.id)).length}/{supplements.length}
          </span>
        </CardTitle>
        <Button variant={editMode ? "default" : "ghost"} size="sm" onClick={() => setEditMode((v) => !v)}>
          {editMode ? <Check /> : <Pencil />} {editMode ? "Done" : "Edit"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {supplements.length === 0 && <p className="text-sm text-muted-foreground">No supplements yet.</p>}
        {supplements.map((s) =>
          editMode ? (
            <EditRow key={s.id} supplement={s} onSave={(p) => save(s, p)} onDelete={() => remove(s)} />
          ) : (
            <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-accent/50">
              <Checkbox checked={taken.has(s.id)} onCheckedChange={(v) => toggle(s, v === true)} aria-label={`Took ${s.name}`} />
              <span className={cn("flex-1 text-sm", taken.has(s.id) && "text-muted-foreground line-through")}>
                {s.name}
                {s.dose && <span className="text-muted-foreground"> · {s.dose}</span>}
              </span>
            </label>
          ),
        )}
        {editMode && (
          <form onSubmit={add} className="flex gap-2 pt-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New supplement" aria-label="New supplement" />
            <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose (optional)" aria-label="Dose" className="w-32" />
            <Button type="submit" size="icon" aria-label="Add supplement" disabled={!name.trim()}>
              <Plus />
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function EditRow({
  supplement,
  onSave,
  onDelete,
}: {
  supplement: Supplement;
  onSave: (p: { name: string; dose: string }) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(supplement.name);
  const [dose, setDose] = useState(supplement.dose ?? "");
  const dirty = name !== supplement.name || dose !== (supplement.dose ?? "");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({ name, dose });
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Supplement name" />
      <Input value={dose} onChange={(e) => setDose(e.target.value)} placeholder="Dose" aria-label="Supplement dose" className="w-32" />
      {dirty ? (
        <>
          <Button type="submit" size="icon" aria-label="Save supplement">
            <Check />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Undo changes"
            onClick={() => {
              setName(supplement.name);
              setDose(supplement.dose ?? "");
            }}
          >
            <X />
          </Button>
        </>
      ) : (
        <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${supplement.name}`} onClick={onDelete}>
          <Trash2 />
        </Button>
      )}
    </form>
  );
}
