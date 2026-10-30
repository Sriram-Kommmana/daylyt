import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromOff } from './catalog';
import { CURATED_FOODS } from '../data/foods';
import { EXTRA_EXERCISES, withExtras } from '../data/extraExercises';
import { PROGRAMS } from '../data/programs';
import { bmr, exerciseKcal, oneRepMax, stepsToKcal, suggestGoals, workoutKcal, workoutSets, workoutVolume } from './calc';
import { addDays, dateRange, parse, sleepMinutes, toISO, weekStartOf } from './date';
import { index, search } from './search';
import { bestStreak, dayScore, emptyDay, foodProgress, insights, pillars, planOccursOn, streakOf, summarize, weeklyWorkoutStreak, type RangeRows } from './summary';
import { mergeRows, validateSnapshot } from './backup';
import type { DaySummary, Exercise, Goals, Plan, Workout, WorkoutExercise } from './types';

const goals: Goals = { kcal: 2000, protein: 120, carbs: 200, fat: 60, fiber: 28, waterMl: 2500, sleepMin: 480, steps: 8000, focusMin: 60, workoutsPerWeek: 3 };
const noRows: RangeRows = { workouts: [], foodLogs: [], water: [], sleep: [], activity: [], body: [], habits: [], habitLogs: [], tasks: [], focus: [], plans: [], journal: [] };
const person = { weightKg: 70, heightCm: 175 };

describe('dates', () => {
  it('round-trips a local date without shifting the day', () => {
    expect(toISO(parse('2026-03-01'))).toBe('2026-03-01');
  });
  it('crosses month and leap-year boundaries', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dateRange('2026-12-30', '2027-01-02')).toHaveLength(4);
  });
  it('finds the start of the week for either convention', () => {
    expect(weekStartOf('2026-10-30', 1)).toBe('2026-10-26'); // Friday → Monday
    expect(weekStartOf('2026-10-30', 0)).toBe('2026-10-25'); // Friday → Sunday
    expect(weekStartOf('2026-10-25', 1)).toBe('2026-10-19'); // Sunday → previous Monday
  });
  it('computes sleep across midnight and within one day', () => {
    expect(sleepMinutes('23:00', '07:00')).toBe(480);
    expect(sleepMinutes('01:30', '08:00')).toBe(390);
    expect(sleepMinutes('23:30', '23:30')).toBe(1440);
  });
});

describe('calculations', () => {
  it('matches a hand-worked Mifflin-St Jeor BMR', () => {
    // 10×70 + 6.25×175 − 5×30 + 5 = 1648.75
    expect(bmr({ sex: 'male', weightKg: 70, heightCm: 175, birthYear: 1996 }, 2026)).toBeCloseTo(1648.75);
    // 10×60 + 6.25×165 − 5×30 − 161 = 1320.25
    expect(bmr({ sex: 'female', weightKg: 60, heightCm: 165, birthYear: 1996 }, 2026)).toBeCloseTo(1320.25);
  });
  it('suggests macros that add up to the calorie goal, and never goes below the floor', () => {
    const g = suggestGoals({ sex: 'male', weightKg: 75, heightCm: 178, birthYear: 1998, activity: 1.55, goalType: 'lose' });
    expect(Math.abs(g.protein * 4 + g.carbs * 4 + g.fat * 9 - g.kcal)).toBeLessThan(15);
    const small = suggestGoals({ sex: 'female', weightKg: 40, heightCm: 145, birthYear: 1960, activity: 1.2, goalType: 'lose' });
    expect(small.kcal).toBeGreaterThanOrEqual(1200);
  });
  it('estimates one-rep max and step calories', () => {
    expect(oneRepMax(100, 1)).toBe(100);
    expect(oneRepMax(100, 10)).toBeCloseTo(133.33, 1);
    expect(stepsToKcal(1000, 70)).toBe(40);
  });
  const strength: WorkoutExercise = {
    exerciseId: 'a', name: 'Bench', kind: 'reps', category: 'strength', primary: ['chest'],
    sets: [
      { reps: 10, weight: 50, done: true },
      { reps: 10, weight: 50, done: true },
      { reps: 8, weight: 20, done: true, warmup: true },
      { reps: 10, weight: 50, done: false },
    ],
  };
  const w = { id: 'w', updatedAt: 0, date: '2026-01-01', name: 'x', exercises: [strength] } as Workout;
  it('counts only finished working sets for volume', () => {
    expect(workoutSets(w)).toBe(2);
    expect(workoutVolume(w)).toBe(1000);
  });
  it('estimates calories from completed sets and respects a manual override', () => {
    expect(exerciseKcal(strength, 70)).toBeGreaterThan(0);
    expect(workoutKcal({ ...w, kcalOverride: 321 }, 70)).toBe(321);
    expect(workoutKcal({ ...w, exercises: [{ ...strength, sets: [{ reps: 10, done: false }] }] }, 70)).toBe(0);
  });
  it('uses the activity MET for cardio: 30 min at MET 8 and 70 kg is 280 kcal', () => {
    const run: WorkoutExercise = { exerciseId: 'r', name: 'Run', kind: 'cardio', category: 'cardio', met: 8, primary: [], sets: [{ sec: 1800, done: true }] };
    expect(exerciseKcal(run, 70)).toBeCloseTo(280);
  });
});

describe('daily summary and score', () => {
  const dates = ['2026-01-01', '2026-01-02'];
  it('adds up each log type on the right day', () => {
    const m = summarize({
      ...noRows,
      foodLogs: [{ id: '1', updatedAt: 0, date: dates[0], meal: 'lunch', name: 'x', amount: '', kcal: 500, protein: 20, carbs: 60, fat: 10, fiber: 5 }, { id: '2', updatedAt: 0, date: dates[0], meal: 'dinner', name: 'y', amount: '', kcal: 300, protein: 10, carbs: 30, fat: 5, fiber: 2 }],
      water: [{ id: '3', updatedAt: 0, date: dates[1], ml: 250, at: 0 }],
      sleep: [{ id: '4', updatedAt: 0, date: dates[1], bed: '23:00', wake: '06:30', quality: 4, napMin: 30 }],
    }, person, dates);
    expect(m.get(dates[0])!.kcal).toBe(800);
    expect(m.get(dates[0])!.protein).toBe(30);
    expect(m.get(dates[1])!.waterMl).toBe(250);
    expect(m.get(dates[1])!.sleepMin).toBe(480);
    expect(m.get(dates[1])!.kcal).toBe(0);
  });
  it('ignores a workout with nothing completed', () => {
    const m = summarize({ ...noRows, workouts: [{ id: 'w', updatedAt: 0, date: dates[0], name: 'x', exercises: [{ exerciseId: 'a', name: 'a', kind: 'reps', category: 'strength', primary: [], sets: [{ reps: 5, done: false }] }] }] }, person, dates);
    expect(m.get(dates[0])!.workouts).toBe(0);
  });
  it('counts a habit only when its target is reached', () => {
    const habit = { id: 'h', updatedAt: 0, name: 'Read', icon: 'x', days: [0, 1, 2, 3, 4, 5, 6], target: 2, order: 0 };
    const m = summarize({ ...noRows, habits: [habit], habitLogs: [{ id: 'a', updatedAt: 0, habitId: 'h', date: dates[0], value: 1 }, { id: 'b', updatedAt: 0, habitId: 'h', date: dates[1], value: 2 }] }, person, dates);
    expect(m.get(dates[0])!.habitsDone).toBe(0);
    expect(m.get(dates[1])!.habitsDone).toBe(1);
    expect(m.get(dates[1])!.habitsDue).toBe(1);
  });
  it('rewards landing near the calorie goal, in both directions', () => {
    expect(foodProgress(0, 2000)).toBe(0);
    expect(foodProgress(2000, 2000)).toBe(1);
    expect(foodProgress(1850, 2000)).toBe(1);
    expect(foodProgress(2150, 2000)).toBe(1);
    expect(foodProgress(1000, 2000)).toBe(0.5);
    expect(foodProgress(4000, 2000)).toBe(0);
  });
  it('does not penalise a rest day with no workout planned', () => {
    const rest = { ...emptyDay('2026-01-01'), waterMl: 2500, sleepMin: 480, steps: 8000, kcal: 2000 };
    expect(pillars(rest, goals).map((p) => p.key)).not.toContain('workout');
    expect(dayScore(rest, goals)).toBe(100);
    expect(dayScore({ ...rest, workoutPlanned: true }, goals)).toBe(80);
  });
});

describe('streaks', () => {
  const mk = (rows: [string, Partial<DaySummary>][]) => new Map(rows.map(([d, p]) => [d, { ...emptyDay(d), ...p }]));
  const met = (d: DaySummary) => d.waterMl > 0;
  it('counts back from today when today is met', () => {
    const m = mk([['2026-01-01', { waterMl: 1 }], ['2026-01-02', { waterMl: 1 }], ['2026-01-03', { waterMl: 1 }]]);
    expect(streakOf(m, '2026-01-03', met)).toBe(3);
  });
  it('keeps the streak alive while today is still unfinished', () => {
    const m = mk([['2026-01-01', { waterMl: 1 }], ['2026-01-02', { waterMl: 1 }], ['2026-01-03', {}]]);
    expect(streakOf(m, '2026-01-03', met)).toBe(2);
  });
  it('resets after a missed day', () => {
    const m = mk([['2026-01-01', { waterMl: 1 }], ['2026-01-02', {}], ['2026-01-03', { waterMl: 1 }]]);
    expect(streakOf(m, '2026-01-03', met)).toBe(1);
    expect(bestStreak(m, met)).toBe(1);
  });
  it('finds the best streak anywhere in history', () => {
    const m = mk([['2026-01-01', { waterMl: 1 }], ['2026-01-02', { waterMl: 1 }], ['2026-01-03', { waterMl: 1 }], ['2026-01-04', {}], ['2026-01-05', { waterMl: 1 }]]);
    expect(bestStreak(m, met)).toBe(3);
  });
  it('judges workouts by the week, not the day', () => {
    // Monday 2026-10-26 week has 2 workouts so far, previous week had 3, one before that had 1.
    const rows: [string, Partial<DaySummary>][] = dateRange('2026-10-05', '2026-10-30').map((d) => [d, {}]);
    const m = mk(rows);
    for (const d of ['2026-10-26', '2026-10-28', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-13']) m.get(d)!.workouts = 1;
    // Current week below target contributes 0 but does not end the run of past weeks.
    expect(weeklyWorkoutStreak(m, '2026-10-30', 3, 1)).toBe(1);
    expect(weeklyWorkoutStreak(m, '2026-10-30', 2, 1)).toBe(2);
  });
});

describe('planner recurrence', () => {
  const plan: Plan = { id: 'p', updatedAt: 0, kind: 'workout', title: 'Push', weekdays: [1, 4], from: '2026-10-26', doneDates: [], skipDates: ['2026-11-02'] };
  it('repeats on chosen weekdays, from the start date, except skipped days', () => {
    expect(planOccursOn(plan, '2026-10-26')).toBe(true); // Monday
    expect(planOccursOn(plan, '2026-10-29')).toBe(true); // Thursday
    expect(planOccursOn(plan, '2026-10-27')).toBe(false); // Tuesday
    expect(planOccursOn(plan, '2026-10-19')).toBe(false); // before start
    expect(planOccursOn(plan, '2026-11-02')).toBe(false); // skipped
  });
  it('handles a one-off date', () => {
    expect(planOccursOn({ ...plan, weekdays: undefined, date: '2026-12-25', skipDates: [] }, '2026-12-25')).toBe(true);
    expect(planOccursOn({ ...plan, weekdays: undefined, date: '2026-12-25', skipDates: [] }, '2026-12-26')).toBe(false);
  });
});

describe('insights', () => {
  it('stays quiet without enough data, then reports a real difference', () => {
    const day = (d: string, p: Partial<DaySummary>) => ({ ...emptyDay(d), ...p });
    expect(insights([day('2026-01-01', { sleepMin: 400 })], goals)).toEqual([]);
    const days = dateRange('2026-01-01', '2026-01-28').map((d, i) => {
      const weekend = [0, 6].includes(parse(d).getDay());
      return day(d, { steps: weekend ? 12000 : 5000, sleepMin: 450 + i });
    });
    expect(insights(days, goals).map((x) => x.text).join()).toMatch(/7,000 steps more on weekends/);
  });
});

describe('search', () => {
  const rows = [
    { name: 'Pushups', extra: 'chest body only' },
    { name: 'Barbell Bench Press - Medium Grip', extra: 'chest barbell' },
    { name: 'Dumbbell Bench Press', extra: 'chest dumbbell' },
    { name: 'Crunches', extra: 'abdominals' },
    { name: 'Roti (whole wheat)', extra: 'chapati phulka' },
  ];
  const idx = index(rows, (r) => r.name, (r) => r.extra);
  const first = (q: string) => search(idx, q)[0]?.name;
  it('ignores spacing and punctuation', () => {
    expect(first('push up')).toBe('Pushups');
    expect(first('push-ups')).toBe('Pushups');
    expect(first('PUSHUP')).toBe('Pushups');
  });
  it('matches shorthand, aliases and muscles', () => {
    expect(first('db bench')).toBe('Dumbbell Bench Press');
    expect(first('abs')).toBe('Crunches');
    expect(first('chapati')).toBe('Roti (whole wheat)');
  });
  it('tolerates typos', () => {
    expect(first('crunchess')).toBe('Crunches');
    expect(first('benchh pres')).toBeTruthy();
  });
  it('returns nothing for nonsense', () => {
    expect(search(idx, 'zzzzzz')).toEqual([]);
  });
});

describe('packaged food data', () => {
  const base = { code: '1', product_name: 'Biscuit' };
  it('reads energy, falling back from kJ to kcal', () => {
    expect(fromOff({ ...base, nutriments: { 'energy-kcal_100g': 450, proteins_100g: 7, carbohydrates_100g: 77, fat_100g: 13 } })!.kcal).toBe(450);
    expect(fromOff({ ...base, nutriments: { energy_100g: 1883, proteins_100g: 7, carbohydrates_100g: 77, fat_100g: 13 } })!.kcal).toBe(450);
  });
  it('corrects an impossible energy value from the macros', () => {
    expect(fromOff({ ...base, nutriments: { 'energy-kcal_100g': 3, proteins_100g: 6.9, carbohydrates_100g: 77.3, fat_100g: 13 } })!.kcal).toBe(454);
  });
  it('skips products with no name or no nutrition', () => {
    expect(fromOff({ code: '1', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull();
    expect(fromOff({ ...base, nutriments: {} })).toBeNull();
  });
});

describe('sync merge', () => {
  const a = (id: string, updatedAt: number, extra = {}) => ({ id, updatedAt, ...extra });
  it('keeps the newest version of each row', () => {
    const { merged, toWrite } = mergeRows([a('1', 5, { v: 'local' }), a('2', 9, { v: 'local' })], [a('1', 7, { v: 'remote' }), a('2', 3, { v: 'remote' }), a('3', 1, { v: 'remote' })]);
    const byId = Object.fromEntries(merged.map((r) => [r.id, r])) as unknown as Record<string, { v: string }>;
    expect(byId['1'].v).toBe('remote');
    expect(byId['2'].v).toBe('local');
    expect(byId['3'].v).toBe('remote');
    expect(toWrite).toHaveLength(2);
  });
  it('lets a newer delete beat an older edit, and a newer edit beat an older delete', () => {
    expect(mergeRows([a('1', 5)], [a('1', 6, { deleted: 1 })]).merged[0].deleted).toBe(1);
    expect(mergeRows([a('1', 6, { deleted: 1 })], [a('1', 7)]).merged[0].deleted).toBeUndefined();
  });
  it('is idempotent, so repeat syncs change nothing', () => {
    const remote = [a('1', 5), a('2', 6)];
    expect(mergeRows(mergeRows([], remote).merged, remote).toWrite).toEqual([]);
  });
  it('rejects files that are not Daylyt backups', () => {
    expect(() => validateSnapshot({ foo: 1 })).toThrow();
    expect(() => validateSnapshot(null)).toThrow();
    expect(() => validateSnapshot({ app: 'daylyt', version: 1, exportedAt: 0, tables: {} })).not.toThrow();
  });
});

describe('bundled data', () => {
  const exercises = JSON.parse(readFileSync('public/data/exercises.json', 'utf8')) as Exercise[];
  const ids = new Set(withExtras(exercises).map((e) => e.id));
  it('has unique ids', () => {
    expect(new Set(EXTRA_EXERCISES.map((e) => e.id)).size).toBe(EXTRA_EXERCISES.length);
    expect(new Set(CURATED_FOODS.map((f) => f.id)).size).toBe(CURATED_FOODS.length);
  });
  it('every program points at an exercise that exists', () => {
    for (const p of PROGRAMS) {
      expect(p.schedule.length).toBe(p.days.length);
      for (const d of p.days) for (const e of d.exercises) expect(ids.has(e.id), `${p.id}: ${e.id}`).toBe(true);
    }
  });
  it('curated food energy roughly agrees with its macros', () => {
    for (const f of CURATED_FOODS) {
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9;
      // Alcohol and very low-calorie items carry energy macros don't explain.
      if (f.kcal < 40 || /whisky|beer|wine/i.test(f.name)) continue;
      expect(Math.abs(fromMacros - f.kcal) / f.kcal, f.name).toBeLessThan(0.3);
    }
  });
});
