import { requireOwnerPage } from "@/lib/owner-page";
import { ChecklistPage } from "@/components/checklist/checklist-page";
import type { ChecklistItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const { supabase } = await requireOwnerPage();
  const { data } = await supabase.from("checklist_items").select("*").eq("list", "tasks").order("created_at");
  return <ChecklistPage list="tasks" initialItems={(data ?? []) as ChecklistItem[]} />;
}
