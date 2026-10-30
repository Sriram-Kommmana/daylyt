// Builds public/data/exercises.json from the public-domain free-exercise-db.
// Usage: node scripts/build-exercises.mjs [path-to-local-exercises.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const local = process.argv[2];
const raw = local ? JSON.parse(await readFile(local, 'utf8')) : await (await fetch(SOURCE)).json();

const TIMED = /\b(plank|hold|wall sit|hang)\b/i;
const out = raw.map((e) => ({
  id: e.id,
  name: e.name,
  category: e.category,
  primary: e.primaryMuscles ?? [],
  secondary: e.secondaryMuscles ?? [],
  equipment: e.equipment ?? 'other',
  level: e.level ?? 'beginner',
  instructions: e.instructions ?? [],
  images: e.images ?? [],
  kind: e.category === 'cardio' ? 'cardio' : e.category === 'stretching' || TIMED.test(e.name) ? 'time' : 'reps',
}));

await mkdir('public/data', { recursive: true });
await writeFile('public/data/exercises.json', JSON.stringify(out));
console.log(`Wrote ${out.length} exercises`);
