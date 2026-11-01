import { requireOwnerPage } from "@/lib/owner-page";
import { Recipes } from "@/components/recipes/recipes";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { supabase } = await requireOwnerPage();
  const { data } = await supabase.from("recipes").select("*").order("category").order("sort_order").order("name");
  return <Recipes initialRecipes={(data ?? []) as Recipe[]} />;
}
