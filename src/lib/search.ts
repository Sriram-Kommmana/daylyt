// Forgiving search shared by the exercise and food pickers: ignores spacing and punctuation
// ("pushup", "push-up" and "push ups" all match), knows common gym shorthand, and falls back
// to typo tolerance when nothing matches exactly.

const SYNONYMS: Record<string, string> = {
  abs: 'abdominals', core: 'abdominals', legs: 'quadriceps hamstrings', quads: 'quadriceps', hams: 'hamstrings', delts: 'shoulders',
  back: 'lats', bis: 'biceps', tris: 'triceps', db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ohp: 'shoulder press',
  rdl: 'romanian deadlift', bw: 'body only', bodyweight: 'body only', calisthenics: 'body only', treadmill: 'treadmill',
  cardio: 'cardio', skipping: 'rope jumping', gym: '',
};

export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

const singular = (t: string) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t);

export const tokens = (q: string) =>
  q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);

function editDistanceWithin(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

export interface Searchable<T> {
  item: T;
  name: string;
  squashedName: string;
  /** Lowercased name, aliases and tags. */
  haystack: string;
  squashedHay: string;
  words: string[];
}

export function index<T>(items: T[], name: (t: T) => string, extra: (t: T) => string): Searchable<T>[] {
  return items.map((item) => {
    const n = name(item);
    const haystack = `${n} ${extra(item)}`.toLowerCase();
    return { item, name: n, squashedName: squash(n), haystack, squashedHay: squash(haystack), words: haystack.split(/[^a-z0-9]+/).filter(Boolean).map(singular) };
  });
}

export function search<T>(idx: Searchable<T>[], query: string, boost?: (t: T) => number): T[] {
  const q = query.trim();
  if (!q) return idx.map((e) => e.item);
  const whole = squash(q);
  const expanded = tokens(q).flatMap((t) => {
    const syn = SYNONYMS[t];
    return syn === undefined ? [[t]] : syn === '' ? [] : [[t, ...tokens(syn)]];
  });

  const scored: { item: T; score: number }[] = [];
  for (const e of idx) {
    let score = 0;
    if (e.squashedName === whole) score = 100;
    else if (e.squashedName.startsWith(whole)) score = 80;
    else if (e.squashedName.includes(whole)) score = 60;
    else if (e.squashedHay.includes(whole)) score = 45;
    else if (expanded.length && expanded.every((alts) => alts.some((t) => e.squashedHay.includes(t)))) {
      score = expanded.every((alts) => alts.some((t) => e.squashedName.includes(t))) ? 50 : 30;
    }
    if (score) scored.push({ item: e.item, score: score - e.name.length / 200 + (boost?.(e.item) ?? 0) });
  }

  if (!scored.length && expanded.length) {
    // Nothing matched: allow one or two typos per word. Compare the words as typed, because
    // trimming a plural off a misspelling ("pres") would push it further from the real word.
    const typed = q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
    for (const e of idx) {
      const hit = typed.length > 0 && typed.every((t) => e.words.some((w) => editDistanceWithin(t, w, t.length >= 7 ? 2 : 1)));
      if (hit) scored.push({ item: e.item, score: 10 - e.name.length / 200 + (boost?.(e.item) ?? 0) });
    }
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.item);
}
