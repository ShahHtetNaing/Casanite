import { ownerRoute } from "@/lib/owner-route";
import { STARTER_PLAN } from "@/lib/workout-plan";

export async function POST() {
  return ownerRoute(async (supabase) => {
    const { error } = await supabase.rpc("install_workout_plan", { p_plan: STARTER_PLAN });
    if (error) throw new Error(error.message);
    return { installed: true };
  });
}
