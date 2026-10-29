import { ownerRoute } from "@/lib/owner-route";
import { extractText, getDocumentProxy } from "unpdf";
import { chatJson } from "@/lib/ai";
import type { EvoltAnalysis, EvoltScan } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHAPE = `{
  "extracted": {  // values read from the scan report; null when absent
    "scanned_at": ISO 8601 date-time string | null,
    "weight_kg": number | null, "body_fat_pct": number | null, "body_fat_mass_kg": number | null,
    "skeletal_muscle_kg": number | null, "lean_body_mass_kg": number | null, "visceral_fat_level": number | null,
    "bmr_kcal": number | null, "bio_age": number | null, "bwi_score": number | null,
    "other_metrics": [{ "name": string, "value": string }]
  },
  "analysis": {
    "overview": string, "strengths": string[], "improvements": string[], "goal_plan": string,
    "exercises": [{ "title": string, "details": string (sets x reps or duration, e.g. "4x6-8"), "rationale": string,
                   "youtube_url": string | null, "suggested_day": integer 0-6 (0=Sun) | null }]
  }
}`;

type Result = {
  extracted: Partial<Record<keyof EvoltScan, number | string | null>> & { other_metrics?: { name: string; value: string }[] };
  analysis: EvoltAnalysis;
};

const SYSTEM =
  "You are a strength & conditioning coach and body-composition analyst. The user's goals: reach 145-150 lb " +
  "(65.8-68.0 kg) while building calisthenics and flip (backflip/front flip) strength. Give practical, safe advice. " +
  "Suggest 4-6 specific exercises that are NOT already in their routine. Only include a youtube_url if you are certain it exists; otherwise null.";

export async function POST(req: Request) {
  const { scanId } = (await req.json().catch(() => ({}))) as { scanId?: string };
  return ownerRoute(async (supabase) => {
    if (!scanId) throw new Error("scanId is required");
    const { data: scan, error } = await supabase.from("evolt_scans").select("*").eq("id", scanId).single();
    if (error || !scan) throw new Error(error?.message ?? "scan not found");
    const s = scan as EvoltScan;

    const [{ data: history }, { data: items }] = await Promise.all([
      supabase
        .from("evolt_scans")
        .select("scanned_at, weight_kg, body_fat_pct, skeletal_muscle_kg, lean_body_mass_kg")
        .order("scanned_at"),
      supabase.from("routines_and_goals").select("title, details").eq("is_active", true),
    ]);

    let reportText = "";
    if (s.pdf_path) {
      const file = await supabase.storage.from("evolt-scans").download(s.pdf_path);
      if (file.error) throw new Error(`Could not read PDF: ${file.error.message}`);
      const pdf = await getDocumentProxy(new Uint8Array(await file.data.arrayBuffer()));
      reportText = (await extractText(pdf, { mergePages: true })).text.replace(/\s+/g, " ").slice(0, 20000);
    }
    const prompt =
      `${reportText ? `Text extracted from my Evolt 360 body scan PDF:\n"""${reportText}"""\nExtract its values, then analyse it.` : "Analyse this Evolt 360 scan (no PDF; values below)."}\n` +
      `Stored values: ${JSON.stringify({ ...s, analysis: undefined, pdf_path: undefined })}\n` +
      `Scan history: ${JSON.stringify(history ?? [])}\n` +
      `Current routine (do not repeat these): ${(items ?? []).map((i) => i.title).join("; ")}`;

    const result = await chatJson<Result>(SYSTEM, prompt, SHAPE);
    const x = result.extracted ?? {};
    const pick = (k: keyof EvoltScan) => (reportText && x[k] != null ? x[k] : s[k]);
    const metrics = { ...s.metrics };
    for (const m of Array.isArray(x.other_metrics) ? x.other_metrics : []) metrics[m.name] = m.value;

    const scannedAt = reportText && typeof x.scanned_at === "string" && !Number.isNaN(Date.parse(x.scanned_at)) ? x.scanned_at : s.scanned_at;
    const { data: updated, error: upErr } = await supabase
      .from("evolt_scans")
      .update({
        scanned_at: scannedAt,
        weight_kg: pick("weight_kg"),
        body_fat_pct: pick("body_fat_pct"),
        body_fat_mass_kg: pick("body_fat_mass_kg"),
        skeletal_muscle_kg: pick("skeletal_muscle_kg"),
        lean_body_mass_kg: pick("lean_body_mass_kg"),
        visceral_fat_level: pick("visceral_fat_level"),
        bmr_kcal: pick("bmr_kcal"),
        bio_age: pick("bio_age"),
        bwi_score: pick("bwi_score"),
        metrics,
        analysis: result.analysis,
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", s.id)
      .select("*")
      .single();
    if (upErr) throw new Error(upErr.message);

    await supabase.from("ai_suggestions").delete().eq("scan_id", s.id).eq("status", "pending");
    const rows = (Array.isArray(result.analysis?.exercises) ? result.analysis.exercises : []).slice(0, 8).map((e) => ({
      scan_id: s.id,
      title: e.title,
      details: e.details,
      rationale: e.rationale,
      youtube_url: e.youtube_url && /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i.test(e.youtube_url) ? e.youtube_url : null,
      suggested_day: typeof e.suggested_day === "number" && e.suggested_day >= 0 && e.suggested_day <= 6 ? e.suggested_day : null,
    }));
    const { data: suggestions, error: sErr } = rows.length
      ? await supabase.from("ai_suggestions").insert(rows).select("*")
      : { data: [], error: null };
    if (sErr) throw new Error(sErr.message);
    return { scan: updated, suggestions };
  });
}
