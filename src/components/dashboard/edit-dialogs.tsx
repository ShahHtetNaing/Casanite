"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT } from "@/lib/date";
import {
  FREQUENCIES,
  GROUP_COLORS,
  ITEM_KINDS,
  type Frequency,
  type ItemKind,
  type RoutineGroup,
  type RoutineItem,
} from "@/lib/types";
import { colorStyle } from "./colors";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {WEEKDAY_SHORT.map((label, d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-xs transition-colors",
              on
                ? "border-cyan-400/70 bg-cyan-400/15 text-cyan-200"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const emptyToNull = (s: string) => (s.trim() === "" ? null : s.trim());

// ---------------------------------------------------------------------
// Group dialog
// ---------------------------------------------------------------------
export type GroupFormValues = Pick<
  RoutineGroup,
  "title" | "description" | "kind" | "frequency" | "days_of_week" | "color" | "is_active"
>;

export function GroupDialog({
  open,
  onOpenChange,
  group,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: RoutineGroup | null;
  onSave: (values: GroupFormValues) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <GroupForm key={group?.id ?? "new"} group={group} onSave={onSave} />}
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({ group, onSave }: { group: RoutineGroup | null; onSave: (v: GroupFormValues) => Promise<void> }) {
  const [title, setTitle] = useState(group?.title ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [kind, setKind] = useState<ItemKind>(group?.kind ?? "habit");
  const [frequency, setFrequency] = useState<Frequency>(group?.frequency ?? "daily");
  const [days, setDays] = useState<number[]>(group?.days_of_week ?? []);
  const [color, setColor] = useState(group?.color ?? "cyan");
  const [active, setActive] = useState(group?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: emptyToNull(description),
        kind,
        frequency,
        days_of_week: days.length === 0 || days.length === 7 ? null : days,
        color,
        is_active: active,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="font-display tracking-wider">{group ? "Edit group" : "New group"}</DialogTitle>
        <DialogDescription>A routine block, e.g. a gym day, habit list or goal set.</DialogDescription>
      </DialogHeader>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
            {ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Repeats">
          <select
            className={selectClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Days" hint="None selected = every day.">
        <DaysPicker value={days} onChange={setDays} />
      </Field>
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn(
                "size-6 rounded-full border-2",
                colorStyle(c).dot,
                color === c ? "border-white" : "border-transparent opacity-60",
              )}
            />
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={active} onCheckedChange={setActive} /> Active
      </label>
      <DialogFooter>
        <Button type="submit" disabled={saving} className="neon-button">
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------------------------------------------------------------------
// Item dialog
// ---------------------------------------------------------------------
export type ItemFormValues = Pick<
  RoutineItem,
  | "group_id"
  | "title"
  | "details"
  | "youtube_url"
  | "notes"
  | "frequency"
  | "days_of_week"
  | "target_count"
  | "target_date"
  | "is_trackable"
  | "is_active"
>;

const YOUTUBE_RE = /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i;

export function ItemDialog({
  open,
  onOpenChange,
  item,
  groups,
  defaultGroupId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: RoutineItem | null;
  groups: RoutineGroup[];
  defaultGroupId: string | null;
  onSave: (values: ItemFormValues) => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && (
          <ItemForm
            key={item?.id ?? `new-${defaultGroupId}`}
            item={item}
            groups={groups}
            defaultGroupId={defaultGroupId}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  item,
  groups,
  defaultGroupId,
  onSave,
}: {
  item: RoutineItem | null;
  groups: RoutineGroup[];
  defaultGroupId: string | null;
  onSave: (v: ItemFormValues) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(item?.group_id ?? defaultGroupId ?? groups[0]?.id ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [details, setDetails] = useState(item?.details ?? "");
  const [youtube, setYoutube] = useState(item?.youtube_url ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [frequency, setFrequency] = useState<Frequency | "">(item?.frequency ?? "");
  const [customDays, setCustomDays] = useState(item?.days_of_week != null);
  const [days, setDays] = useState<number[]>(item?.days_of_week ?? []);
  const [target, setTarget] = useState(String(item?.target_count ?? 1));
  const [targetDate, setTargetDate] = useState(item?.target_date ?? "");
  const [trackable, setTrackable] = useState(item?.is_trackable ?? true);
  const [active, setActive] = useState(item?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  const group = groups.find((g) => g.id === groupId);
  const youtubeInvalid = youtube.trim() !== "" && !YOUTUBE_RE.test(youtube.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !groupId || youtubeInvalid) return;
    setSaving(true);
    try {
      await onSave({
        group_id: groupId,
        title: title.trim(),
        details: emptyToNull(details),
        youtube_url: emptyToNull(youtube),
        notes: emptyToNull(notes),
        frequency: frequency === "" ? null : frequency,
        days_of_week: customDays ? days : null,
        target_count: Math.min(100, Math.max(1, Number.parseInt(target, 10) || 1)),
        target_date: targetDate || null,
        is_trackable: trackable,
        is_active: active,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle className="font-display tracking-wider">{item ? "Edit item" : "New item"}</DialogTitle>
        <DialogDescription>Exercise, habit, reminder or goal.</DialogDescription>
      </DialogHeader>
      <Field label="Group">
        <select className={selectClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </Field>
      <Field label="Sets / reps / details" hint='e.g. "3x8-10", "2x45s/side", "20-30m"'>
        <Input value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      <Field label="YouTube tutorial URL">
        <Input
          type="url"
          value={youtube}
          onChange={(e) => setYoutube(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-invalid={youtubeInvalid}
        />
        {youtubeInvalid && <p className="text-[11px] text-rose-400">Must be a youtube.com or youtu.be link.</p>}
      </Field>
      <Field label="Notes">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Repeats">
          <select
            className={selectClass}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency | "")}
          >
            <option value="">inherit ({group?.frequency ?? "group"})</option>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Times per period">
          <Input type="number" min={1} max={100} value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
      </div>
      <Field label="Days">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={customDays} onCheckedChange={setCustomDays} size="sm" />
          {customDays ? "Custom days (none = every day)" : "Same days as group"}
        </label>
        {customDays && <DaysPicker value={days} onChange={setDays} />}
      </Field>
      <Field label="Target date (goals)">
        <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={trackable} onCheckedChange={setTrackable} /> Earns EXP (checkable)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} onCheckedChange={setActive} /> Active
        </label>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={saving || youtubeInvalid} className="neon-button">
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
