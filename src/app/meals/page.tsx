import { requireOwnerPage } from "@/lib/owner-page";
import { Meals } from "@/components/meals/meals";
import { zonedParts } from "@/lib/date";
import type { InsulinLog, MealLog, NutritionSettings, Supplement, SupplementLog } from "@/lib/types";

export const dynamic = "force-dynamic";

const DEFAULT_SETTINGS: NutritionSettings = {
  lantus_units: 24,
  prandial_units: 10,
  goal_lbs_min: 145,
  goal_lbs_max: 150,
  protein_g_target: 120,
  carbs_g_target: 150,
  veg_target: 5,
};

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { supabase } = await requireOwnerPage();
  const today = zonedParts().isoDate;
  const requested = (await searchParams).day;
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;

  const [meals, recent, insulin, supplements, supplementLogs, settings, weight] = await Promise.all([
    supabase.from("meal_logs").select("*").eq("day", day).order("created_at"),
    supabase
      .from("meal_logs")
      .select("description, meal, protein_g, carbs_g, veg_servings, with_milk")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("insulin_logs").select("*").eq("day", day).order("taken_at"),
    supabase.from("supplements").select("*").order("sort_order").order("created_at"),
    supabase.from("supplement_logs").select("id, supplement_id, day").eq("day", day),
    supabase.from("nutrition_settings").select("*").maybeSingle(),
    supabase
      .from("health_logs")
      .select("weight_kg, logged_at")
      .not("weight_kg", "is", null)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <Meals
      key={day}
      day={day}
      today={today}
      initialMeals={(meals.data ?? []) as MealLog[]}
      recentMeals={(recent.data ?? []) as Omit<MealLog, "id" | "day" | "created_at">[]}
      initialInsulin={(insulin.data ?? []) as InsulinLog[]}
      initialSupplements={(supplements.data ?? []) as Supplement[]}
      initialSupplementLogs={(supplementLogs.data ?? []) as SupplementLog[]}
      initialSettings={{ ...DEFAULT_SETTINGS, ...((settings.data ?? {}) as Partial<NutritionSettings>) }}
      latestWeightKg={weight.data?.weight_kg != null ? Number(weight.data.weight_kg) : null}
    />
  );
}
