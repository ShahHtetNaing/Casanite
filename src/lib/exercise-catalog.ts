import originalCatalog from "./ms-exercises.json";
import videoData from "./exercise-videos.json";

export const EXERCISE_VIDEOS = videoData as Record<string, { source_url: string; video_url: string }>;
const verifiedNames: Record<string, string> = {
  "incline-push-ups": "Incline Push Ups",
  "dumbbell-lateral-raise": "Dumbbell Lateral Raise",
  "abdominal-air-bike": "Abdominal Air Bike",
};
export const MS_CATALOG: [string, string][] = [
  ...(originalCatalog as [string, string][]).filter(([, slug]) => !(slug in verifiedNames)),
  ...Object.entries(verifiedNames).map(([slug, name]): [string, string] => [name, slug]),
  ["Hollow Body Hold", "hollow-body-hold"],
  ["Cable Face Pull", "cable-face-pull"],
  ["Cable Face Pull with External Rotation", "cable-face-pull-with-external-rotation"],
  ["Seated Leg Curl", "seated-leg-curl"],
  ["Half Kneeling Quad Stretch", "half-kneeling-quad-stretch"],
];

const keyFor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const byName = new Map(MS_CATALOG.map(([name, slug]) => [keyFor(name), { name, slug }]));
const aliases: Record<string, string> = {
  "face pulls": "cable face pull",
  "seated leg curls": "seated leg curl",
  "hollow hold": "hollow body hold",
  "hollow body holds": "hollow body hold",
  "seated db shoulder press": "seated dumbbell press",
  "flat db bench press": "dumbbell bench press",
  "rope tricep pushdowns": "rope tricep extension",
  "single-arm db rows": "one arm dumbbell row",
  "incline db curls": "incline dumbbell curl",
  "db hammer curls": "standing hammer curl",
  "hanging knee raises": "hanging knee raise",
  "forearm plank": "plank",
  "russian twists": "russian twist",
  "bicycle crunches": "abdominal air bike",
  "dumbbell laterial raises": "dumbbell lateral raise",
  "abdominal air bike (aka bicycle)": "abdominal air bike",
  "inverted rows": "inverted row",
};
const aliasKeys = new Map(Object.entries(aliases).map(([alias, name]) => [keyFor(alias), keyFor(name)]));

export function catalogExercise(title: string) {
  const name = keyFor(title);
  return byName.get(aliasKeys.get(name) ?? name) ?? null;
}

export function exerciseSourceUrl(slug: string) {
  return EXERCISE_VIDEOS[slug]?.source_url ?? `https://www.muscleandstrength.com/exercises/${slug}.html`;
}
