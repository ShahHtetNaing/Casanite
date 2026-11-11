import { isExerciseSourceUrl, videoEmbedUrl } from "./exercise-video";
import type { ExerciseGuide } from "./types";

function plain(value: string, words: number, chars = 800) {
  return value.replace(/<[^>]*>/g, " ").replace(/&(?:amp|quot|apos|lt|gt|nbsp);|&#39;/g, (entity) =>
    ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " })[entity] ?? entity,
  ).replace(/\s+/g, " ").trim().split(" ").slice(0, words).join(" ").slice(0, chars);
}

function videoObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (!value || typeof value !== "object" || depth > 8) return [];
  if (Array.isArray(value)) {
    return value.slice(0, 50).flatMap((entry) => videoObjects(entry, depth + 1));
  }
  const node = value as Record<string, unknown>;
  if (node["@type"] === "VideoObject" || (Array.isArray(node["@type"]) && node["@type"].includes("VideoObject"))) return [node];
  return videoObjects(node["@graph"], depth + 1);
}

const nameKey = (value: string) => plain(value, 60).toLowerCase().replace(/^how to (?:do (?:an? )?)?/, "")
  .replace(/\b(?:video|exercise|guide|instructions|demonstration)\b/g, "").replace(/[^a-z0-9]/g, "");

export function parseExerciseSource(html: string, sourceUrl: string): ExerciseGuide | null {
  if (!isExerciseSourceUrl(sourceUrl) || html.length > 512_000) return null;
  const title = nameKey(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  if (!title) return null;
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: Record<string, unknown> | null;
    try { data = videoObjects(JSON.parse(script[1])).find((node) => typeof node.name === "string" && nameKey(node.name) === title && videoEmbedUrl(node.embedUrl)) ?? null; } catch { continue; }
    const video = videoEmbedUrl(data?.embedUrl);
    if (!data || !video) continue;
    const heading = [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)].find((match) => /\binstructions\b/i.test(plain(match[1], 30)));
    const after = heading ? html.slice((heading.index ?? 0) + heading[0].length, (heading.index ?? 0) + heading[0].length + 6_000).split(/<h[23]\b/i)[0] : "";
    const list = after.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/i)?.[1] ?? "";
    const cues = [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].slice(0, 3).map((match) => plain(match[1], 18, 300)).filter(Boolean);
    return {
      description: typeof data.description === "string" ? plain(data.description, 22) : "Watch the official demonstration and read the complete technique guide.",
      video_url: video,
      source_url: sourceUrl,
      cues,
      tip: "Short source excerpts; open the full guide for every instruction and modification. Stop if you feel pain.",
    };
  }
  return null;
}

export async function importExerciseSource(sourceUrl: string): Promise<{ guide: ExerciseGuide | null; reason?: string }> {
  if (!isExerciseSourceUrl(sourceUrl)) return { guide: null, reason: "Choose a valid Muscle & Strength exercise page." };
  try {
    const response = await fetch(sourceUrl, {
      redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store",
      headers: { Accept: "text/html", "User-Agent": "Casanite/1.0 (+https://casanite.vercel.app)" },
    });
    if (!response.ok) return { guide: null, reason: `The source declined import (HTTP ${response.status}). Choose a verified library exercise or add a video link manually.` };
    if (!response.headers.get("content-type")?.includes("text/html")) return { guide: null, reason: "The source did not return an exercise page." };
    const reader = response.body?.getReader();
    if (!reader) return { guide: null, reason: "The source returned an empty page." };
    const decoder = new TextDecoder();
    let html = "";
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 512_000) { await reader.cancel(); return { guide: null, reason: "The source page is too large to import safely." }; }
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
    const guide = parseExerciseSource(html, sourceUrl);
    return guide ? { guide } : { guide: null, reason: "No supported official video was found. Add a verified YouTube or Vimeo link manually." };
  } catch {
    return { guide: null, reason: "The source could not be reached. Choose a verified library exercise or add a video link manually." };
  }
}
