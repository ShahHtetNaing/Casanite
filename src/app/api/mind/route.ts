import { ownerRoute } from "@/lib/owner-route";
import { chatJson } from "@/lib/ai";
import { zonedParts } from "@/lib/date";
import type { DailyMind, DailyQuote, DailyWord } from "@/lib/types";

export const dynamic = "force-dynamic";

type Part = "quote" | "word" | "all";

const QUOTE_SHAPE = `"quote": { "quote": string, "author": string | null, "breakdown": string (exactly 2 sentences) }`;
const WORD_SHAPE = `"word": { "word": string, "part_of_speech": string, "definition": string, "synonyms": string[] (3-5), "examples": string[] (exactly 2) }`;

const SYSTEM =
  "You write a daily 'Mind & Words' card for a driven IT professional and PhD student who trains at the gym and values discipline. " +
  "Quote: a powerful, deep philosophical or practical self-help quote. Use a real quote only if you are certain of the exact wording and author; otherwise write an original one and set author to null. " +
  "The breakdown is exactly 2 sentences on how to apply it to high-performance work, studies or discipline. " +
  "Word: one advanced but genuinely useful English vocabulary word (C1/C2 level), with an accurate definition, 3-5 synonyms and 2 sophisticated example sentences that use the word.";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strList = (v: unknown, n: number) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 400)).filter(Boolean).slice(0, n);

function normQuote(raw: unknown): DailyQuote | null {
  const q = (raw ?? {}) as Record<string, unknown>;
  const quote = str(q.quote).replace(/^["“]|["”]$/g, "");
  if (!quote) return null;
  return { quote, author: str(q.author, 200) || null, breakdown: str(q.breakdown, 1000) };
}

function normWord(raw: unknown): DailyWord | null {
  const w = (raw ?? {}) as Record<string, unknown>;
  const word = str(w.word, 100);
  if (!word) return null;
  return {
    word,
    part_of_speech: str(w.part_of_speech, 50),
    definition: str(w.definition, 1000),
    synonyms: strList(w.synonyms, 6),
    examples: strList(w.examples, 2),
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { part?: Part; refresh?: boolean };
  const part: Part = body.part === "quote" || body.part === "word" ? body.part : "all";
  const refresh = body.refresh === true;

  return ownerRoute(async (supabase, userId) => {
    const day = zonedParts().isoDate;
    const { data: row, error } = await supabase
      .from("daily_mind")
      .select("day, quote, word")
      .eq("day", day)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const current = (row ?? { day, quote: null, word: null }) as DailyMind;

    const needQuote = part !== "word" && (refresh || !current.quote);
    const needWord = part !== "quote" && (refresh || !current.word);
    if (!needQuote && !needWord) return { mind: current };

    // Steer away from repeats.
    const [{ data: pastDays }, { data: savedWords }] = await Promise.all([
      supabase.from("daily_mind").select("quote, word").order("day", { ascending: false }).limit(30),
      supabase.from("saved_words").select("word").limit(200),
    ]);
    const usedWords = [
      ...(pastDays ?? []).map((d) => (d.word as DailyWord | null)?.word),
      ...(savedWords ?? []).map((w) => w.word as string),
    ].filter(Boolean);
    const usedQuotes = (pastDays ?? []).map((d) => (d.quote as DailyQuote | null)?.quote).filter(Boolean);

    const shape = `{ ${[needQuote && QUOTE_SHAPE, needWord && WORD_SHAPE].filter(Boolean).join(", ")} }`;
    const user = [
      `Today is ${day}. Generate: ${[needQuote && "a new quote", needWord && "a new vocabulary word"].filter(Boolean).join(" and ")}.`,
      needWord && usedWords.length ? `Do not use any of these words: ${usedWords.join(", ")}.` : "",
      needQuote && usedQuotes.length ? `Do not repeat any of these quotes:\n${usedQuotes.map((q) => `- ${q}`).join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const out = await chatJson<{ quote?: unknown; word?: unknown }>(SYSTEM, user, shape);
    const next: DailyMind = {
      day,
      quote: needQuote ? normQuote(out.quote) : current.quote,
      word: needWord ? normWord(out.word) : current.word,
    };
    if ((needQuote && !next.quote) || (needWord && !next.word)) throw new Error("AI returned an incomplete card. Try again.");

    const saved = await supabase
      .from("daily_mind")
      .upsert({ user_id: userId, day, quote: next.quote, word: next.word }, { onConflict: "user_id,day" })
      .select("day, quote, word")
      .single();
    if (saved.error) throw new Error(saved.error.message);
    return { mind: saved.data as DailyMind };
  });
}
