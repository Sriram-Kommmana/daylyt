import type { Food, FoodLog } from './types';

// Turns a food's nutrition per 100 g into something you can say the way you ate it:
// "2 rotis", "150 g", "1 katori", "half a cup".

export interface PortionUnit {
  key: string;
  label: string;
  /** Grams in one of this unit. */
  grams: number;
  /** A sensible starting amount and step for this unit. */
  start: number;
  step: number;
  /** A household estimate rather than a measurement for this particular food. */
  approx?: boolean;
  /** Amounts offered as one-tap shortcuts. */
  quick: number[];
}

const FRACTIONS = [0.5, 1, 1.5, 2, 3];

const MEASURES: PortionUnit[] = [
  { key: 'g', label: 'g', grams: 1, start: 100, step: 10, quick: [50, 100, 150, 200, 300] },
  { key: 'ml', label: 'ml', grams: 1, start: 200, step: 10, approx: true, quick: [100, 150, 200, 250, 500] },
  { key: 'oz', label: 'oz', grams: 28.35, start: 1, step: 0.5, quick: FRACTIONS },
];

// What these hold varies by food, so each is marked as an estimate.
const HOUSEHOLD: PortionUnit[] = [
  { key: 'katori', label: 'katori', grams: 150, start: 1, step: 0.5, approx: true, quick: FRACTIONS },
  { key: 'bowl', label: 'bowl', grams: 250, start: 1, step: 0.5, approx: true, quick: FRACTIONS },
  { key: 'plate', label: 'plate', grams: 300, start: 1, step: 0.5, approx: true, quick: FRACTIONS },
  { key: 'cup', label: 'cup', grams: 240, start: 1, step: 0.5, approx: true, quick: FRACTIONS },
  { key: 'glass', label: 'glass', grams: 250, start: 1, step: 0.5, approx: true, quick: FRACTIONS },
  { key: 'tbsp', label: 'tbsp', grams: 15, start: 1, step: 1, approx: true, quick: [1, 2, 3, 4, 5] },
  { key: 'tsp', label: 'tsp', grams: 5, start: 1, step: 1, approx: true, quick: [1, 2, 3, 4, 5] },
];

const parseCount = (text: string) => {
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(text);
};

const singular = (word: string) => {
  if (/(ss|us)$/.test(word) || word.length <= 3) return word;
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  return word.endsWith('s') ? word.slice(0, -1) : word;
};

/** Reads a serving such as "2 eggs" or "1/2 cup" into the single unit it describes. */
export function unitFromServing(label: string, grams: number, index = 0): PortionUnit | null {
  const m = label.trim().match(/^(\d+\/\d+|\d*\.?\d+)\s*(.*)$/);
  const count = m ? parseCount(m[1]) : 1;
  const rest = (m ? m[2] : label).trim();
  if (!count || !grams) return null;
  const isWeightOnly = !rest || /^(g|gm|gms|gram|grams|ml)\b\.?$/i.test(rest);
  if (isWeightOnly && Math.abs(grams - 100) < 0.01) return null; // "100 g" is what the g unit already is.
  const name = isWeightOnly ? 'serving' : rest.includes(' ') || rest.includes(',') ? rest : singular(rest);
  const start = isWeightOnly ? 1 : count;
  const perUnit = isWeightOnly ? grams : grams / count;
  return {
    key: `s${index}`,
    label: name,
    grams: perUnit,
    start,
    step: start >= 4 ? 1 : 0.5,
    quick: start >= 4 ? [start / 2, start, start * 1.5, start * 2].map((n) => Math.round(n)) : FRACTIONS,
  };
}

/** The food's own servings come first, because they're true for this food; then everything else. */
export function portionUnits(food: Pick<Food, 'servings'>): PortionUnit[] {
  const own: PortionUnit[] = [];
  food.servings.forEach((s, i) => {
    const u = unitFromServing(s.label, s.grams, i);
    if (u && !own.some((x) => x.label === u.label)) own.push(u);
  });
  const taken = own.map((u) => u.label.toLowerCase());
  const household = HOUSEHOLD.filter((h) => !taken.some((t) => t === h.label || t.startsWith(`${h.label},`) || t.startsWith(`${h.label} `)));
  return [...own, ...MEASURES, ...household];
}

const fmt = (n: number) => String(+n.toFixed(2));

const pluralize = (label: string, qty: number) => {
  if (qty <= 1 || label.includes(' ') || label.includes(',') || ['g', 'ml', 'oz', 'tbsp', 'tsp', 'katori'].includes(label)) return label;
  if (/(ch|sh|x|ss)$/.test(label)) return `${label}es`;
  return label.endsWith('s') ? label : `${label}s`;
};

/** "150 g", or "2 rotis (80 g)" so the weight behind a household amount is always visible. */
export function describeAmount(qty: number, unit: PortionUnit) {
  const text = `${fmt(qty)} ${pluralize(unit.label, qty)}`;
  return unit.key === 'g' ? text : `${text} (${Math.round(qty * unit.grams)} g)`;
}

/** Moving between weights keeps the amount; moving to a count starts at that unit's usual number. */
export function convertQty(qty: number, from: PortionUnit, to: PortionUnit) {
  const weights = ['g', 'ml', 'oz'];
  if (!weights.includes(to.key) || !qty) return to.start;
  const grams = qty * from.grams;
  return to.key === 'oz' ? +(grams / to.grams).toFixed(1) : Math.round(grams);
}

/** Rebuilds a food from an existing log entry, so its amount can be changed later. Null if it has no weight. */
export function foodFromLog(log: Pick<FoodLog, 'foodId' | 'name' | 'grams' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'>): Food | null {
  if (!log.grams) return null;
  const per100 = (v: number) => (v / log.grams!) * 100;
  return {
    id: log.foodId ?? `log_${log.name}`,
    name: log.name,
    kcal: per100(log.kcal), protein: per100(log.protein), carbs: per100(log.carbs), fat: per100(log.fat), fiber: per100(log.fiber),
    servings: [],
    source: 'custom',
  };
}
