"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Bot, Check, FileText, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createClient } from "@/lib/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AiSuggestion, EvoltScan, RoutineGroup } from "@/lib/types";

const KG_TO_LB = 2.20462;
const GOAL_LB: [number, number] = [145, 150];
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const BUCKET = "evolt-scans";
const GYM_RE = /gym|workout|strength|push|pull|leg|upper|lower|calisthenic|core/i;

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&>option]:bg-popover";

const lb = (kg: number | null) => (kg == null ? null : Math.round(kg * KG_TO_LB * 10) / 10);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Singapore" });

function sgDateTimeLocal(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export function BodyScan({
  userId,
  initialScans,
  initialSuggestions,
  groups,
}: {
  userId: string;
  initialScans: EvoltScan[];
  initialSuggestions: AiSuggestion[];
  groups: RoutineGroup[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [scans, setScans] = useState(initialScans);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [selectedId, setSelectedId] = useState<string | null>(initialScans[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<EvoltScan> | null>(null);

  const gymGroups = groups.filter((g) => g.kind === "exercise" || GYM_RE.test(g.title));
  const groupChoices = gymGroups.length ? gymGroups : groups;
  const sorted = [...scans].sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
  const latest = sorted[sorted.length - 1];
  const selected = scans.find((s) => s.id === selectedId) ?? null;

  function upsertScan(row: EvoltScan) {
    setScans((list) => {
      const exists = list.some((s) => s.id === row.id);
      const next = exists ? list.map((s) => (s.id === row.id ? row : s)) : [row, ...list];
      return next.sort((a, b) => b.scanned_at.localeCompare(a.scanned_at));
    });
  }

  async function uploadPdf(file: File, scan?: EvoltScan, scannedAt?: string) {
    if (file.type !== "application/pdf") return toast.error("Please choose a PDF file.");
    if (file.size > MAX_PDF_BYTES) return toast.error("PDF must be 10 MB or smaller.");
    setBusy(scan?.id ?? "upload");
    try {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
      const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
      if (up.error) throw new Error(up.error.message);
      if (scan?.pdf_path) await supabase.storage.from(BUCKET).remove([scan.pdf_path]);
      const res = scan
        ? await supabase.from("evolt_scans").update({ pdf_path: path }).eq("id", scan.id).select("*").single()
        : await supabase
            .from("evolt_scans")
            .insert({ scanned_at: scannedAt ?? new Date().toISOString(), pdf_path: path })
            .select("*")
            .single();
      if (res.error) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw new Error(res.error.message);
      }
      const row = res.data as EvoltScan;
      upsertScan(row);
      setSelectedId(row.id);
      toast.success("PDF stored securely. Running AI analysis…");
      await analyze(row.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function analyze(scanId: string) {
    setBusy(scanId);
    try {
      const res = await fetch("/api/evolt/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message ?? json.error ?? `Analysis failed (${res.status})`);
      upsertScan(json.scan as EvoltScan);
      setSuggestions((list) => [
        ...(json.suggestions as AiSuggestion[]),
        ...list.filter((s) => !(s.scan_id === scanId && s.status === "pending")),
      ]);
      setSelectedId(scanId);
      toast.success("AI analysis ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setBusy(null);
    }
  }

  async function viewPdf(scan: EvoltScan) {
    if (!scan.pdf_path) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(scan.pdf_path, 60);
    if (error || !data) return toast.error(error?.message ?? "Could not open PDF");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteScan(scan: EvoltScan) {
    if (!confirm(`Delete the scan from ${fmtDate(scan.scanned_at)}${scan.pdf_path ? " and its PDF" : ""}?`)) return;
    if (scan.pdf_path) {
      const rm = await supabase.storage.from(BUCKET).remove([scan.pdf_path]);
      if (rm.error) return toast.error(rm.error.message);
    }
    const { error } = await supabase.from("evolt_scans").delete().eq("id", scan.id);
    if (error) return toast.error(error.message);
    setScans((list) => list.filter((s) => s.id !== scan.id));
    setSuggestions((list) => list.filter((s) => s.scan_id !== scan.id));
    if (selectedId === scan.id) setSelectedId(null);
  }

  async function saveScan(v: Partial<EvoltScan>) {
    const payload = {
      scanned_at: v.scanned_at,
      weight_kg: v.weight_kg ?? null,
      body_fat_pct: v.body_fat_pct ?? null,
      skeletal_muscle_kg: v.skeletal_muscle_kg ?? null,
      lean_body_mass_kg: v.lean_body_mass_kg ?? null,
      body_fat_mass_kg: v.body_fat_mass_kg ?? null,
      notes: v.notes ?? null,
    };
    const res = v.id
      ? await supabase.from("evolt_scans").update(payload).eq("id", v.id).select("*").single()
      : await supabase.from("evolt_scans").insert(payload).select("*").single();
    if (res.error) return toast.error(res.error.message);
    upsertScan(res.data as EvoltScan);
    setSelectedId((res.data as EvoltScan).id);
    setEditing(null);
    toast.success("Scan saved");
  }

  async function approve(s: AiSuggestion, groupId: string) {
    setBusy(s.id);
    const { data, error } = await supabase.rpc("approve_suggestion", { p_suggestion: s.id, p_group: groupId });
    setBusy(null);
    if (error) return toast.error(error.message);
    setSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, status: "approved", approved_item_id: data as string } : x)));
    toast.success(`Added "${s.title}" to ${groups.find((g) => g.id === groupId)?.title ?? "your routine"}`);
  }

  async function dismiss(s: AiSuggestion) {
    const { error } = await supabase.from("ai_suggestions").update({ status: "dismissed" }).eq("id", s.id);
    if (error) return toast.error(error.message);
    setSuggestions((list) => list.map((x) => (x.id === s.id ? { ...x, status: "dismissed" } : x)));
  }

  const chartData = sorted.map((s) => ({
    date: fmtDate(s.scanned_at),
    weight: lb(s.weight_kg),
    muscle: lb(s.skeletal_muscle_kg),
    fat: s.body_fat_pct,
  }));
  const pending = suggestions.filter((s) => s.status === "pending");
  const approved = suggestions.filter((s) => s.status === "approved");

  return (
    <PageShell title="BODY SCAN" subtitle="Evolt 360 reports · private storage · AI analysis">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="WEIGHT" value={latest ? `${lb(latest.weight_kg)} lb` : "—"} sub={latest?.weight_kg ? `${latest.weight_kg} kg` : undefined} />
        <Metric label="GOAL" value={`${GOAL_LB[0]}–${GOAL_LB[1]} lb`} sub={latest?.weight_kg ? goalDelta(lb(latest.weight_kg)!) : undefined} />
        <Metric label="SKELETAL MUSCLE" value={latest?.skeletal_muscle_kg ? `${latest.skeletal_muscle_kg} kg` : "—"} />
        <Metric label="BODY FAT" value={latest?.body_fat_pct ? `${latest.body_fat_pct}%` : "—"} sub={latest?.bwi_score ? `BWI ${latest.bwi_score}` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-widest text-cyan-300">PROGRESS</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="lb" tick={{ fontSize: 11 }} domain={["dataMin - 10", "dataMax + 5"]} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} domain={[0, 30]} />
                  <ReferenceArea yAxisId="lb" y1={GOAL_LB[0]} y2={GOAL_LB[1]} fill="#22d3ee" fillOpacity={0.08} />
                  <Tooltip contentStyle={{ background: "#0b0f1a", border: "1px solid #334155" }} />
                  <Legend />
                  <Line yAxisId="lb" dataKey="weight" name="Weight (lb)" stroke="#22d3ee" strokeWidth={2} />
                  <Line yAxisId="lb" dataKey="muscle" name="Skeletal muscle (lb)" stroke="#e879f9" strokeWidth={2} />
                  <Line yAxisId="pct" dataKey="fat" name="Body fat %" stroke="#fbbf24" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground">No scans yet.</p>
            )}
          </CardContent>
        </Card>

        <UploadCard busy={busy === "upload"} onUpload={(f, at) => uploadPdf(f, undefined, at)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-mono text-sm tracking-widest text-cyan-300">SCAN HISTORY</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditing({ scanned_at: new Date().toISOString() })}>
            <Plus /> Manual entry
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2">
          {scans.map((s) => (
            <div
              key={s.id}
              className={`flex flex-wrap items-center gap-3 rounded-lg border p-2.5 ${
                s.id === selectedId ? "border-cyan-400/60 bg-cyan-400/5" : "border-border/60"
              }`}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(s.id)}>
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {fmtDate(s.scanned_at)}
                  {s.notes && <span className="text-xs text-muted-foreground">· {s.notes}</span>}
                  {s.analysis && <Badge variant="outline" className="font-mono text-[10px] text-fuchsia-300">ANALYZED</Badge>}
                  {!s.pdf_path && <Badge variant="outline" className="font-mono text-[10px] text-amber-300">NO PDF</Badge>}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {[
                    s.weight_kg && `${s.weight_kg} kg (${lb(s.weight_kg)} lb)`,
                    s.body_fat_pct && `BF ${s.body_fat_pct}%`,
                    s.skeletal_muscle_kg && `SMM ${s.skeletal_muscle_kg} kg`,
                    s.lean_body_mass_kg && `LBM ${s.lean_body_mass_kg} kg`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                {s.pdf_path ? (
                  <Button size="sm" variant="ghost" onClick={() => viewPdf(s)}>
                    <FileText /> PDF
                  </Button>
                ) : null}
                <label className={buttonVariants({ size: "sm", variant: "ghost", className: "cursor-pointer" })}>
                  <Upload /> {s.pdf_path ? "Replace" : "Attach PDF"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    disabled={!!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) uploadPdf(f, s);
                    }}
                  />
                </label>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => analyze(s.id)}>
                  <Sparkles /> {busy === s.id ? "Analyzing…" : s.analysis ? "Re-analyze" : "Analyze"}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Edit scan" onClick={() => setEditing(s)}>
                  <Pencil />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Delete scan" onClick={() => deleteScan(s)}>
                  <Trash2 className="text-rose-400" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="neon-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-mono text-sm tracking-widest text-fuchsia-300">
              <Bot className="size-4" /> AI ANALYSIS {selected && <span className="text-muted-foreground">· {fmtDate(selected.scanned_at)}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {!selected?.analysis ? (
              <p className="text-xs text-muted-foreground">
                Select a scan and click Analyze. The AI reads the PDF, summarises your body composition and suggests exercises for
                145–150 lb and calisthenics/flip strength.
              </p>
            ) : (
              <>
                <p>{selected.analysis.overview}</p>
                <AiList title="Strengths" items={selected.analysis.strengths} />
                <AiList title="Areas to improve" items={selected.analysis.improvements} />
                <div>
                  <div className="mb-1 font-mono text-[11px] tracking-widest text-cyan-300">GOAL PLAN</div>
                  <p className="text-xs text-muted-foreground">{selected.analysis.goal_plan}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm tracking-widest text-emerald-300">SUGGESTED EXERCISES</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {pending.length === 0 && (
              <p className="text-xs text-muted-foreground">No pending suggestions. Run an analysis to get some.</p>
            )}
            {pending.map((s) => (
              <SuggestionRow
                key={s.id}
                s={s}
                groups={groupChoices}
                busy={busy === s.id}
                onApprove={(g) => approve(s, g)}
                onDismiss={() => dismiss(s)}
              />
            ))}
            {approved.length > 0 && (
              <div className="mt-2 border-t border-border/60 pt-2">
                <div className="mb-1 font-mono text-[11px] tracking-widest text-muted-foreground">APPROVED · edit them in Edit Mode on the dashboard</div>
                <ul className="space-y-1 text-xs">
                  {approved.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <Check className="size-3 text-emerald-300" /> {s.title}
                      {!s.approved_item_id && <span className="text-muted-foreground">(removed from routine)</span>}
                    </li>
                  ))}
                </ul>
                <Link href="/" className={buttonVariants({ size: "sm", variant: "link", className: "px-0" })}>
                  Open routine dashboard →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && <ScanDialog initial={editing} onClose={() => setEditing(null)} onSave={saveScan} />}
    </PageShell>
  );
}

function goalDelta(currentLb: number) {
  if (currentLb > GOAL_LB[1]) return `${(currentLb - GOAL_LB[1]).toFixed(1)} lb above goal`;
  if (currentLb < GOAL_LB[0]) return `${(GOAL_LB[0] - currentLb).toFixed(1)} lb below goal`;
  return "In goal range";
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="neon-border">
      <CardContent className="py-3">
        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display text-xl font-bold text-cyan-200">{value}</div>
        {sub && <div className="font-mono text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function UploadCard({ busy, onUpload }: { busy: boolean; onUpload: (file: File, scannedAt: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [when, setWhen] = useState(() => sgDateTimeLocal(new Date().toISOString()));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-mono text-sm tracking-widest text-cyan-300">
          <Upload className="size-4" /> UPLOAD EVOLT PDF
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (file) onUpload(file, new Date(`${when}:00+08:00`).toISOString());
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="evolt-file">Report PDF (max 10 MB)</Label>
            <Input id="evolt-file" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="evolt-when">Scan date (AI will correct it from the PDF)</Label>
            <Input id="evolt-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <Button type="submit" disabled={!file || busy}>
            <Sparkles /> {busy ? "Uploading & analyzing…" : "Upload & analyze"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Files go to a private bucket only your account can read. Your 2 baseline scans are already logged below; use
            &quot;Attach PDF&quot; to store their reports too.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function SuggestionRow({
  s,
  groups,
  busy,
  onApprove,
  onDismiss,
}: {
  s: AiSuggestion;
  groups: RoutineGroup[];
  busy: boolean;
  onApprove: (groupId: string) => void;
  onDismiss: () => void;
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  return (
    <div className="grid gap-2 rounded-lg border border-border/60 p-2.5">
      <div>
        <div className="text-sm font-medium">
          {s.title} {s.details && <span className="font-mono text-xs text-cyan-300">· {s.details}</span>}
        </div>
        {s.rationale && <p className="text-xs text-muted-foreground">{s.rationale}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={`Routine group for ${s.title}`} className={`${selectClass} w-auto flex-1`} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={busy || !groupId} onClick={() => onApprove(groupId)}>
          <Check /> Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss} aria-label={`Dismiss ${s.title}`}>
          <X />
        </Button>
      </div>
    </div>
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

function ScanDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<EvoltScan>;
  onClose: () => void;
  onSave: (v: Partial<EvoltScan>) => void;
}) {
  const str = (n: number | null | undefined) => (n == null ? "" : String(n));
  const [v, setV] = useState({
    scanned_at: sgDateTimeLocal(initial.scanned_at ?? new Date().toISOString()),
    weight_kg: str(initial.weight_kg),
    body_fat_pct: str(initial.body_fat_pct),
    skeletal_muscle_kg: str(initial.skeletal_muscle_kg),
    lean_body_mass_kg: str(initial.lean_body_mass_kg),
    body_fat_mass_kg: str(initial.body_fat_mass_kg),
    notes: initial.notes ?? "",
  });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const fields: [keyof typeof v, string][] = [
    ["weight_kg", "Weight (kg)"],
    ["body_fat_pct", "Body fat %"],
    ["skeletal_muscle_kg", "Skeletal muscle (kg)"],
    ["lean_body_mass_kg", "Lean body mass (kg)"],
    ["body_fat_mass_kg", "Body fat mass (kg)"],
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit scan" : "Add scan manually"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              id: initial.id,
              scanned_at: new Date(`${v.scanned_at}:00+08:00`).toISOString(),
              weight_kg: num(v.weight_kg),
              body_fat_pct: num(v.body_fat_pct),
              skeletal_muscle_kg: num(v.skeletal_muscle_kg),
              lean_body_mass_kg: num(v.lean_body_mass_kg),
              body_fat_mass_kg: num(v.body_fat_mass_kg),
              notes: v.notes.trim() || null,
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="sc-when">Scan date</Label>
            <Input id="sc-when" type="datetime-local" required value={v.scanned_at} onChange={(e) => setV({ ...v, scanned_at: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(([k, label]) => (
              <div key={k} className="grid gap-1.5">
                <Label htmlFor={`sc-${k}`}>{label}</Label>
                <Input id={`sc-${k}`} type="number" step="0.1" min="0" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sc-notes">Notes</Label>
            <Textarea id="sc-notes" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
          </div>
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
