import type { ExerciseGuide } from "./types";

export const ACTIVITY_GUIDES: Record<string, ExerciseGuide> = {
  "Half-kneeling hip flexor stretch": {
    target: "Hip flexors", equipment: "Knee padding, stable support",
    description: "Gentle half-kneeling hip stretch demonstrated by South Tees Hospitals NHS Foundation Trust.",
    source_url: "https://www.southtees.nhs.uk/resources/hip-stretch-in-half-kneeling/",
    video_url: "https://www.youtube.com/embed/pgxgfQ7-myU",
    cues: ["Half-kneel on a padded surface, holding support if needed.", "Keep hips square and gently shift forward until you feel mild tension at the front of the rear hip.", "Return slowly, breathe normally and repeat on the other side."],
    tip: "Do not force the stretch or arch your lower back.",
  },
  "Seated hamstring stretch": {
    target: "Hamstrings", equipment: "Stable chair",
    description: "The back-and-thighs seated-stretch demonstration from Cambridge University Hospitals NHS Foundation Trust includes the hamstring stretch.",
    source_url: "https://www.cuh.nhs.uk/our-services/physiotherapy-outpatients/outpatient-physio-resources/resources/shoulder/seated-stretches/",
    video_url: "https://www.youtube.com/embed/IB-8SWyylME",
    cues: ["Sit toward the front of a stable chair and extend one heel onto the floor.", "Keep your back long and gently hinge forward from the hips.", "Hold mild tension without bouncing, then switch legs."],
    tip: "This video also includes back stretches; use only comfortable movements appropriate for you.",
  },
  "Butterfly stretch": {
    target: "Adductors", equipment: "Mat",
    description: "A butterfly-stretch demonstration from Hinge Health's physical therapists; start within a comfortable range.",
    source_url: "https://www.youtube.com/watch?v=MHwUChXNy-Y",
    video_url: "https://www.youtube.com/embed/MHwUChXNy-Y",
    cues: ["Sit tall with the soles of your feet together.", "Let the knees relax outward without pressing them down.", "Breathe and lean slightly from the hips only if that feels comfortable."],
    tip: "Never force a split or push through groin or knee pain.",
  },
  "Easy stationary cycling": {
    target: "Cardiorespiratory fitness", equipment: "Stationary bike",
    description: "PureGym demonstrates stationary-bike setup and controls. Keep your own session easy and conversational.",
    source_url: "https://www.youtube.com/watch?v=NwwDBARCGgo",
    video_url: "https://www.youtube.com/embed/NwwDBARCGgo",
    cues: ["Ask gym staff to set the seat so the knee stays slightly bent at the bottom of the pedal stroke.", "Begin with low resistance and a pace that allows full sentences.", "Build duration gradually and finish at an easier pace."],
    tip: "Follow your clinician's exercise/glucose plan; stop if you feel unwell.",
  },
  "Easy swimming": {
    target: "Easy cardiovascular recovery", equipment: "Supervised pool",
    description: "Example stroke: Nuffield Health's front-crawl technique. This is not a substitute for learning to swim with an instructor.",
    source_url: "https://www.nuffieldhealth.com/article/how-to-swim-front-crawl-correctly",
    video_url: "https://www.youtube.com/embed/1jB762UxeWA",
    cues: ["Swim only if you are already comfortable in the water, with supervision and breaks.", "Use a relaxed stroke and stop before fatigue affects your technique.", "Choose rest instead when recovery or glucose management requires it."],
    tip: "Do not swim alone. Follow your clinician's glucose plan and a qualified instructor's guidance.",
  },
};

const names = new Map(Object.entries(ACTIVITY_GUIDES).map(([name, guide]) => [name.toLowerCase(), guide]));
export function activityGuideFor(title: string) {
  const key = title.trim().toLowerCase();
  if (key === "swimming") return ACTIVITY_GUIDES["Easy swimming"];
  if (key === "easy walking or cycling") return {
    ...ACTIVITY_GUIDES["Easy stationary cycling"],
    description: "Cycling option only: this video demonstrates a stationary bike, not walking. Choose one easy activity for this session.",
  };
  return names.get(key) ?? null;
}
