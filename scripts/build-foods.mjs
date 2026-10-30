// Builds public/data/foods-usda.json from USDA FoodData Central SR Legacy (CC0).
// Download: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip
// Usage: node scripts/build-foods.mjs path/to/FoodData_Central_sr_legacy_food_json.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const file = process.argv[2];
if (!file) throw new Error('Pass the path to the unzipped SR Legacy JSON file');
const { SRLegacyFoods: foods } = JSON.parse(await readFile(file, 'utf8'));

const SKIP = /^(babyfood|infant formula|school lunch|usda commodity)/i;
const round = (n) => Math.round(n * 10) / 10;

const out = [];
for (const f of foods) {
  if (SKIP.test(f.description)) continue;
  const get = (num) => f.foodNutrients.find((n) => n.nutrient?.number === num)?.amount ?? 0;
  const kcal = get('208');
  if (!kcal && !get('203') && !get('205') && !get('204')) continue;
  const portions = (f.foodPortions ?? [])
    .filter((p) => p.gramWeight > 0 && p.modifier)
    .slice(0, 3)
    .map((p) => [`${p.amount === 1 ? '1' : p.amount} ${p.modifier}`.replace(/\s+/g, ' ').slice(0, 40), round(p.gramWeight)]);
  // [name, kcal, protein, carbs, fat, fibre, portions] — nutrients per 100 g.
  out.push([f.description, Math.round(kcal), round(get('203')), round(get('205')), round(get('204')), round(get('291')), portions]);
}

await mkdir('public/data', { recursive: true });
await writeFile('public/data/foods-usda.json', JSON.stringify(out));
console.log(`Wrote ${out.length} foods`);
