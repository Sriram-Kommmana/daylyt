import type { GoalType, Goals, Settings, Workout, WorkoutExercise, WorkoutSet } from './types';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  { value: 1.375, label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  { value: 1.55, label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  { value: 1.725, label: 'Very active', hint: 'Hard training 6–7 days a week' },
  { value: 1.9, label: 'Athlete', hint: 'Physical job plus hard training' },
];

/** Mifflin-St Jeor: the most accurate common estimate of resting metabolism. */
export function bmr(s: Pick<Settings, 'sex' | 'weightKg' | 'heightCm' | 'birthYear'>, year = new Date().getFullYear()) {
  const age = year - s.birthYear;
  return 10 * s.weightKg + 6.25 * s.heightCm - 5 * age + (s.sex === 'male' ? 5 : -161);
}

export const tdee = (s: Pick<Settings, 'sex' | 'weightKg' | 'heightCm' | 'birthYear' | 'activity'>) => bmr(s) * s.activity;

const GOAL_DELTA: Record<GoalType, number> = { lose: -500, maintain: 0, gain: 300 };
const PROTEIN_PER_KG: Record<GoalType, number> = { lose: 2, maintain: 1.6, gain: 1.8 };

/** Suggested targets from a profile. Everything stays editable in Settings. */
export function suggestGoals(s: Pick<Settings, 'sex' | 'weightKg' | 'heightCm' | 'birthYear' | 'activity' | 'goalType'>): Goals {
  const floor = s.sex === 'male' ? 1500 : 1200;
  const kcal = Math.max(floor, Math.round((tdee(s) + GOAL_DELTA[s.goalType]) / 10) * 10);
  const protein = Math.round(s.weightKg * PROTEIN_PER_KG[s.goalType]);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: Math.round((kcal / 1000) * 14),
    waterMl: Math.round((s.weightKg * 35) / 250) * 250,
    sleepMin: 480,
    steps: 8000,
    focusMin: 60,
    workoutsPerWeek: 3,
  };
}

const MET_BY_CATEGORY: Record<string, number> = {
  strength: 5,
  powerlifting: 6,
  'olympic weightlifting': 6,
  strongman: 6,
  plyometrics: 8,
  stretching: 2.3,
  cardio: 7,
  yoga: 3,
  sport: 6,
};

export const metFor = (ex: Pick<WorkoutExercise, 'met' | 'category'>) => ex.met ?? MET_BY_CATEGORY[ex.category] ?? 5;

/** kcal = MET × body weight (kg) × hours, from the Compendium of Physical Activities. */
export const metKcal = (met: number, kg: number, minutes: number) => met * kg * (minutes / 60);

const SEC_PER_REP = 3;
const REST_PER_SET_SEC = 60;

/** Time a set takes including the rest after it. */
export function setMinutes(set: WorkoutSet, kind: WorkoutExercise['kind']) {
  if (kind === 'cardio') return (set.sec ?? 0) / 60;
  if (kind === 'time') return ((set.sec ?? 0) + 20) / 60;
  return ((set.reps ?? 0) * SEC_PER_REP + REST_PER_SET_SEC) / 60;
}

const isDone = (s: WorkoutSet) => s.done && !s.warmup;

export function exerciseKcal(ex: WorkoutExercise, kg: number) {
  const minutes = ex.sets.filter((s) => s.done).reduce((sum, s) => sum + setMinutes(s, ex.kind), 0);
  return metKcal(metFor(ex), kg, minutes);
}

export const workoutKcal = (w: Workout, kg: number) =>
  w.kcalOverride ?? Math.round(w.exercises.reduce((sum, ex) => sum + exerciseKcal(ex, kg), 0));

export const workoutSets = (w: Workout) => w.exercises.reduce((n, ex) => n + ex.sets.filter(isDone).length, 0);

export const setVolume = (s: WorkoutSet) => (s.reps ?? 0) * (s.weight ?? 0);

export const workoutVolume = (w: Workout) =>
  w.exercises.reduce((sum, ex) => sum + ex.sets.filter(isDone).reduce((v, s) => v + setVolume(s), 0), 0);

export function workoutMinutes(w: Workout) {
  if (w.minutes != null) return w.minutes;
  if (w.startedAt && w.endedAt) return Math.round((w.endedAt - w.startedAt) / 60_000);
  return Math.round(w.exercises.reduce((sum, ex) => sum + ex.sets.filter((s) => s.done).reduce((m, s) => m + setMinutes(s, ex.kind), 0), 0));
}

/** Epley estimate of a one-rep max. */
export const oneRepMax = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));

export const stepsToKm = (steps: number, heightCm: number) => (steps * heightCm * 0.415) / 100_000;

/** About 0.57 cal per step per kg: roughly 40 kcal per 1000 steps at 70 kg. */
export const stepsToKcal = (steps: number, kg: number) => Math.round(steps * kg * 0.00057);

export const KG_PER_LB = 0.45359237;
export const toKg = (value: number, unit: Settings['weightUnit']) => (unit === 'lb' ? value * KG_PER_LB : value);
export const fromKg = (kg: number, unit: Settings['weightUnit']) => (unit === 'lb' ? kg / KG_PER_LB : kg);
export const roundTo = (n: number, step: number) => Math.round(n / step) * step;
export const fmtWeight = (kg: number, unit: Settings['weightUnit']) => `${+fromKg(kg, unit).toFixed(1)} ${unit}`;

export const compact = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${Math.round(n / 1000)}K`;
  if (a >= 1000) return `${+(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

export const num = (n: number) => Math.round(n).toLocaleString();

export const setsLabel = (n: number) => `${n} set${n === 1 ? '' : 's'}`;
