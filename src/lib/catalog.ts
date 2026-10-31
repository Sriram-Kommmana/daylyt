import { useEffect, useMemo, useState } from 'react';
import { withExtras } from '../data/extraExercises';
import { CURATED_FOODS } from '../data/foods';
import { allAlive, db, useLive } from './db';
import { index, squash, type Searchable } from './search';
import type { CustomExercise, CustomFood, Exercise, Food } from './types';

const url = (p: string) => `${import.meta.env.BASE_URL}data/${p}`;

let exerciseLoad: Promise<Exercise[]> | null = null;
function loadExercises() {
  exerciseLoad ??= fetch(url('exercises.json'))
    .then((r) => {
      if (!r.ok) throw new Error('Could not load exercises');
      return r.json() as Promise<Exercise[]>;
    })
    .then(withExtras)
    .catch((e) => {
      exerciseLoad = null;
      throw e;
    });
  return exerciseLoad;
}

type UsdaRow = [string, number, number, number, number, number, [string, number][]];

let usdaLoad: Promise<Food[]> | null = null;
function loadUsda() {
  usdaLoad ??= fetch(url('foods-usda.json'))
    .then((r) => {
      if (!r.ok) throw new Error('Could not load foods');
      return r.json() as Promise<UsdaRow[]>;
    })
    .then((rows) =>
      rows.map(([name, kcal, protein, carbs, fat, fiber, portions], i) => ({
        id: `u_${i}_${squash(name).slice(0, 24)}`,
        name,
        kcal, protein, carbs, fat, fiber,
        servings: portions.map(([label, grams]) => ({ label, grams })),
        source: 'usda' as const,
      })),
    )
    .catch((e) => {
      usdaLoad = null;
      throw e;
    });
  return usdaLoad;
}

export function useExercises() {
  const [base, setBase] = useState<Exercise[]>();
  const [error, setError] = useState(false);
  const custom = useLive(() => allAlive(db.customExercises)) as CustomExercise[] | undefined;
  useEffect(() => {
    loadExercises().then(setBase).catch(() => setError(true));
  }, []);
  const all = useMemo(() => (base ? [...((custom ?? []) as Exercise[]), ...base] : undefined), [base, custom]);
  const idx = useMemo<Searchable<Exercise>[]>(
    () => index(all ?? [], (e) => e.name, (e) => `${e.aliases ?? ''} ${e.primary.join(' ')} ${e.secondary.join(' ')} ${e.equipment} ${e.category}`),
    [all],
  );
  return { all, idx, error };
}

export function useFoods() {
  const [usda, setUsda] = useState<Food[]>([]);
  const custom = useLive(() => allAlive(db.customFoods)) as CustomFood[] | undefined;
  useEffect(() => {
    loadUsda().then(setUsda).catch(() => {});
  }, []);
  const all = useMemo(() => [...((custom ?? []) as Food[]), ...CURATED_FOODS, ...usda], [custom, usda]);
  const idx = useMemo<Searchable<Food>[]>(() => index(all, (f) => f.name, (f) => `${f.aliases ?? ''} ${f.brand ?? ''}`), [all]);
  return { all, idx };
}

export const exerciseImage = (path: string) => `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${path}`;

// ---- Open Food Facts: free, no key, covers packaged products worldwide, including Indian brands. ----

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  nutriments?: Record<string, number | string | undefined>;
}

export function fromOff(p: OffProduct): Food | null {
  const n = p.nutriments ?? {};
  const val = (k: string) => Number(n[`${k}_100g`] ?? 0) || 0;
  const name = p.product_name?.trim();
  if (!name) return null;
  let kcal = val('energy-kcal') || val('energy') / 4.184;
  if (!kcal && !val('proteins') && !val('carbohydrates')) return null;
  // Entries are community-typed and kJ/kcal mix-ups are common, so trust the macros when energy disagrees wildly.
  const fromMacros = val('proteins') * 4 + val('carbohydrates') * 4 + val('fat') * 9;
  if (fromMacros > 0 && (kcal < fromMacros * 0.5 || kcal > fromMacros * 2)) kcal = fromMacros;
  const qty = Number(p.serving_quantity);
  return {
    id: `off_${p.code ?? squash(name)}`,
    name,
    brand: p.brands?.split(',')[0]?.trim(),
    kcal: Math.round(kcal),
    protein: val('proteins'),
    carbs: val('carbohydrates'),
    fat: val('fat'),
    fiber: val('fiber'),
    servings: qty > 0 ? [{ label: p.serving_size || `${qty} g`, grams: qty }] : [],
    source: 'off',
  };
}

/**
 * Open Food Facts often answers 503 under load and succeeds moments later. Its 503 page has no
 * CORS header, so the browser reports that as a network error: both cases get retried.
 */
async function fetchWithRetry(url: string, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500 || i >= attempts) return res;
    } catch (e) {
      if (i >= attempts) throw e;
    }
    await new Promise((r) => setTimeout(r, 800 * i));
  }
}

export async function searchPackaged(query: string): Promise<Food[]> {
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page_size: '24', fields: OFF_FIELDS });
  const res = await fetchWithRetry(`https://world.openfoodfacts.org/cgi/search.pl?${params}`);
  if (!res.ok) throw new Error('Search failed');
  const data = (await res.json()) as { products?: OffProduct[] };
  return (data.products ?? []).map(fromOff).filter((f): f is Food => !!f);
}

export async function lookupBarcode(code: string): Promise<Food | null> {
  const res = await fetchWithRetry(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Lookup failed');
  const data = (await res.json()) as { status?: number; product?: OffProduct };
  return data.status === 1 && data.product ? fromOff({ code, ...data.product }) : null;
}
