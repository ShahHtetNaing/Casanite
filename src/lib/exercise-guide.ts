import { catalogExercise, EXERCISE_VIDEOS } from "./exercise-catalog";
import { isExerciseSourceUrl, videoEmbedUrl } from "./exercise-video";
import type { ExerciseGuide } from "./types";

export function refreshBuiltInGuide(title: string, guide: ExerciseGuide | null, guideUrl: string | null): ExerciseGuide | null {
  if (!guide) return guide;
  const match = catalogExercise(title);
  const record = match && EXERCISE_VIDEOS[match.slug];
  if (!record?.replaces_video_url || videoEmbedUrl(guide.video_url) !== videoEmbedUrl(record.replaces_video_url)) return guide;
  const sources = [guideUrl, guide.source_url].filter((value): value is string => value != null);
  if (!sources.length || sources.some((source) => !isExerciseSourceUrl(source) ||
    source.split("/").pop()!.replace(/\.html$/, "") !== match!.slug)) return guide;
  return { ...guide, video_url: record.video_url };
}

export function exerciseVideoPublisher(title: string, video: string | null | undefined): string | null {
  const match = catalogExercise(title);
  const record = match && EXERCISE_VIDEOS[match.slug];
  return record?.publisher && videoEmbedUrl(video) === videoEmbedUrl(record.video_url) ? record.publisher : null;
}
