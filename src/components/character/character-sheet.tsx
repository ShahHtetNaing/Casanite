"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Award, Bot, BriefcaseBusiness, CheckCircle2, ExternalLink, FolderGit2, GraduationCap, HandHeart, Pencil, Plus,
  Send, Settings2, ShieldCheck, Sparkles, Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CareerCategory, CareerEntry, Profile } from "@/lib/types";

const CATEGORIES: { key: CareerCategory; label: string; stat: string; icon: typeof GraduationCap; color: string }[] = [
  { key: "education", label: "Education", stat: "INT", icon: GraduationCap, color: "text-cyan-300" },
  { key: "experience", label: "Work Experience", stat: "XP", icon: BriefcaseBusiness, color: "text-fuchsia-300" },
  { key: "certificate", label: "Certificates", stat: "CERT", icon: ShieldCheck, color: "text-emerald-300" },
  { key: "project", label: "Projects", stat: "BUILD", icon: FolderGit2, color: "text-amber-300" },
  { key: "volunteer", label: "Volunteer Work", stat: "CHA", icon: HandHeart, color: "text-rose-300" },
  { key: "award", label: "Honors & Awards", stat: "HONOR", icon: Award, color: "text-yellow-300" },
];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover";

function ageFrom(birth: string | null) {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

function fmtMonth(d: string | null) {
  if (!d) return null;
  const [y, m] = d.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

const nul = (s: string) => (s.trim() === "" ? null : s.trim());

type Analysis = {
  rarity_score: number;
  rarity_label: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  next_certifications: { name: string; why: string }[];
  project_ideas: { title: string; why: string }[];
};

async function callApi<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message ?? json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export function CharacterSheet({ initialProfile, initialEntries }: { initialProfile: Profile | null; initialEntries: CareerEntry[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [entries, setEntries] = useState(initialEntries);
  const [editMode, setEditMode] = useState(false);
  const [entryDialog, setEntryDialog] = useState<{ entry: Partial<CareerEntry> } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const age = ageFrom(profile?.birth_date ?? null);
  const completed = entries.filter((e) => e.status === "completed").length;

  async function saveEntry(values: Partial<CareerEntry>) {
    const { id, ...rest } = values;
    const payload = {
      category: rest.category,
      title: rest.title,
      organization: rest.organization ?? null,
      location: rest.location ?? null,
      start_date: rest.start_date || null,
      end_date: rest.end_date || null,
      status: rest.status ?? "completed",
      description: rest.description ?? null,
      url: rest.url ?? null,
      sort_order: rest.sort_order ?? entries.filter((e) => e.category === rest.category).length,
    };
    const res = id
      ? await supabase.from("career_entries").update(payload).eq("id", id).select("*").single()
      : await supabase.from("career_entries").insert(payload).select("*").single();
    if (res.error) return toast.error(res.error.message);
    const row = res.data as CareerEntry;
    setEntries((list) => (id ? list.map((e) => (e.id === id ? row : e)) : [...list, row]));
    setEntryDialog(null);
    toast.success(id ? "Entry updated" : "Entry added");
  }

  async function removeEntry(e: CareerEntry) {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { error } = await supabase.from("career_entries").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    setEntries((list) => list.filter((x) => x.id !== e.id));
  }

  async function markComplete(e: CareerEntry) {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("career_entries")
      .update({ status: "completed", end_date: e.end_date ?? today })
      .eq("id", e.id)
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setEntries((list) => list.map((x) => (x.id === e.id ? (data as CareerEntry) : x)));
    toast.success(`Achievement unlocked: ${e.title}`);
  }

  async function saveProfile(p: Omit<Profile, "user_id">) {
    const { data, error } = await supabase.from("profile").upsert(p).select("*").single();
    if (error) return toast.error(error.message);
    setProfile(data as Profile);
    setProfileOpen(false);
    toast.success("Profile saved");
  }

  return (
    <PageShell title="CHARACTER SHEET" subtitle="Career profile · mirrored from your personal website">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs ${
            editMode ? "border-fuchsia-400/70 bg-fuchsia-400/10 text-fuchsia-200" : "border-border text-muted-foreground"
          }`}
        >
          <Settings2 className="size-3.5" /> EDIT MODE
          <Switch checked={editMode} onCheckedChange={setEditMode} aria-label="Toggle edit mode" />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="neon-border">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="font-display text-xl tracking-wider">{profile?.full_name || "Unnamed hero"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{profile?.headline}</p>
            </div>
            {editMode && (
              <Button size="sm" variant="outline" onClick={() => setProfileOpen(true)}>
                <Pencil /> Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-3 gap-2 font-mono text-xs">
              <Stat label="AGE" value={age ?? "?"} />
              <Stat label="BASE" value={profile?.location ?? "?"} />
              <Stat label="UNLOCKED" value={completed} />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {CATEGORIES.map((c) => (
                <div key={c.key} className="rounded-lg border border-border/60 p-2 text-center">
                  <c.icon className={`mx-auto size-4 ${c.color}`} />
                  <div className="font-mono text-lg font-bold">{entries.filter((e) => e.category === c.key).length}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{c.stat}</div>
                </div>
              ))}
            </div>
            {profile?.skills?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <Badge key={s} variant="outline" className="font-mono text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : null}
            {profile?.website_url && (
              <a href={profile.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-cyan-300 hover:underline">
                <ExternalLink className="size-3" /> Personal website
              </a>
            )}
          </CardContent>
        </Card>

        <CareerConsultant />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CATEGORIES.map((c) => {
          const list = entries.filter((e) => e.category === c.key).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <Card key={c.key}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className={`flex items-center gap-2 font-mono text-sm tracking-widest ${c.color}`}>
                  <c.icon className="size-4" /> {c.label.toUpperCase()} <span className="text-muted-foreground">({list.length})</span>
                </CardTitle>
                {editMode && (
                  <Button size="sm" variant="outline" onClick={() => setEntryDialog({ entry: { category: c.key, status: "completed" } })}>
                    <Plus /> Add
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid gap-2">
                {list.length === 0 && <p className="text-xs text-muted-foreground">Nothing here yet.</p>}
                {list.map((e) => (
                  <div key={e.id} className="rounded-lg border border-border/60 p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                          {e.url ? (
                            <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">
                              {e.title}
                            </a>
                          ) : (
                            e.title
                          )}
                          {e.status !== "completed" && (
                            <Badge variant="outline" className="border-amber-400/60 font-mono text-[10px] text-amber-300">
                              {e.status === "in_progress" ? "IN PROGRESS" : "PLANNED"}
                            </Badge>
                          )}
                          {e.source_item_id && (
                            <Badge variant="outline" className="font-mono text-[10px] text-cyan-300">
                              QUEST
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[e.organization, e.location].filter(Boolean).join(" · ")}
                          {(e.start_date || e.end_date) && (
                            <span className="font-mono">
                              {" "}
                              · {[fmtMonth(e.start_date), e.end_date ? fmtMonth(e.end_date) : e.start_date ? "Present" : null]
                                .filter(Boolean)
                                .join(" – ")}
                            </span>
                          )}
                        </div>
                        {e.description && <p className="mt-1 text-xs text-muted-foreground/90">{e.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {e.status !== "completed" && (
                          <Button size="icon-sm" variant="ghost" aria-label={`Mark ${e.title} complete`} onClick={() => markComplete(e)}>
                            <CheckCircle2 className="text-emerald-300" />
                          </Button>
                        )}
                        {editMode && (
                          <>
                            <Button size="icon-sm" variant="ghost" aria-label={`Edit ${e.title}`} onClick={() => setEntryDialog({ entry: e })}>
                              <Pencil />
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Delete ${e.title}`} onClick={() => removeEntry(e)}>
                              <Trash2 className="text-rose-400" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {entryDialog && <EntryDialog initial={entryDialog.entry} onClose={() => setEntryDialog(null)} onSave={saveEntry} />}
      {profileOpen && <ProfileDialog initial={profile} onClose={() => setProfileOpen(false)} onSave={saveProfile} />}
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-bold text-cyan-200">{value}</div>
    </div>
  );
}

function F({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function EntryDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<CareerEntry>;
  onClose: () => void;
  onSave: (v: Partial<CareerEntry>) => void;
}) {
  const [v, setV] = useState({
    category: initial.category ?? "project",
    title: initial.title ?? "",
    organization: initial.organization ?? "",
    location: initial.location ?? "",
    start_date: initial.start_date ?? "",
    end_date: initial.end_date ?? "",
    status: initial.status ?? "completed",
    description: initial.description ?? "",
    url: initial.url ?? "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const urlOk = !v.url || /^https?:\/\//i.test(v.url);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit entry" : "Add entry"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!v.title.trim() || !urlOk) return;
            onSave({
              id: initial.id,
              sort_order: initial.sort_order,
              category: v.category as CareerCategory,
              title: v.title.trim(),
              organization: nul(v.organization),
              location: nul(v.location),
              start_date: nul(v.start_date),
              end_date: nul(v.end_date),
              status: v.status as CareerEntry["status"],
              description: nul(v.description),
              url: nul(v.url),
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <F id="ce-cat" label="Category">
              <select id="ce-cat" className={selectClass} value={v.category} onChange={set("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </F>
            <F id="ce-status" label="Status">
              <select id="ce-status" className={selectClass} value={v.status} onChange={set("status")}>
                <option value="completed">Completed</option>
                <option value="in_progress">In progress</option>
                <option value="planned">Planned</option>
              </select>
            </F>
          </div>
          <F id="ce-title" label="Title">
            <Input id="ce-title" required value={v.title} onChange={set("title")} />
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F id="ce-org" label="Organization">
              <Input id="ce-org" value={v.organization} onChange={set("organization")} />
            </F>
            <F id="ce-loc" label="Location">
              <Input id="ce-loc" value={v.location} onChange={set("location")} />
            </F>
            <F id="ce-start" label="Start date">
              <Input id="ce-start" type="date" value={v.start_date} onChange={set("start_date")} />
            </F>
            <F id="ce-end" label="End / completion date">
              <Input id="ce-end" type="date" value={v.end_date} onChange={set("end_date")} />
            </F>
          </div>
          <F id="ce-url" label="Link (optional)">
            <Input id="ce-url" type="url" value={v.url} onChange={set("url")} aria-invalid={!urlOk} placeholder="https://…" />
          </F>
          <F id="ce-desc" label="Description">
            <Textarea id="ce-desc" rows={3} value={v.description} onChange={set("description")} />
          </F>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!v.title.trim() || !urlOk}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Profile | null;
  onClose: () => void;
  onSave: (p: Omit<Profile, "user_id">) => void;
}) {
  const [v, setV] = useState({
    full_name: initial?.full_name ?? "",
    birth_date: initial?.birth_date ?? "",
    headline: initial?.headline ?? "",
    location: initial?.location ?? "",
    hometown: initial?.hometown ?? "",
    website_url: initial?.website_url ?? "",
    skills: (initial?.skills ?? []).join(", "),
    goals_text: initial?.goals_text ?? "",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              full_name: v.full_name.trim(),
              birth_date: nul(v.birth_date),
              headline: nul(v.headline),
              location: nul(v.location),
              hometown: nul(v.hometown),
              website_url: nul(v.website_url),
              skills: v.skills.split(",").map((s) => s.trim()).filter(Boolean),
              goals_text: nul(v.goals_text),
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <F id="pf-name" label="Name">
              <Input id="pf-name" value={v.full_name} onChange={set("full_name")} />
            </F>
            <F id="pf-birth" label="Birth date (for age)">
              <Input id="pf-birth" type="date" value={v.birth_date} onChange={set("birth_date")} />
            </F>
            <F id="pf-loc" label="Location">
              <Input id="pf-loc" value={v.location} onChange={set("location")} />
            </F>
            <F id="pf-home" label="Hometown">
              <Input id="pf-home" value={v.hometown} onChange={set("hometown")} />
            </F>
          </div>
          <F id="pf-head" label="Headline">
            <Input id="pf-head" value={v.headline} onChange={set("headline")} />
          </F>
          <F id="pf-web" label="Website">
            <Input id="pf-web" type="url" value={v.website_url} onChange={set("website_url")} />
          </F>
          <F id="pf-skills" label="Skills (comma separated)">
            <Textarea id="pf-skills" rows={3} value={v.skills} onChange={set("skills")} />
          </F>
          <F id="pf-goals" label="Goals">
            <Textarea id="pf-goals" rows={2} value={v.goals_text} onChange={set("goals_text")} />
          </F>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CareerConsultant() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "model"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function analyze() {
    setLoading(true);
    try {
      const { analysis } = await callApi<{ analysis: Analysis }>("/api/ai/career", { mode: "analyze" });
      setAnalysis(analysis);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const { reply } = await callApi<{ reply: string }>("/api/ai/career", { mode: "chat", messages: next });
      setMessages((m) => [...m, { role: "model", text: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed");
      setMessages(messages);
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="neon-border">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 font-mono text-sm tracking-widest text-fuchsia-300">
          <Bot className="size-4" /> AI CAREER CONSULTANT
        </CardTitle>
        <Button size="sm" onClick={analyze} disabled={loading}>
          <Sparkles /> {loading ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze profile"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!analysis && !loading && (
          <p className="text-xs text-muted-foreground">
            Gemini rates how rare your skill combination is for your age, then suggests improvements, next certifications and projects.
          </p>
        )}
        {analysis && (
          <div className="grid gap-3 text-sm">
            <div>
              <div className="mb-1 flex items-center justify-between font-mono text-xs">
                <span>RARITY: {analysis.rarity_label.toUpperCase()}</span>
                <span>{analysis.rarity_score}/100</span>
              </div>
              <Progress value={Math.max(0, Math.min(100, analysis.rarity_score))} />
            </div>
            <p className="text-muted-foreground">{analysis.summary}</p>
            <AiList title="Strengths" items={analysis.strengths} />
            <AiList title="Improve" items={analysis.improvements} />
            <AiList title="Next certifications" items={analysis.next_certifications.map((c) => `${c.name} — ${c.why}`)} />
            <AiList title="Project ideas" items={analysis.project_ideas.map((p) => `${p.title} — ${p.why}`)} />
          </div>
        )}
        <div className="grid gap-2 border-t border-border/60 pt-3">
          <div className="max-h-72 space-y-2 overflow-y-auto" aria-live="polite">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "ml-8 bg-cyan-400/10 text-cyan-100" : "mr-8 bg-fuchsia-400/10"
                }`}
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="mr-8 rounded-lg bg-fuchsia-400/10 px-3 py-2 text-sm text-muted-foreground">Thinking…</div>}
          </div>
          <form onSubmit={send} className="flex gap-2">
            <Input
              aria-label="Ask the career consultant"
              placeholder="e.g. How do I get into a SOC analyst role in Singapore?"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
            />
            <Button type="submit" size="icon" aria-label="Send" disabled={sending || !input.trim()}>
              <Send />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}

function AiList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] tracking-widest text-cyan-300">{title.toUpperCase()}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
