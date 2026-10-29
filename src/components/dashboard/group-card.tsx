"use client";

import { ArrowDown, ArrowUp, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { effectiveDays, effectiveFrequency, formatDays } from "@/lib/date";
import type { RoutineGroup, RoutineItem } from "@/lib/types";
import { colorStyle } from "./colors";
import { TutorialButton } from "./tutorial-button";

export interface RoutineHandlers {
  complete: (item: RoutineItem) => void;
  uncomplete: (item: RoutineItem) => void;
  addItem: (groupId: string) => void;
  editItem: (item: RoutineItem) => void;
  deleteItem: (item: RoutineItem) => void;
  moveItem: (item: RoutineItem, dir: -1 | 1) => void;
  editGroup: (group: RoutineGroup) => void;
  deleteGroup: (group: RoutineGroup) => void;
  moveGroup: (group: RoutineGroup, dir: -1 | 1) => void;
}

const SHOW_TUTORIAL_KINDS = new Set(["exercise", "recovery"]);

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={danger ? "text-rose-400 hover:bg-rose-500/15 hover:text-rose-300" : undefined}
    >
      {children}
    </Button>
  );
}

export function ItemRow({
  item,
  group,
  count,
  editMode,
  busy,
  handlers,
  showSchedule,
}: {
  item: RoutineItem;
  group: RoutineGroup;
  count: number;
  editMode: boolean;
  busy: boolean;
  handlers: RoutineHandlers;
  showSchedule?: boolean;
}) {
  const done = count >= item.target_count;
  const multi = item.target_count > 1;
  const freq = effectiveFrequency(item, group);
  const days = effectiveDays(item, group);

  return (
    <li
      className={cn(
        "group/item flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-white/[0.03]",
        !item.is_active && "opacity-40",
      )}
    >
      {item.is_trackable && !multi && (
        <Checkbox
          checked={done}
          disabled={busy || !item.is_active}
          onCheckedChange={(checked) => (checked ? handlers.complete(item) : handlers.uncomplete(item))}
          aria-label={`Complete ${item.title}`}
        />
      )}
      {item.is_trackable && multi && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="Undo one"
            disabled={busy || count === 0}
            onClick={() => handlers.uncomplete(item)}
          >
            <Minus />
          </Button>
          <span className={cn("w-9 text-center font-mono text-xs", done && "text-lime-300")}>
            {count}/{item.target_count}
          </span>
          <Button
            variant="outline"
            size="icon-xs"
            aria-label="Log one"
            disabled={busy || done || !item.is_active}
            onClick={() => handlers.complete(item)}
          >
            <Plus />
          </Button>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done && "text-muted-foreground line-through decoration-cyan-400/60")}>
          {item.title}
          {item.details && (
            <span className="ml-2 font-mono text-xs text-cyan-300/80">{item.details}</span>
          )}
        </p>
        {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
        {showSchedule && (item.frequency || item.days_of_week || item.target_date) && (
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {freq} · {formatDays(days)}
            {item.target_date && ` · due ${item.target_date}`}
          </p>
        )}
      </div>

      {(SHOW_TUTORIAL_KINDS.has(group.kind) || item.youtube_url) && (
        <TutorialButton url={item.youtube_url} title={item.title} />
      )}

      {editMode && (
        <div className="flex items-center">
          <IconButton label="Move up" onClick={() => handlers.moveItem(item, -1)}>
            <ArrowUp />
          </IconButton>
          <IconButton label="Move down" onClick={() => handlers.moveItem(item, 1)}>
            <ArrowDown />
          </IconButton>
          <IconButton label="Edit" onClick={() => handlers.editItem(item)}>
            <Pencil />
          </IconButton>
          <IconButton label="Delete" danger onClick={() => handlers.deleteItem(item)}>
            <Trash2 />
          </IconButton>
        </div>
      )}
    </li>
  );
}

export function GroupCard({
  group,
  items,
  counts,
  editMode,
  busyId,
  handlers,
  showSchedule,
  emptyText = "No items.",
}: {
  group: RoutineGroup;
  items: RoutineItem[];
  counts: Map<string, number>;
  editMode: boolean;
  busyId: string | null;
  handlers: RoutineHandlers;
  showSchedule?: boolean;
  emptyText?: string;
}) {
  const c = colorStyle(group.color);
  const trackable = items.filter((i) => i.is_trackable && i.is_active);
  const done = trackable.filter((i) => (counts.get(i.id) ?? 0) >= i.target_count).length;

  return (
    <section className={cn("neon-panel scanlines p-4", !group.is_active && "opacity-50")}>
      <header className="mb-2 flex items-start gap-2">
        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full shadow-[0_0_8px_currentColor]", c.dot)} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-display text-sm font-bold tracking-wider uppercase", c.text)}>
            {group.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            {group.description ? `${group.description} · ` : ""}
            {group.frequency} · {formatDays(group.days_of_week)}
          </p>
        </div>
        {trackable.length > 0 && (
          <Badge variant="outline" className={cn("font-mono", c.border, c.text)}>
            {done}/{trackable.length}
          </Badge>
        )}
        {editMode && (
          <div className="flex items-center">
            <IconButton label="Move group up" onClick={() => handlers.moveGroup(group, -1)}>
              <ArrowUp />
            </IconButton>
            <IconButton label="Move group down" onClick={() => handlers.moveGroup(group, 1)}>
              <ArrowDown />
            </IconButton>
            <IconButton label="Edit group" onClick={() => handlers.editGroup(group)}>
              <Pencil />
            </IconButton>
            <IconButton label="Delete group" danger onClick={() => handlers.deleteGroup(group)}>
              <Trash2 />
            </IconButton>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <p className="px-2 py-1 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              group={group}
              count={counts.get(item.id) ?? 0}
              editMode={editMode}
              busy={busyId === item.id}
              handlers={handlers}
              showSchedule={showSchedule}
            />
          ))}
        </ul>
      )}

      {editMode && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 w-full border-dashed"
          onClick={() => handlers.addItem(group.id)}
        >
          <Plus /> Add item
        </Button>
      )}
    </section>
  );
}
