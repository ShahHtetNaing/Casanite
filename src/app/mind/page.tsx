import { requireOwnerPage } from "@/lib/owner-page";
import { MindWords } from "@/components/mind/mind-words";
import { zonedParts } from "@/lib/date";
import type { DailyMind, SavedQuote, SavedWord } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MindPage() {
  const { supabase } = await requireOwnerPage();
  const day = zonedParts().isoDate;
  const [{ data: mind }, { data: quotes }, { data: words }] = await Promise.all([
    supabase.from("daily_mind").select("day, quote, word").eq("day", day).maybeSingle(),
    supabase.from("saved_quotes").select("*").order("created_at", { ascending: false }),
    supabase.from("saved_words").select("*").order("created_at", { ascending: false }),
  ]);
  return (
    <MindWords
      initialMind={(mind as DailyMind | null) ?? null}
      initialQuotes={(quotes ?? []) as SavedQuote[]}
      initialWords={(words ?? []) as SavedWord[]}
    />
  );
}
