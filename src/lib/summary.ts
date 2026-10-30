import { addDays, daysBetween, sleepMinutes, weekStartOf, weekday } from './date';
import { stepsToKcal, stepsToKm, workoutKcal, workoutMinutes, workoutSets, workoutVolume } from './calc';
import type {
  ActivityLog, BodyLog, DaySummary, FocusLog, FoodLog, Goals, Habit, HabitLog, JournalEntry, Pillar, Plan, Settings,
  SleepLog, Task, WaterLog, Workout,
} from './types';

export interface RangeRows {
  workouts: Workout[];
  foodLogs: FoodLog[];
  water: WaterLog[];
  sleep: SleepLog[];
  activity: ActivityLog[];
  body: BodyLog[];
  habits: Habit[];
  habitLogs: HabitLog[];
  tasks: Task[];
  focus: FocusLog[];
  plans: Plan[];
  journal: JournalEntry[];
}

export const emptyDay = (date: string): DaySummary => ({
  date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, waterMl: 0, sleepMin: 0, sleepQuality: 0, steps: 0, km: 0,
  activeMin: 0, workouts: 0, sets: 0, volume: 0, workoutKcal: 0, stepKcal: 0, habitsDone: 0, habitsDue: 0, tasksDone: 0,
  focusMin: 0, workoutPlanned: false, logged: false,
});

export function planOccursOn(p: Plan, date: string) {
  if (p.skipDates?.includes(date)) return false;
  if (p.date) return p.date === date;
  if (!p.weekdays?.includes(weekday(date))) return false;
  if (p.from && date < p.from) return false;
  if (p.until && date > p.until) return false;
  return true;
}

export const habitDueOn = (h: Habit, date: string) => !h.archived && h.days.includes(weekday(date));

/** Rolls raw rows into one summary per date. Pure, so the same code drives Today, Stats and streaks. */
export function summarize(rows: RangeRows, settings: Pick<Settings, 'weightKg' | 'heightCm'>, dates: string[]) {
  const days = new Map<string, DaySummary>(dates.map((d) => [d, emptyDay(d)]));
  const at = (date: string) => days.get(date);

  // Calories use the most recent known body weight, not just the profile value.
  const weights = [...rows.body].sort((a, b) => a.date.localeCompare(b.date));
  const weightOn = (date: string) => {
    let kg = settings.weightKg;
    for (const b of weights) {
      if (b.date > date) break;
      kg = b.kg;
    }
    return kg;
  };

  for (const r of rows.foodLogs) {
    const d = at(r.date);
    if (!d) continue;
    d.kcal += r.kcal; d.protein += r.protein; d.carbs += r.carbs; d.fat += r.fat; d.fiber += r.fiber;
    d.logged = true;
  }
  for (const r of rows.water) {
    const d = at(r.date);
    if (d) { d.waterMl += r.ml; d.logged = true; }
  }
  for (const r of rows.sleep) {
    const d = at(r.date);
    if (d) {
      d.sleepMin += sleepMinutes(r.bed, r.wake) + (r.napMin ?? 0);
      d.sleepQuality = r.quality;
      d.logged = true;
    }
  }
  for (const r of rows.activity) {
    const d = at(r.date);
    if (!d) continue;
    d.steps = r.steps;
    d.km = r.km ?? stepsToKm(r.steps, settings.heightCm);
    d.activeMin += r.activeMin ?? 0;
    d.stepKcal = stepsToKcal(r.steps, weightOn(r.date));
    if (r.steps || r.activeMin) d.logged = true;
  }
  for (const w of rows.workouts) {
    const d = at(w.date);
    if (!d) continue;
    const sets = workoutSets(w);
    if (!sets && !w.exercises.some((e) => e.sets.some((s) => s.done)) && w.kcalOverride == null) continue;
    d.workouts += 1;
    d.sets += sets;
    d.volume += workoutVolume(w);
    d.workoutKcal += workoutKcal(w, weightOn(w.date));
    d.activeMin += workoutMinutes(w);
    d.logged = true;
  }
  for (const r of rows.body) {
    const d = at(r.date);
    if (d) { d.weightKg = r.kg; d.logged = true; }
  }
  for (const r of rows.focus) {
    const d = at(r.date);
    if (d) { d.focusMin += r.minutes; d.logged = true; }
  }
  for (const r of rows.journal) {
    const d = at(r.date);
    if (d) { d.mood = r.mood; d.energy = r.energy; if (r.mood || r.note) d.logged = true; }
  }
  for (const t of rows.tasks) {
    if (!t.done || !t.doneAt) continue;
    const dt = new Date(t.doneAt);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const d = at(key);
    if (d) { d.tasksDone += 1; d.logged = true; }
  }

  const habitById = new Map(rows.habits.map((h) => [h.id, h]));
  for (const d of days.values()) {
    d.habitsDue = rows.habits.filter((h) => habitDueOn(h, d.date)).length;
    d.workoutPlanned = rows.plans.some((p) => p.kind === 'workout' && planOccursOn(p, d.date));
  }
  for (const r of rows.habitLogs) {
    const d = at(r.date);
    const h = habitById.get(r.habitId);
    if (d && h && !h.archived && r.value >= h.target) {
      d.habitsDone += 1;
      d.logged = true;
    }
  }
  return days;
}

/** Food counts as met when within 10% of target; going far either way loses credit. */
export function foodProgress(kcal: number, goal: number) {
  if (kcal <= 0 || goal <= 0) return 0;
  const ratio = kcal / goal;
  if (ratio <= 1) return ratio >= 0.9 ? 1 : ratio;
  return ratio <= 1.1 ? 1 : Math.max(0, 1 - (ratio - 1.1) * 2);
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The day's pillars. Workout, habits and focus only count when they apply to that day,
 * so a rest day is never penalised and nobody is punished for not having any habits yet.
 */
export function pillars(d: DaySummary, g: Goals): Pillar[] {
  const out: Pillar[] = [
    { key: 'food', label: 'Food', progress: foodProgress(d.kcal, g.kcal), met: foodProgress(d.kcal, g.kcal) >= 1 },
    { key: 'water', label: 'Water', progress: clamp(d.waterMl / g.waterMl), met: d.waterMl >= g.waterMl },
    { key: 'sleep', label: 'Sleep', progress: clamp(d.sleepMin / g.sleepMin), met: d.sleepMin >= g.sleepMin },
    { key: 'steps', label: 'Steps', progress: clamp(d.steps / g.steps), met: d.steps >= g.steps },
  ];
  if (d.workoutPlanned || d.workouts > 0) {
    out.push({ key: 'workout', label: 'Workout', progress: d.workouts > 0 ? 1 : 0, met: d.workouts > 0 });
  }
  if (d.habitsDue > 0) {
    out.push({ key: 'habits', label: 'Habits', progress: clamp(d.habitsDone / d.habitsDue), met: d.habitsDone >= d.habitsDue });
  }
  if (g.focusMin > 0 && d.focusMin > 0) {
    out.push({ key: 'focus', label: 'Focus', progress: clamp(d.focusMin / g.focusMin), met: d.focusMin >= g.focusMin });
  }
  return out;
}

export function dayScore(d: DaySummary, g: Goals) {
  const p = pillars(d, g);
  return p.length ? Math.round((p.reduce((s, x) => s + x.progress, 0) / p.length) * 100) : 0;
}

/**
 * Consecutive days a predicate held, ending today. Today not being met yet doesn't break the
 * streak: it still counts back from yesterday, because the day isn't over.
 */
export function streakOf(days: Map<string, DaySummary>, end: string, test: (d: DaySummary) => boolean) {
  let count = 0;
  let cursor = end;
  const first = days.get(end);
  if (first && !test(first)) cursor = addDays(end, -1);
  for (;;) {
    const d = days.get(cursor);
    if (!d || !test(d)) return count;
    count += 1;
    cursor = addDays(cursor, -1);
  }
}

export function bestStreak(days: Map<string, DaySummary>, test: (d: DaySummary) => boolean) {
  const sorted = [...days.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    const ok = test(days.get(date)!);
    if (ok && prev && daysBetween(prev, date) === 1) run += 1;
    else run = ok ? 1 : 0;
    best = Math.max(best, run);
    prev = date;
  }
  return best;
}

/** Workouts are judged per week: rest days are part of training, so a daily streak would be wrong. */
export function weeklyWorkoutStreak(days: Map<string, DaySummary>, end: string, perWeek: number, weekStart: 0 | 1) {
  if (perWeek <= 0) return 0;
  const count = (start: string) => {
    let n = 0;
    for (let i = 0; i < 7; i++) n += days.get(addDays(start, i))?.workouts ? 1 : 0;
    return n;
  };
  let cursor = weekStartOf(end, weekStart);
  let streak = count(cursor) >= perWeek ? 1 : 0;
  cursor = addDays(cursor, -7);
  while (days.has(cursor) || days.has(addDays(cursor, 6))) {
    if (count(cursor) < perWeek) break;
    streak += 1;
    cursor = addDays(cursor, -7);
  }
  return streak;
}

export const STREAK_TESTS: { key: string; label: string; test: (d: DaySummary, g: Goals) => boolean }[] = [
  { key: 'logged', label: 'Logging', test: (d) => d.logged },
  { key: 'water', label: 'Water goal', test: (d, g) => d.waterMl >= g.waterMl },
  { key: 'sleep', label: 'Sleep goal', test: (d, g) => d.sleepMin >= g.sleepMin },
  { key: 'steps', label: 'Step goal', test: (d, g) => d.steps >= g.steps },
  { key: 'food', label: 'Calories on target', test: (d, g) => foodProgress(d.kcal, g.kcal) >= 1 },
  { key: 'habits', label: 'All habits', test: (d) => d.habitsDue > 0 && d.habitsDone >= d.habitsDue },
];

export interface Insight {
  text: string;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Plain-language comparisons between behaviours. Needs enough days on both sides to be meaningful. */
export function insights(days: DaySummary[], g: Goals): Insight[] {
  const out: Insight[] = [];
  const MIN = 5;
  const compare = (
    groupA: DaySummary[], groupB: DaySummary[], val: (d: DaySummary) => number, threshold: number, say: (diff: number) => string,
  ) => {
    if (groupA.length < MIN || groupB.length < MIN) return;
    const diff = mean(groupA.map(val)) - mean(groupB.map(val));
    if (Math.abs(diff) >= threshold) out.push({ text: say(diff) });
  };
  const nextDay = new Map(days.map((d) => [d.date, d]));
  const slept = days.filter((d) => d.sleepMin > 0);

  compare(
    slept.filter((d) => nextDay.get(addDays(d.date, -1))?.workouts), slept.filter((d) => !nextDay.get(addDays(d.date, -1))?.workouts),
    (d) => d.sleepMin, 15,
    (m) => `You sleep ${Math.abs(Math.round(m))} minutes ${m > 0 ? 'longer' : 'less'} on nights after a workout.`,
  );
  const withFood = days.filter((d) => d.kcal > 0);
  const goodSleep = withFood.filter((d) => d.sleepMin >= g.sleepMin);
  const poorSleep = withFood.filter((d) => d.sleepMin > 0 && d.sleepMin < g.sleepMin);
  compare(goodSleep, poorSleep, (d) => d.kcal, 100, (k) => `You eat about ${Math.abs(Math.round(k))} kcal ${k > 0 ? 'more' : 'less'} on days after a full night's sleep.`);

  const moody = days.filter((d) => d.mood);
  compare(
    moody.filter((d) => d.workouts > 0), moody.filter((d) => !d.workouts), (d) => d.mood ?? 0, 0.3,
    (m) => `Your mood averages ${Math.abs(m).toFixed(1)} points ${m > 0 ? 'higher' : 'lower'} on workout days.`,
  );
  const focused = days.filter((d) => d.sleepMin > 0);
  compare(
    focused.filter((d) => d.sleepMin >= g.sleepMin), focused.filter((d) => d.sleepMin < g.sleepMin), (d) => d.focusMin, 10,
    (m) => `You focus ${Math.abs(Math.round(m))} minutes ${m > 0 ? 'more' : 'less'} after a full night's sleep.`,
  );
  compare(
    days.filter((d) => [0, 6].includes(weekday(d.date)) && d.steps), days.filter((d) => ![0, 6].includes(weekday(d.date)) && d.steps), (d) => d.steps, 1000,
    (s) => `You walk about ${Math.abs(Math.round(s)).toLocaleString()} steps ${s > 0 ? 'more' : 'fewer'} on weekends than on weekdays.`,
  );
  return out;
}
