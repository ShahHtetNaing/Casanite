import { catalogExercise, exerciseSourceUrl, EXERCISE_VIDEOS, MS_CATALOG } from "./exercise-catalog";
import type { ExerciseGuide, WorkoutSet } from "./types";
import { ACTIVITY_GUIDES, activityGuideFor } from "./activity-guides";

type GuideInfo = { target: string; secondary: string[]; equipment: string; cues: string[]; tip?: string };
const GUIDES: Record<string, GuideInfo> = {
  "incline-push-ups": { target: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Bodyweight, sturdy bench", cues: ["Hands on a stable bench, keep your body straight.", "Lower your chest toward the bench with elbows angled back.", "Press away without letting your hips sag."], tip: "Choose a higher surface to make it easier." },
  "seated-dumbbell-press": { target: "Shoulders", secondary: ["Triceps"], equipment: "Dumbbells, bench", cues: ["Sit against an upright backrest with the weights near your shoulders.", "Press in a comfortable arc overhead without jutting your head forward.", "Lower slowly, keeping your back supported."], tip: "Use a light pair and stop at any painful overhead range." },
  "dumbbell-lateral-raise": { target: "Shoulders", secondary: [], equipment: "Dumbbells", cues: ["Stand tall with very light weights by your sides.", "Raise both arms to shoulder height with soft elbows.", "Lower slowly without shrugging."], tip: "Do not swing the weights." },
  "rope-tricep-extension": { target: "Triceps", secondary: [], equipment: "Cable, rope", cues: ["Keep the elbows near your ribs.", "Straighten your arms, spreading the rope ends at the bottom.", "Return the rope slowly without moving your shoulders."], tip: "Use a light stack to keep the upper arm still." },
  "lat-pull-down": { target: "Lats", secondary: ["Biceps", "Upper back"], equipment: "Cable pulldown", cues: ["Sit securely and hold the bar with palms forward.", "Draw your shoulders down and elbows toward your sides.", "Return the handle slowly to a comfortable reach."], tip: "Pull to the upper chest, not behind the neck." },
  "one-arm-dumbbell-row": { target: "Upper back", secondary: ["Lats", "Biceps"], equipment: "Dumbbell, bench", cues: ["Support one hand and knee on a bench, back steady.", "Row the weight toward your hip rather than straight up to your shoulder.", "Lower until the arm reaches comfortably straight."], tip: "Avoid twisting your torso to lift heavier." },
  "bent-over-dumbbell-reverse-fly": { target: "Rear shoulders", secondary: ["Upper back"], equipment: "Very light dumbbells", cues: ["Hinge at your hips with a neutral back, arms hanging beneath shoulders.", "Raise the arms out to the sides using the back of your shoulders.", "Lower slowly; don't bounce your back."], tip: "Omit if the hinged position bothers your back." },
  "standing-dumbbell-curl": { target: "Biceps", secondary: ["Forearms"], equipment: "Dumbbells", cues: ["Stand upright with palms facing forward and elbows near the sides.", "Curl without moving the upper arms.", "Lower slowly until the arms are comfortably straight."], tip: "Do not use your body to swing the weights." },
  "standing-hammer-curl": { target: "Biceps", secondary: ["Forearms"], equipment: "Dumbbells", cues: ["Stand tall, holding dumbbells with palms facing inward.", "Curl up keeping your upper arms near your sides.", "Lower slowly with palms still facing inward."], tip: "Start light enough to avoid swinging." },
  "45-degree-leg-press": { target: "Quads", secondary: ["Glutes", "Hamstrings"], equipment: "Leg press", cues: ["Sit with feet shoulder-width and back flat against the pad.", "Lower the sled to a comfortable depth without lifting your hips.", "Push back up without snapping the knees straight."], tip: "Use light loading and ask a trainer to adjust the machine for your height." },
  "bodyweight-squat": { target: "Quads", secondary: ["Glutes", "Hamstrings"], equipment: "Bodyweight, optional stable bench", cues: ["Feet about shoulder-width; keep your chest comfortably upright.", "Sit back and bend knees to a depth you can control.", "Press through your feet to stand tall."], tip: "A high stable bench behind you can limit depth while you learn." },
  "leg-curl": { target: "Hamstrings", secondary: [], equipment: "Leg curl machine", cues: ["Set the pad comfortably above your ankles.", "Bend at the knees to draw your heels toward your body.", "Return slowly without bouncing."], tip: "Use the lightest setting that allows full control." },
  "bodyweight-standing-calf-raise": { target: "Calves", secondary: [], equipment: "Bodyweight, sturdy support", cues: ["Stand tall holding a rail for balance.", "Rise onto the balls of your feet and pause.", "Lower your heels with control."], tip: "Use a flat floor until you are comfortable on a step." },
  hover: { target: "Abs", secondary: ["Lower back"], equipment: "Bodyweight", cues: ["Set elbows under shoulders with forearms flat.", "Brace your belly and glutes, keeping one long line from head to feet.", "Breathe slowly without letting your hips sag."], tip: "Knees down is a valid easier variation." },
  "side-hover": { target: "Obliques", secondary: ["Abs"], equipment: "Bodyweight", cues: ["Set one forearm under your shoulder and stack your hips.", "Lift the hips into a straight line and breathe.", "Hold the same time on each side."], tip: "Keep the lower knee on the floor as a beginner modification." },
  "dumbbell-bench-press": { target: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Dumbbells, flat bench", cues: ["Lie on a stable bench with feet planted and weights beside your chest.", "Press upward without bouncing or lifting your shoulders off the bench.", "Lower with control to a comfortable depth."], tip: "Ask a trainer to demonstrate getting the weights into and out of position." },
  "incline-dumbbell-curl": { target: "Biceps", secondary: ["Forearms"], equipment: "Dumbbells, incline bench", cues: ["Sit against an inclined backrest with light weights hanging at your sides.", "Bend your elbows while keeping the upper arms quiet.", "Lower slowly without forcing your shoulders into a stretch."], tip: "Use a smaller range or a standing curl if your shoulders are uncomfortable." },
  "hanging-knee-raise": { target: "Abs", secondary: ["Hip flexors"], equipment: "Secure overhead bar", cues: ["Hold a secure bar with a stable grip and no swinging.", "Bend your knees and draw them toward your torso while gently curling the pelvis.", "Lower slowly and reset before the next repetition."], tip: "This is a later progression; use floor-based core work until you can hang comfortably." },
  "high-inverted-row": { target: "Upper back", secondary: ["Biceps", "Rear shoulders"], equipment: "Secure fixed bar", cues: ["Grip a firmly secured bar and lean back with your body in one straight line.", "Pull your chest toward the bar without jutting your head forward.", "Straighten the arms slowly, keeping the body steady."], tip: "Start with a high bar and a more upright body angle." },
  "russian-twist": { target: "Abs", secondary: ["Obliques"], equipment: "Bodyweight", cues: ["Sit tall with knees bent and feet supported on the floor.", "Turn your upper body gently from side to side without rounding your lower back.", "Keep the motion small and controlled while breathing."], tip: "Start without a weight; choose a plank if rotation bothers your back." },
  "abdominal-air-bike": { target: "Abs", secondary: ["Obliques"], equipment: "Bodyweight", cues: ["Lie on your back with knees bent and hands lightly supporting the head.", "Rotate one shoulder toward the opposite knee while extending the other leg comfortably.", "Alternate slowly without pulling on your neck."], tip: "Keep the lower back supported and shorten the leg extension when needed." },
  "hollow-body-hold": { target: "Abs", secondary: [], equipment: "Bodyweight", cues: ["Lie on your back and gently press the lower back toward the floor.", "Reach the arms and legs only as far as you can without arching your back.", "Hold while breathing; reset as soon as you lose the position."], tip: "An intermediate progression: bend the knees or use a dead bug first." },
  "cable-face-pull": { target: "Rear shoulders", secondary: ["Upper back"], equipment: "Cable, rope", cues: ["Set the rope around face height and stand balanced with a light load.", "Draw the rope toward your face with elbows wide, keeping your head still.", "Return slowly without leaning back or shrugging."], tip: "Keep this a controlled technique exercise, not a heavy pull." },
  "cable-face-pull-with-external-rotation": { target: "Rear shoulders", secondary: ["Upper back", "Rotator cuff"], equipment: "Cable, rope", cues: ["Face the cable with the rope set around face height.", "Pull toward your face and rotate the forearms upward within a comfortable range.", "Reverse slowly, keeping the torso steady and neck relaxed."], tip: "Use very light resistance and avoid any painful shoulder range." },
  "seated-leg-curl": { target: "Hamstrings", secondary: [], equipment: "Seated leg curl machine", cues: ["Adjust the backrest and pads so your knees align with the machine pivot.", "Keep your thighs supported as you bend the knees to curl the pad downward.", "Return slowly without bouncing or lifting off the seat."], tip: "Ask gym staff to fit the machine to your leg length." },
  "half-kneeling-quad-stretch": { target: "Quads", secondary: ["Hip flexors"], equipment: "Bodyweight, knee padding", cues: ["Kneel on a padded surface in a supported half-kneeling stance.", "Bend the rear knee and hold the rear foot only if you can stay balanced comfortably.", "Keep your torso tall and ease into a gentle front-thigh stretch, then switch sides."], tip: "Do not force the knee or pull hard on the foot; use an easier supported stretch if needed." },
};

export const EXERCISE_NAMES = [...MS_CATALOG.map(([name]) => name), ...Object.keys(ACTIVITY_GUIDES)];

export function workoutGuideFor(title: string): { guide_url: string | null; guide: ExerciseGuide | null } {
  const activity = activityGuideFor(title);
  if (activity) return { guide_url: null, guide: activity };
  const match = catalogExercise(title);
  if (!match) return { guide_url: null, guide: null };
  const source = exerciseSourceUrl(match.slug);
  const video = EXERCISE_VIDEOS[match.slug]?.video_url;
  const cues = GUIDES[match.slug];
  return {
    guide_url: source,
    guide: cues || video ? {
      ...cues,
      description: `${match.name}: review the demonstration and use a comfortable, controlled range of motion.`,
      source_url: source,
      ...(video ? { video_url: video } : {}),
    } : null,
  };
}

const prescription = (title: string, reps: number | null, notes: string, sets = 1, seconds: number | null = null) => ({
  title,
  notes,
  ...workoutGuideFor(title),
  sets: Array.from({ length: sets }, (): WorkoutSet => ({ kg: null, reps, seconds, completed: false })),
});

export const STARTER_PLAN = [
  { day: 1, title: "Push · chest / shoulders / triceps", description: "Light technique first · 90–120 s rest on presses", items: [
    prescription("Incline Push Ups", 8, "6–10 reps; use a higher stable bench if needed."),
    prescription("Seated Dumbbell Press", 10, "8–12 reps; skip painful overhead ranges."),
    prescription("Dumbbell Lateral Raise", 12, "12–15 reps, very light."),
    prescription("Rope Tricep Extension", 12, "10–15 reps, controlled."),
  ] },
  { day: 2, title: "Pull · back / biceps", description: "Supported pulling and light arm work", items: [
    prescription("Lat Pull Down", 10, "8–12 reps; pull to upper chest."),
    prescription("One Arm Dumbbell Row", 10, "8–12 reps per side; kg is one dumbbell."),
    prescription("Bent Over Dumbbell Reverse Fly", 12, "12–15 reps; omit if bending hurts your back."),
    prescription("Standing Dumbbell Curl", 12, "10–15 reps, no swinging."),
    prescription("Standing Hammer Curl", 12, "10–15 reps, no swinging."),
  ] },
  { day: 3, title: "Legs · light / supported", description: "No heavy loading or maximal jumps", items: [
    prescription("Leg Press", 12, "10–15 reps; comfortable depth, don't force knee lockout."),
    prescription("Prisoner Squat", 10, "8–12 reps; sit back toward a stable high bench as an easier variation."),
    prescription("Leg Curl", 12, "10–15 reps, light machine setting."),
    prescription("Bodyweight Standing Calf Raise", 12, "12–15 reps; hold a rail for balance."),
  ] },
  { day: 4, title: "Core + easy cardio", description: "Easy cardio 10–20 min at conversational pace", items: [
    prescription("Plank", null, "15–25 seconds; knees down is fine.", 1, 20),
    prescription("Side Plank", null, "10–20 seconds per side; knee down is fine.", 1, 15),
    { title: "Easy stationary cycling", notes: "10–20 easy minutes; conversational pace. Record seconds or use the rest timer.",
      ...workoutGuideFor("Easy stationary cycling"),
      sets: [{ kg: null, reps: null, seconds: 600, completed: false }] },
  ] },
  { day: 6, title: "Full body · optional / easy", description: "Start after recovery is reliable; 1 set at first", items: [
    prescription("Incline Push Ups", 8, "6–10 reps; easier than Monday.", 1),
    prescription("One Arm Dumbbell Row", 10, "8–12 reps per side, light.", 1),
    prescription("Prisoner Squat", 10, "8–12 reps; use a stable bench if helpful.", 1),
    prescription("Plank", null, "15–25 seconds; skip if sore.", 1, 20),
  ] },
  { day: 0, title: "Recovery · swimming or rest", description: "Gentle swimming only; rest instead if needed", items: [
    { title: "Easy swimming", notes: "10–20 easy minutes with breaks; do not swim alone. Rest is fine.",
      ...workoutGuideFor("Easy swimming"),
      sets: [{ kg: null, reps: null, seconds: 600, completed: false }] },
  ] },
  { day: null, title: "Mobility · optional daily", description: "5–8 easy minutes after warming up; never force a split", items: [
    { title: "Half-kneeling hip flexor stretch", notes: "20–30 sec per side. Tuck the pelvis, squeeze the back-leg glute and move forward gently.",
      ...workoutGuideFor("Half-kneeling hip flexor stretch"),
      sets: [{ kg: null, reps: null, seconds: 25, completed: false }] },
    { title: "Seated hamstring stretch", notes: "20–30 sec per side; hinge at the hips, knees may bend slightly.",
      ...workoutGuideFor("Seated hamstring stretch"),
      sets: [{ kg: null, reps: null, seconds: 25, completed: false }] },
    { title: "Butterfly stretch", notes: "20–30 sec; keep your spine tall and do not press your knees down.",
      ...workoutGuideFor("Butterfly stretch"),
      sets: [{ kg: null, reps: null, seconds: 25, completed: false }] },
  ] },
] as const;
