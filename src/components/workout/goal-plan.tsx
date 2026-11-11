"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TutorialButton } from "@/components/dashboard/tutorial-button";
import { WEEKDAY_SHORT } from "@/lib/date";
import { STARTER_PLAN } from "@/lib/workout-plan";
import type { WorkoutSet } from "@/lib/types";

const DAYS: Record<number, { label: string; goal: string; why: string }> = {
  1: { label: "Push", goal: "Chest · shoulders · triceps", why: "Controlled presses and push-up practice build upper-body strength without needing heavy starting loads." },
  2: { label: "Pull", goal: "Back · biceps · bodyweight skills", why: "Supported pulling and curls build the back and arms; gradually reduce assistance as control improves." },
  3: { label: "Legs", goal: "Leg strength · balance · movement base", why: "Light leg work builds a base for daily movement and future skills. It is not a flips-training session." },
  4: { label: "Core + cardio", goal: "Trunk control · easy conditioning", why: "Gentle core practice and conversational-pace cardio support fitness and overall fat-loss efforts—not spot reduction." },
  5: { label: "Rest", goal: "Recovery", why: "No required workout. Rest, sleep and regular meals support recovery. Skip mobility too if you need full rest." },
  6: { label: "Optional full body", goal: "Technique · full-body practice", why: "A short, light technique day only when recovered. Skipping Saturday is part of the plan, not a failure." },
  0: { label: "Swim / rest", goal: "Easy conditioning · recovery", why: "Easy swimming with breaks, supervision and your clinician's glucose plan—or take a complete rest day." },
};

function prescription(set: WorkoutSet) {
  if (set.seconds != null) return set.seconds >= 60 ? `${set.seconds / 60} min` : `${set.seconds} sec`;
  return `${set.reps ?? 0} reps`;
}

export function GoalPlan({ weekday, installed, installing, onApply }: {
  weekday: number; installed: boolean; installing: boolean; onApply: () => void;
}) {
  const [selected, setSelected] = useState(weekday);
  const group = STARTER_PLAN.find((day) => day.day === selected);
  const purpose = DAYS[selected];
  const mobility = STARTER_PLAN.find((day) => day.day == null)!;
  return <section className="neon-panel overflow-hidden" aria-label="Suggested goal-based weekly plan">
    <div className="border-b border-dashed p-5 sm:p-6">
      <p className="app-eyebrow flex items-center gap-2"><Target className="size-3.5" /> Suggested for your goals</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-display text-3xl tracking-wide sm:text-4xl">Build a stronger, more mobile you.</h2><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Four main sessions, one optional practice day, swimming or rest, and gentle mobility. Start light; every movement has a video and form guide.</p></div>
        {!installed ? <Button type="button" onClick={onApply} disabled={installing}>{installing ? "Applying…" : "Apply suggested plan"}</Button> : <span className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">Plan applied · customize your routines below</span>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Applying is optional. It archives your current exercise groups, keeps their logs and EXP, and leaves habits and goals alone.</p>
    </div>
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Suggested training days">
        {[1, 2, 3, 4, 5, 6, 0].map((day) => <button type="button" key={day} onClick={() => setSelected(day)} aria-pressed={selected === day} aria-controls="suggested-day"
          className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${selected === day ? "border-primary bg-primary/10" : "hover:border-primary/50 hover:bg-accent"}`}>
          <span className="block font-mono text-[11px] text-primary">{WEEKDAY_SHORT[day]}</span><span className="mt-1 block text-xs font-medium leading-relaxed">{DAYS[day].label}</span>
        </button>)}
      </div>
      <div id="suggested-day" className="rounded-xl border bg-background/40 p-4" aria-live="polite">
        <h3 className="text-sm font-semibold">{WEEKDAY_SHORT[selected]} · {purpose.goal}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{purpose.why}</p>
        {group && <ul className="mt-3 divide-y divide-dashed">{group.items.map((exercise) => <li key={exercise.title} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{exercise.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{exercise.sets.length} set · {prescription(exercise.sets[0])} · {exercise.notes}</p></div>
          <TutorialButton title={exercise.title} url={null} guideUrl={exercise.guide_url} guide={exercise.guide} />
        </li>)}</ul>}
      </div>
      <details className="rounded-xl border border-dashed p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">Optional gentle mobility · split preparation <ChevronDown className="size-4" /></summary>
        <p className="mt-2 text-xs text-muted-foreground">{mobility.description} Never force depth. Flips need a qualified coach, suitable mats and individual clearance—not solo attempts.</p>
        <ul className="mt-2 divide-y divide-dashed">{mobility.items.map((exercise) => <li key={exercise.title} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="text-sm">{exercise.title}</span><TutorialButton title={exercise.title} url={null} guideUrl={exercise.guide_url} guide={exercise.guide} /></li>)}</ul>
      </details>
      <div className="grid gap-3 border-t border-dashed pt-4 text-xs leading-relaxed text-muted-foreground sm:grid-cols-3">
        <p><strong className="text-foreground">Progress slowly.</strong> Begin with one light set per movement for two weeks. Try a second only when recovered; add load only after controlled, comfortable repetitions.</p>
        <p><strong className="text-foreground">A leaner waist.</strong> Core work builds strength, not selective side-fat loss. Visible abs and a V-line depend on overall body composition; results are not guaranteed.</p>
        <p><strong className="text-foreground">Stay safe.</strong> Follow your clinician&apos;s exercise/glucose plan. Stop for pain, dizziness or low-glucose symptoms. No insulin-dose advice or unsupervised swimming.</p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="https://www.muscleandstrength.com/workouts/3-day-PPL-workout-for-beginners" target="_blank" rel="noopener noreferrer">M&amp;S beginner PPL reference <ArrowUpRight className="size-3" /></a>
        <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="https://www.muscleandstrength.com/workouts/3-day-full-body-dumbbell-workout" target="_blank" rel="noopener noreferrer">Full-body alternative <ArrowUpRight className="size-3" /></a>
      </div>
    </div>
  </section>;
}
