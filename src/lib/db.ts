import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { addDays, dateRange, today } from './date';
import { suggestGoals } from './calc';
import { summarize, type RangeRows } from './summary';
import type {
  ActivityLog, BodyLog, CustomExercise, CustomFood, FocusLog, FoodLog, Habit, HabitLog, JournalEntry, Plan, Rec, Routine,
  SavedMeal, Settings, SleepLog, Task, WaterLog, Workout,
} from './types';

class DaylytDB extends Dexie {
  settings!: Table<Settings, string>;
  workouts!: Table<Workout, string>;
  routines!: Table<Routine, string>;
  customExercises!: Table<CustomExercise, string>;
  customFoods!: Table<CustomFood, string>;
  foodLogs!: Table<FoodLog, string>;
  water!: Table<WaterLog, string>;
  sleep!: Table<SleepLog, string>;
  activity!: Table<ActivityLog, string>;
  body!: Table<BodyLog, string>;
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  tasks!: Table<Task, string>;
  focus!: Table<FocusLog, string>;
  plans!: Table<Plan, string>;
  journal!: Table<JournalEntry, string>;
  savedMeals!: Table<SavedMeal, string>;
  /** Rows changed here that the database hasn't confirmed yet. */
  outbox!: Table<OutboxItem, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('daylyt');
    this.version(1).stores({
      settings: 'id',
      workouts: 'id,date',
      routines: 'id',
      customExercises: 'id',
      customFoods: 'id',
      foodLogs: 'id,date',
      water: 'id,date',
      sleep: 'id,date',
      activity: 'id,date',
      body: 'id,date',
      habits: 'id',
      habitLogs: 'id,date,habitId',
      tasks: 'id,date',
      focus: 'id,date',
      plans: 'id,date',
      journal: 'id,date',
    });
    this.version(2).stores({ outbox: 'key', meta: 'key' });
    this.version(3).stores({ savedMeals: 'id' });
  }
}

interface OutboxItem {
  key: string;
  table: TableName;
  id: string;
}

export const db = new DaylytDB();

export const TABLES = [
  'settings', 'workouts', 'routines', 'customExercises', 'customFoods', 'foodLogs', 'water', 'sleep', 'activity', 'body',
  'habits', 'habitLogs', 'tasks', 'focus', 'plans', 'journal', 'savedMeals',
] as const;
export type TableName = (typeof TABLES)[number];

export const uid = () => crypto.randomUUID();

type Listener = () => void;
const listeners = new Set<Listener>();
/** Sync subscribes here so it can push shortly after any local write. */
export const onLocalChange = (fn: Listener) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const changed = () => listeners.forEach((fn) => fn());

// The generic is loose on purpose: each table's row type is enforced at the call site.
const table = (name: TableName) => db[name] as unknown as Table<Rec, string>;

const outboxKey = (name: TableName, id: string) => `${name}|${id}`;

/** Queues rows for the database. Sign-in uses this to send up what was logged before it. */
export async function markDirty(name: TableName, ids: string[]) {
  if (!ids.length) return;
  await db.outbox.bulkPut(ids.map((id) => ({ key: outboxKey(name, id), table: name, id })));
  changed();
}

export async function save<T extends Rec>(name: TableName, row: Omit<T, 'id' | 'updatedAt'> & { id?: string }): Promise<T> {
  const full = { ...row, id: row.id ?? uid(), updatedAt: Date.now() } as unknown as T;
  // One transaction, so a crash can't leave a saved row that never gets queued.
  await db.transaction('rw', table(name), db.outbox, async () => {
    await table(name).put(full);
    await db.outbox.put({ key: outboxKey(name, full.id), table: name, id: full.id });
  });
  changed();
  return full;
}

/** Deletes leave a tombstone so the deletion also reaches the database and other devices. */
export async function remove(name: TableName, id: string) {
  await db.transaction('rw', table(name), db.outbox, async () => {
    await table(name).update(id, { deleted: 1, updatedAt: Date.now() });
    await db.outbox.put({ key: outboxKey(name, id), table: name, id });
  });
  changed();
}

export const getMeta = async <T,>(key: string) => (await db.meta.get(key))?.value as T | undefined;
export const setMeta = (key: string, value: unknown) => db.meta.put({ key, value });

/** Empties this device's copy. It does not touch the database. */
export async function clearLocal() {
  await Promise.all([...TABLES.map((t) => db[t].clear()), db.outbox.clear(), db.meta.clear()]);
}

export const alive = <T extends Rec>(rows: T[]) => rows.filter((r) => !r.deleted);

export const defaultSettings = (): Settings => {
  const base = { sex: 'male', birthYear: new Date().getFullYear() - 25, heightCm: 170, weightKg: 70, activity: 1.375, goalType: 'maintain' } as const;
  return {
    id: 'me', updatedAt: 0, onboarded: false, name: '', ...base, goals: suggestGoals(base), weightUnit: 'kg', glassMl: 250, restSec: 90,
    focusLen: 25, breakLen: 5, theme: 'system', weekStart: 1, eatBack: false,
  };
};

export const useSettings = () => {
  const row = useLiveQuery(() => db.settings.get('me'), []);
  return useMemo(() => (row ? { ...defaultSettings(), ...row } : undefined), [row]);
};

export async function loadRows(start: string, end: string): Promise<RangeRows> {
  const between = <T extends Rec>(t: Table<T, string>) => t.where('date').between(start, end, true, true).toArray().then(alive);
  const [workouts, foodLogs, water, sleep, activity, focus, journal, habitLogs] = await Promise.all([
    between(db.workouts), between(db.foodLogs), between(db.water), between(db.sleep), between(db.activity), between(db.focus),
    between(db.journal), between(db.habitLogs),
  ]);
  const [body, habits, tasks, plans] = await Promise.all([
    db.body.toArray().then(alive), db.habits.toArray().then(alive), db.tasks.toArray().then(alive), db.plans.toArray().then(alive),
  ]);
  return { workouts, foodLogs, water, sleep, activity, body, habits, habitLogs, tasks, focus, plans, journal };
}

/** Live per-day summaries for a date range. Re-renders on any write to the underlying tables. */
export function useSummaries(start: string, end: string, settings?: Settings) {
  return useLiveQuery(async () => {
    if (!settings) return undefined;
    const rows = await loadRows(start, end);
    return summarize(rows, settings, dateRange(start, end));
  }, [start, end, settings]);
}

/** Enough history that streaks are correct: four years back from today. */
export const STREAK_WINDOW = 1461;
export const useStreakDays = (settings?: Settings) => {
  const end = today();
  return useSummaries(addDays(end, -STREAK_WINDOW), end, settings);
};

export const useLive = <T,>(fn: () => Promise<T>, deps: unknown[] = []) => useLiveQuery(fn, deps);

export const allAlive = <T extends Rec>(t: Table<T, string>) => t.toArray().then(alive);
export const onDate = <T extends Rec>(t: Table<T, string>, date: string) => t.where('date').equals(date).toArray().then(alive);
