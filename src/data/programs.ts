// Ready-made training programs. Each day is a routine; `schedule` maps days onto weekdays (0 = Sunday)
// when the user applies a program in the planner.

export interface ProgramExercise {
  id: string;
  sets: number;
  reps?: number;
  sec?: number;
}

export interface ProgramDay {
  name: string;
  exercises: ProgramExercise[];
}

export interface Program {
  id: string;
  name: string;
  description: string;
  level: string;
  equipment: string;
  days: ProgramDay[];
  /** One list of weekdays per program day. */
  schedule: number[][];
}

const ex = (id: string, sets: number, reps: number): ProgramExercise => ({ id, sets, reps });
const hold = (id: string, sets: number, sec: number): ProgramExercise => ({ id, sets, sec });

export const PROGRAMS: Program[] = [
  {
    id: 'home-beginner',
    name: 'Home starter',
    description: 'Three short full-body sessions with no equipment. A good first month.',
    level: 'Beginner',
    equipment: 'None',
    days: [
      { name: 'Home full body', exercises: [ex('Bodyweight_Squat', 3, 12), ex('Pushups', 3, 8), ex('Bodyweight_Walking_Lunge', 2, 10), ex('x_glute_bridge', 3, 12), hold('Plank', 3, 30), ex('x_jumping_jacks', 2, 25)] },
    ],
    schedule: [[1, 3, 5]],
  },
  {
    id: 'home-builder',
    name: 'Home builder',
    description: 'Upper, lower and core work on four days, using only your bodyweight.',
    level: 'Intermediate',
    equipment: 'None, or a pull-up bar',
    days: [
      { name: 'Home upper', exercises: [ex('Pushups', 4, 15), ex('x_pike_push_up', 3, 10), ex('Bench_Dips', 3, 12), ex('x_diamond_push_up', 3, 10), ex('Pullups', 3, 6)] },
      { name: 'Home lower and core', exercises: [ex('x_hindu_squat_baithak', 4, 25), ex('x_reverse_lunge', 3, 12), ex('Single_Leg_Glute_Bridge', 3, 12), ex('x_calf_raises_bodyweight', 3, 20), ex('x_leg_raises', 3, 12), hold('x_side_plank', 2, 40)] },
    ],
    schedule: [[1, 4], [2, 5]],
  },
  {
    id: 'gym-full-body',
    name: 'Full body, 3 days',
    description: 'The simplest effective gym plan: big lifts three times a week.',
    level: 'Beginner',
    equipment: 'Gym',
    days: [
      { name: 'Full body A', exercises: [ex('Barbell_Squat', 3, 8), ex('Barbell_Bench_Press_-_Medium_Grip', 3, 8), ex('Bent_Over_Barbell_Row', 3, 10), ex('Side_Lateral_Raise', 2, 12), hold('Plank', 3, 40)] },
      { name: 'Full body B', exercises: [ex('Romanian_Deadlift', 3, 10), ex('Standing_Military_Press', 3, 8), ex('Wide-Grip_Lat_Pulldown', 3, 10), ex('Leg_Press', 3, 12), ex('Crunches', 3, 15)] },
    ],
    schedule: [[1, 5], [3]],
  },
  {
    id: 'upper-lower',
    name: 'Upper / lower',
    description: 'Four days split between upper and lower body for steady strength and size.',
    level: 'Intermediate',
    equipment: 'Gym',
    days: [
      { name: 'Upper body', exercises: [ex('Barbell_Bench_Press_-_Medium_Grip', 4, 8), ex('Bent_Over_Barbell_Row', 4, 8), ex('Dumbbell_Shoulder_Press', 3, 10), ex('Wide-Grip_Lat_Pulldown', 3, 10), ex('Barbell_Curl', 2, 12), ex('Triceps_Pushdown', 2, 12)] },
      { name: 'Lower body', exercises: [ex('Barbell_Squat', 4, 8), ex('Romanian_Deadlift', 3, 10), ex('Leg_Press', 3, 12), ex('Lying_Leg_Curls', 3, 12), ex('Standing_Calf_Raises', 4, 15), ex('Hanging_Leg_Raise', 3, 12)] },
    ],
    schedule: [[1, 4], [2, 5]],
  },
  {
    id: 'ppl',
    name: 'Push / pull / legs',
    description: 'The classic six-day bodybuilding split for experienced lifters.',
    level: 'Advanced',
    equipment: 'Gym',
    days: [
      { name: 'Push', exercises: [ex('Barbell_Bench_Press_-_Medium_Grip', 4, 8), ex('Standing_Military_Press', 3, 10), ex('Incline_Dumbbell_Press', 3, 10), ex('Side_Lateral_Raise', 3, 15), ex('Cable_Crossover', 3, 12), ex('Triceps_Pushdown', 3, 12)] },
      { name: 'Pull', exercises: [ex('Barbell_Deadlift', 3, 5), ex('Pullups', 3, 8), ex('Seated_Cable_Rows', 3, 10), ex('Face_Pull', 3, 15), ex('Barbell_Curl', 3, 10), ex('Hammer_Curls', 3, 12)] },
      { name: 'Legs', exercises: [ex('Barbell_Squat', 4, 8), ex('Romanian_Deadlift', 3, 10), ex('Leg_Press', 3, 12), ex('Leg_Extensions', 3, 15), ex('Lying_Leg_Curls', 3, 12), ex('Standing_Calf_Raises', 4, 15)] },
    ],
    schedule: [[1, 4], [2, 5], [3, 6]],
  },
  {
    id: 'cardio-base',
    name: 'Cardio base',
    description: 'Build fitness with walks, jogs and intervals. Add any sport you enjoy.',
    level: 'Beginner',
    equipment: 'None',
    days: [
      { name: 'Easy cardio', exercises: [hold('x_walking_brisk', 1, 1800)] },
      { name: 'Jog', exercises: [hold('x_jogging', 1, 1500)] },
      { name: 'Intervals', exercises: [hold('x_sprints_or_interval_running', 1, 900), hold('x_walking_moderate', 1, 600)] },
    ],
    schedule: [[1], [3], [6]],
  },
  {
    id: 'yoga-daily',
    name: 'Daily yoga and mobility',
    description: 'A calm 20 minutes each morning for mobility and recovery.',
    level: 'Beginner',
    equipment: 'Mat',
    days: [
      { name: 'Morning yoga', exercises: [ex('x_surya_namaskar', 1, 12), hold('x_hatha_yoga', 1, 600), hold('x_pranayama', 1, 300)] },
    ],
    schedule: [[0, 1, 2, 3, 4, 5, 6]],
  },
];
