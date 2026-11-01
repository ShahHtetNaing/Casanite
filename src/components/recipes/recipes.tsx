"use client";

import { useMemo, useState } from "react";
import { Check, ChefHat, ChevronDown, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Recipe } from "@/lib/types";

type RecipeFields = Pick<Recipe, "category" | "name" | "ingredients" | "instructions" | "notes">;

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export function Recipes({ initialRecipes }: { initialRecipes: Recipe[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [recipes, setRecipes] = useState(initialRecipes);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const categories = useMemo(() => [...new Set(recipes.map((r) => r.category))].sort(), [recipes]);
  const q = query.trim().toLowerCase();
  const visible = recipes.filter(
    (r) =>
      (!category || r.category === category) &&
      (!q || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.toLowerCase().includes(q))),
  );
  const groups = [...new Set(visible.map((r) => r.category))].sort().map((c) => ({
    category: c,
    items: visible.filter((r) => r.category === c).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  }));

  async function add(v: RecipeFields) {
    const sort = Math.max(0, ...recipes.filter((r) => r.category === v.category).map((r) => r.sort_order)) + 1;
    const { data, error } = await supabase.from("recipes").insert({ ...v, sort_order: sort }).select("*").single();
    if (error) return toast.error(error.message), false;
    setRecipes((prev) => [...prev, data as Recipe]);
    setAdding(false);
    setOpen((data as Recipe).id);
    toast.success("Recipe added");
    return true;
  }

  async function update(id: string, v: RecipeFields) {
    const { data, error } = await supabase.from("recipes").update(v).eq("id", id).select("*").single();
    if (error) return toast.error(error.message), false;
    setRecipes((prev) => prev.map((r) => (r.id === id ? (data as Recipe) : r)));
    setEditing(null);
    return true;
  }

  async function remove(r: Recipe) {
    if (!confirm(`Delete "${r.name}"?`)) return;
    const { error } = await supabase.from("recipes").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    setRecipes((prev) => prev.filter((x) => x.id !== r.id));
  }

  return (
    <PageShell title="Recipes" subtitle="Your personal cookbook">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or ingredients" aria-label="Search recipes" className="pl-8" />
        </div>
        <Button onClick={() => (setAdding(true), setEditing(null))} disabled={adding}>
          <Plus /> Add recipe
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[null, ...categories].map((c) => (
          <button
            key={c ?? "all"}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === c ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {c ?? `All (${recipes.length})`}
          </button>
        ))}
      </div>

      {adding && (
        <Card>
          <CardHeader>
            <CardTitle>New recipe</CardTitle>
          </CardHeader>
          <CardContent>
            <RecipeForm initial={null} defaultCategory={category ?? ""} categories={categories} onSubmit={add} onCancel={() => setAdding(false)} />
          </CardContent>
        </Card>
      )}

      {groups.length === 0 && !adding && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {recipes.length ? "No recipes match." : "No recipes yet. Add your first one."}
          </CardContent>
        </Card>
      )}

      {groups.map(({ category: c, items }) => (
        <section key={c} className="grid gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ChefHat className="size-4" /> {c} <span className="font-normal">· {items.length}</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((r) =>
              editing === r.id ? (
                <Card key={r.id} className="md:col-span-2">
                  <CardContent className="pt-6">
                    <RecipeForm initial={r} categories={categories} onSubmit={(v) => update(r.id, v)} onCancel={() => setEditing(null)} />
                  </CardContent>
                </Card>
              ) : (
                <Card key={r.id} className={cn(open === r.id && "md:col-span-2")}>
                  <CardHeader className="flex flex-row items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      aria-expanded={open === r.id}
                    >
                      <ChevronDown className={cn("size-4 shrink-0 transition-transform", open !== r.id && "-rotate-90")} />
                      <CardTitle className="truncate">{r.name}</CardTitle>
                    </button>
                    <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => (setEditing(r.id), setAdding(false))}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-xs" aria-label={`Delete ${r.name}`} onClick={() => remove(r)}>
                      <Trash2 />
                    </Button>
                  </CardHeader>
                  {open === r.id ? (
                    <CardContent className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
                      <div>
                        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ingredients</h3>
                        <ul className="grid list-disc gap-1 pl-5 text-sm">
                          {r.ingredients.map((i, n) => (
                            <li key={n}>{i}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Steps</h3>
                        <ol className="grid list-decimal gap-1 pl-5 text-sm">
                          {r.instructions.map((s, n) => (
                            <li key={n}>{s}</li>
                          ))}
                        </ol>
                        {r.notes && <p className="mt-3 text-xs text-muted-foreground">{r.notes}</p>}
                      </div>
                    </CardContent>
                  ) : (
                    <CardContent>
                      <p className="line-clamp-2 text-xs text-muted-foreground">{r.ingredients.join(" · ")}</p>
                    </CardContent>
                  )}
                </Card>
              ),
            )}
          </div>
        </section>
      ))}
    </PageShell>
  );
}

function RecipeForm({
  initial,
  defaultCategory = "",
  categories,
  onSubmit,
  onCancel,
}: {
  initial: Recipe | null;
  defaultCategory?: string;
  categories: string[];
  onSubmit: (v: RecipeFields) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState(initial?.category ?? defaultCategory);
  const [name, setName] = useState(initial?.name ?? "");
  const [ingredients, setIngredients] = useState(initial?.ingredients.join("\n") ?? "");
  const [steps, setSteps] = useState(initial?.instructions.join("\n") ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!category.trim() || !name.trim()) return toast.error("Category and name are required");
    const ing = lines(ingredients);
    const ins = lines(steps);
    if (ing.length > 60 || ins.length > 60) return toast.error("Keep it to 60 lines or fewer");
    setSaving(true);
    await onSubmit({ category: category.trim(), name: name.trim(), ingredients: ing, instructions: ins, notes: notes.trim() || null });
    setSaving(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <Input value={category} onChange={(e) => setCategory(e.target.value)} list="recipe-categories" placeholder="Category" aria-label="Category" maxLength={60} />
        <datalist id="recipe-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" aria-label="Recipe name" maxLength={120} autoFocus />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Ingredients (one per line)
          <Textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={8} aria-label="Ingredients" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          Steps (one per line)
          <Textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={8} aria-label="Steps" />
        </label>
      </div>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (optional)" aria-label="Notes" maxLength={2000} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X /> Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {initial ? <Check /> : <Plus />} {initial ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  );
}
