import { ownerRoute } from "@/lib/owner-route";
import { workoutGuideFor } from "@/lib/workout-plan";
import { importExerciseSource } from "@/lib/exercise-import";
import { isExerciseSourceUrl, videoEmbedUrl } from "@/lib/exercise-video";

export async function POST(request: Request) {
  return ownerRoute(async (supabase) => {
    const body = await request.json();
    if (typeof body.title !== "string" || !body.title.trim() || body.title.length > 150) throw new Error("Enter an exercise name of 1–150 characters.");
    let title = body.title.trim();
    let source = typeof body.guideUrl === "string" ? body.guideUrl : null;
    let itemId: string | null = null;
    if (body.itemId != null) {
      if (typeof body.itemId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.itemId)) throw new Error("Invalid exercise reference.");
      const { data, error } = await supabase.from("routines_and_goals").select("id,title,guide_url").eq("id", body.itemId).single();
      if (error || !data) throw new Error("Exercise not found.");
      itemId = data.id;
      title = data.title;
      source = data.guide_url;
    }
    const known = workoutGuideFor(title);
    source = known.guide_url ?? source;
    const hasVideo = !!videoEmbedUrl(known.guide?.video_url);
    if (!hasVideo && !isExerciseSourceUrl(source)) return { guide: null, reason: "No exact source match. Choose a verified library exercise or add your own video and steps." };
    if (hasVideo) source = known.guide_url;
    const result = hasVideo ? { guide: known.guide } : await importExerciseSource(source!);
    if (result.guide && itemId) {
      const { error } = await supabase.from("routines_and_goals").update({ guide_url: source, guide: result.guide }).eq("id", itemId).eq("title", title);
      if (error) throw new Error(error.message);
    }
    return { ...result, guide_url: source };
  });
}
