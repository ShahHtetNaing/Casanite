import { catalogExercise, exerciseSourceUrl, MS_CATALOG } from "./exercise-catalog";
import { isExerciseSourceUrl } from "./exercise-video";

export const MS_EXERCISE_NAMES = MS_CATALOG.map(([name]) => name);
export const msUrl = exerciseSourceUrl;
export const isMsGuideUrl = isExerciseSourceUrl;

export function findMsGuide(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  const match = catalogExercise(name);
  return match ? exerciseSourceUrl(match.slug) : null;
}
