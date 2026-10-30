/** Every synced row carries these. `deleted` is a tombstone so deletes survive a merge. */
export interface Rec {
  id: string;
  updatedAt: number;
  deleted?: 1;
}

export type ExerciseKind = 'reps' | 'time' | 'cardio';

export interface Exercise {
  id: string;
  name: string;
  category: string;
  primary: string[];
  secondary: string[];
  equipment: string;
  level: string;
  instructions: string[];
  images: string[];
  kind: ExerciseKind;
  /** Metabolic equivalent, when the activity has a known one. */
  met?: number;
  aliases?: string;
  custom?: boolean;
}

export interface WorkoutSet {
  reps?: number;
  /** Always stored in kg. */
  weight?: number;
  sec?: number;
  km?: number;
  done: boolean;
  warmup?: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  name: string;
  kind: ExerciseKind;
  category: string;
  primary: string[];
  met?: number;
  note?: string;
  sets: WorkoutSet[];
}

export interface Workout extends Rec {
  date: string;
  name: string;
  startedAt?: number;
  endedAt?: number;
  /** Manual duration; overrides the timer. */
  minutes?: number;
  kcalOverride?: number;
  note?: string;
  planId?: string;
  exercises: WorkoutExercise[];
}

export interface Routine extends Rec {
  name: string;
  note?: string;
  exercises: WorkoutExercise[];
}

export interface CustomExercise extends Rec, Omit<Exercise, 'id'> {}

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Serving {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  aliases?: string;
  /** All nutrient values are per 100 g. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  servings: Serving[];
  source: 'curated' | 'usda' | 'custom' | 'off';
  brand?: string;
}

export interface CustomFood extends Rec, Omit<Food, 'id' | 'source'> {
  source: 'custom' | 'off';
}

export interface FoodLog extends Rec {
  date: string;
  meal: Meal;
  foodId?: string;
  name: string;
  /** Human-readable amount, e.g. "2 × 1 roti (40 g)". */
  amount: string;
  grams?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface WaterLog extends Rec {
  date: string;
  ml: number;
  at: number;
}

/** `date` is the day you woke up, so a night belongs to the morning it ended. */
export interface SleepLog extends Rec {
  date: string;
  bed: string;
  wake: string;
  quality: number;
  napMin?: number;
  note?: string;
}

/** Id is the date: one row per day. */
export interface ActivityLog extends Rec {
  date: string;
  steps: number;
  /** Other active minutes not covered by a logged workout. */
  activeMin?: number;
  /** Overrides the distance estimated from steps. */
  km?: number;
}

export interface BodyLog extends Rec {
  date: string;
  kg: number;
  bodyFat?: number;
  waistCm?: number;
}

export interface Habit extends Rec {
  name: string;
  icon: string;
  /** Weekdays it is due on: 0 = Sunday. */
  days: number[];
  target: number;
  unit?: string;
  order: number;
  archived?: boolean;
}

export interface HabitLog extends Rec {
  habitId: string;
  date: string;
  value: number;
}

export type Priority = 1 | 2 | 3;

export interface Task extends Rec {
  title: string;
  date?: string;
  time?: string;
  priority: Priority;
  done: boolean;
  doneAt?: number;
  note?: string;
}

export interface FocusLog extends Rec {
  date: string;
  minutes: number;
  label?: string;
  at: number;
}

export type PlanKind = 'workout' | 'meal' | 'other';

export interface PlanMealItem {
  name: string;
  amount: string;
  meal: Meal;
  foodId?: string;
  grams?: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Plan extends Rec {
  kind: PlanKind;
  title: string;
  time?: string;
  note?: string;
  /** One-off date, or… */
  date?: string;
  /** …weekly repeat on these weekdays (0 = Sunday), starting from `from`. */
  weekdays?: number[];
  from?: string;
  until?: string;
  routineId?: string;
  meals?: PlanMealItem[];
  doneDates: string[];
  skipDates: string[];
}

export interface JournalEntry extends Rec {
  date: string;
  mood?: number;
  energy?: number;
  note?: string;
}

export interface Goals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  waterMl: number;
  sleepMin: number;
  steps: number;
  focusMin: number;
  workoutsPerWeek: number;
}

export type GoalType = 'lose' | 'maintain' | 'gain';

export interface Settings extends Rec {
  onboarded: boolean;
  name: string;
  sex: 'male' | 'female';
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: number;
  goalType: GoalType;
  targetKg?: number;
  goals: Goals;
  weightUnit: 'kg' | 'lb';
  glassMl: number;
  restSec: number;
  focusLen: number;
  breakLen: number;
  theme: 'system' | 'light' | 'dark';
  weekStart: 0 | 1;
  /** Add workout calories back to the food budget. */
  eatBack: boolean;
}

export interface DaySummary {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  waterMl: number;
  sleepMin: number;
  sleepQuality: number;
  steps: number;
  km: number;
  activeMin: number;
  workouts: number;
  sets: number;
  volume: number;
  workoutKcal: number;
  stepKcal: number;
  habitsDone: number;
  habitsDue: number;
  tasksDone: number;
  focusMin: number;
  weightKg?: number;
  mood?: number;
  energy?: number;
  workoutPlanned: boolean;
  logged: boolean;
}

export type PillarKey = 'food' | 'water' | 'sleep' | 'steps' | 'workout' | 'habits' | 'focus';

export interface Pillar {
  key: PillarKey;
  label: string;
  progress: number;
  met: boolean;
}
