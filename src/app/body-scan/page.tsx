import { requireOwnerPage } from "@/lib/owner-page";
import { BodyScan } from "@/components/body-scan/body-scan";
import type { AiSuggestion, EvoltScan, RoutineGroup } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BodyScanPage() {
  const { supabase, user } = await requireOwnerPage();
  const [{ data: scans }, { data: suggestions }, { data: groups }] = await Promise.all([
    supabase.from("evolt_scans").select("*").order("scanned_at", { ascending: false }),
    supabase.from("ai_suggestions").select("*").order("created_at", { ascending: false }),
    supabase.from("routine_groups").select("*").order("sort_order"),
  ]);
  return (
    <BodyScan
      userId={user.id}
      initialScans={(scans ?? []) as EvoltScan[]}
      initialSuggestions={(suggestions ?? []) as AiSuggestion[]}
      groups={(groups ?? []) as RoutineGroup[]}
    />
  );
}
