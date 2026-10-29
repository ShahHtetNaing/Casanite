"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ChecklistList } from "@/lib/types";

const COPY: Record<
  ChecklistList,
  { title: string; subtitle: string; placeholder: string; notePlaceholder: string; noun: string; doneLabel: string }
> = {
  tasks: {
    title: "Daily Tasks",
    subtitle: "To-dos · finished tasks drop to the bottom",
    placeholder: "Add a task…",
    notePlaceholder: "Note (optional)",
    noun: "task",
    doneLabel: "done",
  },
  shopping: {
    title: "Things to Buy",
    subtitle: "Shopping & groceries · bought items drop to the bottom",
    placeholder: "Add an item…",
    notePlaceholder: "Qty / note (optional)",
    noun: "item",
    doneLabel: "bought",
  },
};

// Open items in the order they were added; finished items below, most recently finished last.
function sortItems(items: ChecklistItem[]) {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done) return (a.done_at ?? "").localeCompare(b.done_at ?? "");
    return a.created_at.localeCompare(b.created_at);
  });
}

export function ChecklistPage({ list, initialItems }: { list: ChecklistList; initialItems: ChecklistItem[] }) {
  const copy = COPY[list];
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initialItems);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(() => sortItems(items), [items]);
  const doneCount = items.filter((i) => i.done).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({ list, title: title.trim(), note: note.trim() || null })
      .select("*")
      .single();
    setAdding(false);
    if (error) return toast.error(error.message);
    setItems((prev) => [...prev, data as ChecklistItem]);
    setTitle("");
    setNote("");
  }

  async function update(item: ChecklistItem, patch: Partial<ChecklistItem>) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error } = await supabase.from("checklist_items").update(patch).eq("id", item.id);
    if (error) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      toast.error(error.message);
    }
  }

  async function remove(item: ChecklistItem) {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    const { error } = await supabase.from("checklist_items").delete().eq("id", item.id);
    if (error) {
      setItems((prev) => [...prev, item]);
      toast.error(error.message);
    }
  }

  async function clearDone() {
    const done = items.filter((i) => i.done);
    if (!done.length || !confirm(`Delete ${done.length} ${copy.doneLabel} ${copy.noun}(s)?`)) return;
    setItems((prev) => prev.filter((i) => !i.done));
    const { error } = await supabase.from("checklist_items").delete().in("id", done.map((i) => i.id));
    if (error) {
      setItems((prev) => [...prev, ...done]);
      toast.error(error.message);
    }
  }

  return (
    <PageShell title={copy.title} subtitle={copy.subtitle}>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle className="flex-1">
            {doneCount}/{items.length} {copy.doneLabel}
          </CardTitle>
          {doneCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearDone}>
              <Trash2 /> Clear {copy.doneLabel}
            </Button>
          )}
          <Progress value={items.length ? (doneCount / items.length) * 100 : 0} className="basis-full" />
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={copy.placeholder}
              aria-label={`New ${copy.noun}`}
              className="min-w-48 flex-[2]"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={copy.notePlaceholder}
              aria-label="Note"
              className="min-w-32 flex-1"
            />
            <Button type="submit" disabled={adding || !title.trim()}>
              <Plus /> Add
            </Button>
          </form>

          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nothing here yet. Add your first {copy.noun} above.</p>
          ) : (
            <ul className="grid gap-1.5">
              {sorted.map((item) => (
                <Row key={item.id} item={item} copy={copy} onUpdate={update} onRemove={remove} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Row({
  item,
  copy,
  onUpdate,
  onRemove,
}: {
  item: ChecklistItem;
  copy: (typeof COPY)[ChecklistList];
  onUpdate: (item: ChecklistItem, patch: Partial<ChecklistItem>) => void;
  onRemove: (item: ChecklistItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? "");

  function commit() {
    const t = title.trim();
    if (!t) return setTitle(item.title);
    const n = note.trim() || null;
    if (t !== item.title || n !== item.note) onUpdate(item, { title: t, note: n });
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") {
      setTitle(item.title);
      setNote(item.note ?? "");
      e.currentTarget.blur();
    }
  };

  const inputCls =
    "h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent";

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-colors",
        item.done ? "bg-muted/40" : "bg-card",
      )}
    >
      <Checkbox
        checked={item.done}
        onCheckedChange={(checked) =>
          onUpdate(item, { done: !!checked, done_at: checked ? new Date().toISOString() : null })
        }
        aria-label={`Mark "${item.title}" ${item.done ? "not " : ""}${copy.doneLabel}`}
      />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        data-bare
        aria-label={`${copy.noun} text`}
        className={cn(inputCls, "min-w-0 flex-[2]", item.done && "text-muted-foreground line-through")}
      />
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={commit}
        onKeyDown={onKey}
        data-bare
        placeholder={copy.notePlaceholder}
        aria-label="Note"
        className={cn(inputCls, "min-w-0 flex-1 text-xs text-muted-foreground", item.done && "line-through")}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${copy.noun}`}
        className="text-rose-500"
        onClick={() => onRemove(item)}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
