import { ownerRoute } from "@/lib/owner-route";
import { visionJson } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Groq rejects base64 images over 4 MB; the client downscales before upload.
const MAX_DATA_URL = 4_000_000;

const SHAPE = `{
  "description": string (short name of the meal, e.g. "Chicken rice with cucumber"),
  "items": [{ "name": string, "grams": number }],
  "calories_kcal": number, "protein_g": number, "carbs_g": number, "fiber_g": number,
  "veg_servings": number (1 serving ~ 80 g vegetables),
  "micronutrients": string[] (key vitamins/minerals present, e.g. "Vitamin C", "Iron"),
  "contains_milk": boolean (milk, milk tea, latte, yogurt drink, condensed milk etc.),
  "notes": string (one sentence: confidence or what was hard to see)
}`;

const SYSTEM =
  "You are a nutritionist estimating food from a photo for a person with diabetes cutting to 145-150 lb in Singapore. " +
  "Identify each visible food or drink, estimate its weight in grams, and estimate totals for the whole photo. " +
  "Recognise local hawker dishes, Myanmar and Indian food. Use realistic portion sizes and round sensibly. " +
  "If the photo shows no food, return empty items and zeros, and say so in notes.";

export type ScanResult = {
  description: string;
  items: { name: string; grams: number | null }[];
  calories_kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fiber_g: number | null;
  veg_servings: number | null;
  micronutrients: string[];
  contains_milk: boolean;
  notes: string;
};

function num(v: unknown, max: number): number | null {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n * 10) / 10, max) : null;
}
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const { image, hint } = (await req.json().catch(() => ({}))) as { image?: string; hint?: string };
  return ownerRoute(async () => {
    if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
      throw new Error("Send a JPEG, PNG or WebP photo.");
    }
    if (image.length > MAX_DATA_URL) throw new Error("Photo is too large. Try a smaller one.");
    const prompt = `Estimate the nutrition of this meal.${hint?.trim() ? ` The user says: "${str(hint, 200)}".` : ""}`;
    const out = await visionJson<Partial<Record<keyof ScanResult, unknown>>>(SYSTEM, prompt, image, SHAPE);
    const items = (Array.isArray(out.items) ? out.items : [])
      .slice(0, 20)
      .map((i) => ({ name: str((i as { name?: unknown })?.name, 80), grams: num((i as { grams?: unknown })?.grams, 5000) }))
      .filter((i) => i.name);
    const result: ScanResult = {
      description: str(out.description, 200) || items.map((i) => i.name).join(", ").slice(0, 200),
      items,
      calories_kcal: num(out.calories_kcal, 10000),
      protein_g: num(out.protein_g, 1000),
      carbs_g: num(out.carbs_g, 1000),
      fiber_g: num(out.fiber_g, 1000),
      veg_servings: num(out.veg_servings, 50),
      micronutrients: (Array.isArray(out.micronutrients) ? out.micronutrients : []).map((m) => str(m, 40)).filter(Boolean).slice(0, 12),
      contains_milk: out.contains_milk === true,
      notes: str(out.notes, 300),
    };
    return result;
  });
}
