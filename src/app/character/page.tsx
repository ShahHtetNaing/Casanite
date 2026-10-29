import { requireOwnerPage } from "@/lib/owner-page";
import { CharacterSheet } from "@/components/character/character-sheet";
import type { CareerEntry, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CharacterPage() {
  const { supabase } = await requireOwnerPage();
  const [{ data: profile }, { data: entries }] = await Promise.all([
    supabase.from("profile").select("*").maybeSingle(),
    supabase.from("career_entries").select("*").order("sort_order").order("created_at"),
  ]);
  return <CharacterSheet initialProfile={profile as Profile | null} initialEntries={(entries ?? []) as CareerEntry[]} />;
}
