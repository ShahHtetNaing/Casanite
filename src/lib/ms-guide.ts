import catalog from "./ms-exercises.json";

const BASE = "https://www.muscleandstrength.com/exercises/";

const ALIASES: Record<string, string> = {
  db: "dumbbell", dbs: "dumbbell", dumbbells: "dumbbell", bb: "barbell", kb: "kettlebell",
  pushup: "push", pushups: "push", pullup: "pull", pullups: "pull", chinup: "chin",
  single: "one", raises: "raise", curls: "curl", rows: "row", presses: "press", squats: "squat",
  lunges: "lunge", flyes: "fly", flys: "fly", extensions: "extension", crunches: "crunch",
  twists: "twist", thrusts: "thrust", deadlifts: "deadlift", ups: "up", pushdown: "extension", pushdowns: "extension", plank: "plank",
};
const STOP = new Set(["aka", "the", "with", "on", "and", "of", "a", "to", "x"]);

function tokenize(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t && !STOP.has(t))
      .map((t) => ALIASES[t] ?? t),
  );
}

const ENTRIES = (catalog as [string, string][]).map(([name, slug]) => ({ name, slug, tokens: tokenize(name) }));

export const MS_EXERCISE_NAMES = ENTRIES.map((e) => e.name);

export const msUrl = (slug: string) => `${BASE}${slug}.html`;

export function isMsGuideUrl(url: unknown): url is string {
  return typeof url === "string" && /^https:\/\/www\.muscleandstrength\.com\/exercises\/[a-z0-9-]+\.html$/.test(url);
}

/** Muscle & Strength guide URL for an exercise name: exact catalog name first, then best token overlap. */
export function findMsGuide(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const lower = name.trim().toLowerCase();
  const exact = ENTRIES.find((e) => e.name.toLowerCase() === lower);
  if (exact) return msUrl(exact.slug);
  const q = tokenize(name);
  if (q.size === 0) return null;
  // Every query word must appear (one may be missing for long names); ties go to the closest-sized name.
  const need = q.size <= 3 ? q.size : q.size - 1;
  let best: { slug: string; score: number } | null = null;
  for (const e of ENTRIES) {
    let hit = 0;
    for (const t of q) if (e.tokens.has(t)) hit++;
    if (hit < need) continue;
    const score = hit / (q.size + e.tokens.size - hit);
    if (!best || score > best.score) best = { slug: e.slug, score };
  }
  return best && best.score >= 0.4 ? msUrl(best.slug) : null;
}
