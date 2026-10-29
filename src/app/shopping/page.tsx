import { requireOwnerPage } from "@/lib/owner-page";
import { ChecklistPage } from "@/components/checklist/checklist-page";
import type { ChecklistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const { supabase } = await requireOwnerPage();
  const { data } = await supabase.from("checklist_items").select("*").eq("list", "shopping").order("created_at");
  return <ChecklistPage list="shopping" initialItems={(data ?? []) as ChecklistItem[]} />;
}
