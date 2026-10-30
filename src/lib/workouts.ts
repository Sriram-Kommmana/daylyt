import { db, onDate, remove, save } from './db';
import { oneRepMax } from './calc';
import { planOccursOn } from './summary';
import type { Exercise, Plan, Routine, Workout, WorkoutExercise, WorkoutSet } from './types';
import type { Program } from '../data/programs';

export const toWorkoutExercise = (e: Exercise, sets: WorkoutSet[] = []): WorkoutExercise => ({
  exerciseId: e.id, name: e.name, kind: e.kind, category: e.category, primary: e.primary, met: e.met, sets,
});

/** Names an unnamed workout after what it trained, e.g. "Chest & triceps". */
export function workoutTitle(w: Pick<Workout, 'name' | 'exercises'>) {
  if (w.name) return w.name;
  const counts = new Map<string, number>();
  for (const ex of w.exercises) for (const m of ex.primary) counts.set(m, (counts.get(m) ?? 0) + Math.max(1, ex.sets.length));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([m]) => m);
  if (!top.length) return 'Workout';
  const text = top.join(' & ');
  return text[0].toUpperCase() + text.slice(1);
}

/** The day's open workout, or a new one. Quick-logged exercises all gather into one session. */
export async function todaysWorkout(date: string): Promise<Workout> {
  const existing = (await onDate(db.workouts, date)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (existing) return existing;
  return save<Workout>('workouts', { date, name: '', exercises: [] });
}

export async function appendExercise(date: string, ex: WorkoutExercise) {
  const w = await todaysWorkout(date);
  const same = w.exercises.findIndex((e) => e.exerciseId === ex.exerciseId);
  const exercises = [...w.exercises];
  if (same >= 0) exercises[same] = { ...exercises[same], sets: [...exercises[same].sets, ...ex.sets] };
  else exercises.push(ex);
  return save<Workout>('workouts', { ...w, exercises });
}

export const fromRoutine = (r: Pick<Routine, 'exercises'>) =>
  r.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: false })) }));

export async function startFromRoutine(r: Routine, date: string, planId?: string) {
  return save<Workout>('workouts', { date, name: r.name, startedAt: Date.now(), exercises: fromRoutine(r), planId });
}

export async function repeatWorkout(w: Workout, date: string) {
  return save<Workout>('workouts', {
    date, name: w.name, startedAt: Date.now(),
    exercises: w.exercises.map((e) => ({ ...e, note: undefined, sets: e.sets.map((s) => ({ ...s, done: false })) })),
  });
}

export const saveAsRoutine = (w: Workout, name: string) =>
  save<Routine>('routines', { name, exercises: w.exercises.map((e) => ({ ...e, note: undefined, sets: e.sets.map((s) => ({ ...s, done: false })) })) });

export interface History {
  date: string;
  workoutId: string;
  sets: WorkoutSet[];
}

export function historyOf(workouts: Workout[], exerciseId: string): History[] {
  const out: History[] = [];
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      const sets = e.sets.filter((s) => s.done && !s.warmup);
      if (sets.length) out.push({ date: w.date, workoutId: w.id, sets });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function lastSets(workouts: Workout[], exerciseId: string, before: string, excludeId?: string): WorkoutSet[] | undefined {
  const rows = historyOf(workouts.filter((w) => w.id !== excludeId && w.date <= before), exerciseId);
  return rows[rows.length - 1]?.sets;
}

export const bestSet = (sets: WorkoutSet[]) =>
  sets.reduce<WorkoutSet | undefined>((best, s) => (!best || oneRepMax(s.weight ?? 0, s.reps ?? 0) > oneRepMax(best.weight ?? 0, best.reps ?? 0) ? s : best), undefined);

export interface PR {
  exerciseId: string;
  name: string;
  weight: number;
  reps: number;
  e1rm: number;
  date: string;
}

/** Heaviest estimated one-rep max per weighted exercise, across all workouts. */
export function personalRecords(workouts: Workout[]): PR[] {
  const best = new Map<string, PR>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (!s.done || s.warmup || !s.weight || !s.reps) continue;
        const e1rm = oneRepMax(s.weight, s.reps);
        const cur = best.get(e.exerciseId);
        if (!cur || e1rm > cur.e1rm) best.set(e.exerciseId, { exerciseId: e.exerciseId, name: e.name, weight: s.weight, reps: s.reps, e1rm, date: w.date });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** True when this set beats everything logged before it for the exercise. */
export function isPR(workouts: Workout[], workoutId: string, date: string, exerciseId: string, set: WorkoutSet) {
  if (!set.done || set.warmup || !set.weight || !set.reps) return false;
  const e1rm = oneRepMax(set.weight, set.reps);
  const prior = historyOf(workouts.filter((w) => w.id !== workoutId && w.date <= date), exerciseId);
  if (!prior.length) return false;
  return prior.every((h) => h.sets.every((s) => oneRepMax(s.weight ?? 0, s.reps ?? 0) < e1rm));
}

export function programSets(p: { sets: number; reps?: number; sec?: number }, kind: WorkoutExercise['kind']): WorkoutSet[] {
  return Array.from({ length: p.sets }, () => ({ reps: kind === 'reps' ? p.reps : undefined, sec: kind === 'reps' ? undefined : p.sec, done: false }));
}

/** Creates a program's routines and repeats them weekly in the planner, replacing nothing. */
export async function applyProgram(program: Program, exercises: Exercise[], from: string) {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  for (let i = 0; i < program.days.length; i++) {
    const day = program.days[i];
    const routine = await save<Routine>('routines', {
      name: day.name,
      note: program.name,
      exercises: day.exercises.flatMap((p) => {
        const e = byId.get(p.id);
        return e ? [toWorkoutExercise(e, programSets(p, e.kind))] : [];
      }),
    });
    await save<Plan>('plans', {
      kind: 'workout', title: day.name, routineId: routine.id, weekdays: program.schedule[i], from, doneDates: [], skipDates: [],
    });
  }
}

export const removePlanOn = (p: Plan, date: string) =>
  p.date ? remove('plans', p.id) : save<Plan>('plans', { ...p, skipDates: [...(p.skipDates ?? []), date] });

export const togglePlanDone = (p: Plan, date: string) =>
  save<Plan>('plans', { ...p, doneDates: p.doneDates.includes(date) ? p.doneDates.filter((d) => d !== date) : [...p.doneDates, date] });

export const plansOn = (plans: Plan[], date: string) =>
  plans.filter((p) => planOccursOn(p, date)).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
