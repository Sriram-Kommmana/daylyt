import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Camera, Copy, Globe, Plus, Trash2, Utensils, Zap } from 'lucide-react';
import { Empty, Field, NumInput, Progress, SearchBox, Segmented, Sheet, Stepper, useToast } from '../components/ui';
import { DateSwitch } from '../components/DateSwitch';
import { useSelectedDate } from '../App';
import { lookupBarcode, searchPackaged, useFoods } from '../lib/catalog';
import { allAlive, db, onDate, remove, save, uid, useLive, useSettings, useSummaries } from '../lib/db';
import { num } from '../lib/calc';
import { addDays, nowTime } from '../lib/date';
import { convertQty, describeAmount, foodFromLog, portionUnits, type PortionUnit } from '../lib/portions';
import { search } from '../lib/search';
import type { CustomFood, Food, FoodLog, Meal, SavedMeal } from '../lib/types';

export const MEALS: { key: Meal; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' }, { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' },
];

export const mealForNow = (): Meal => {
  const h = Number(nowTime().slice(0, 2));
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
};

export type LogDraft = Omit<FoodLog, 'id' | 'updatedAt' | 'date' | 'deleted'>;

export const scale = (f: Food, grams: number) => ({
  kcal: Math.round((f.kcal * grams) / 100),
  protein: +((f.protein * grams) / 100).toFixed(1),
  carbs: +((f.carbs * grams) / 100).toFixed(1),
  fat: +((f.fat * grams) / 100).toFixed(1),
  fiber: +((f.fiber * grams) / 100).toFixed(1),
});

/** Search across custom, curated and USDA foods, with online packaged-food lookup as a fallback. */
export function FoodPicker({ meal, onClose, onAdd, title }: { meal: Meal; onClose: () => void; onAdd: (d: LogDraft | LogDraft[]) => void | Promise<void>; title?: string }) {
  const { idx, all } = useFoods();
  const logs = useLive(() => allAlive(db.foodLogs));
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Food>();
  const [startAt, setStartAt] = useState<{ qty: number; unitKey: string }>();
  const [online, setOnline] = useState<Food[] | null>(null);
  const [onlineState, setOnlineState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mode, setMode] = useState<'search' | 'meals' | 'quick' | 'custom'>('search');
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();

  const frequency = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs ?? []) if (l.foodId) m.set(l.foodId, (m.get(l.foodId) ?? 0) + 1);
    return m;
  }, [logs]);

  // Curated foods read better than raw USDA names, so they outrank them for equal matches.
  const boost = (f: Food) => Math.min(20, frequency.get(f.id) ?? 0) + (f.source === 'custom' ? 60 : f.source === 'curated' ? 55 : 0);
  const results = useMemo(() => (q.trim() ? search(idx, q, boost).slice(0, 50) : []), [idx, q, frequency]); // eslint-disable-line

  const recents = useMemo(() => {
    const seen = new Set<string>();
    const out: FoodLog[] = [];
    for (const l of [...(logs ?? [])].sort((a, b) => b.updatedAt - a.updatedAt)) {
      const key = l.foodId ?? l.name;
      if (!seen.has(key)) { seen.add(key); out.push(l); }
      if (out.length >= 15) break;
    }
    return out;
  }, [logs]);

  useEffect(() => { setOnline(null); setOnlineState('idle'); }, [q]);

  const searchOnline = async () => {
    setOnlineState('loading');
    try {
      setOnline(await searchPackaged(q.trim()));
      setOnlineState('idle');
    } catch {
      setOnlineState('error');
    }
  };

  const handleBarcode = async (code: string) => {
    setScanning(false);
    try {
      const f = await lookupBarcode(code);
      if (f) setSelected(f);
      else toast('That barcode is not in Open Food Facts yet');
    } catch {
      toast('Could not look that up. Check your connection.');
    }
  };

  return (
    <Sheet title={title ?? `Add to ${MEALS.find((m) => m.key === meal)?.label.toLowerCase()}`} onClose={onClose} full>
      <div className="stack">
        <Segmented value={mode} onChange={setMode} label="How to add food" options={[{ value: 'search', label: 'Search' }, { value: 'meals', label: 'My meals' }, { value: 'quick', label: 'Quick add' }, { value: 'custom', label: 'New food' }]} />
        {mode === 'search' && (
          <>
            <div className="row">
              <div className="grow"><SearchBox autoFocus value={q} onChange={setQ} placeholder="Search: roti, dal, chicken, oats…" /></div>
              <button className="icon-btn filled" aria-label="Scan a barcode" onClick={() => setScanning(true)}><Camera size={18} /></button>
            </div>
            {!q.trim() && recents.length > 0 && (
              <>
                <div className="small muted bold">Recent</div>
                <div className="list">
                  {recents.map((l) => (
                    <button key={l.id} className="item" style={{ padding: '9px 0' }} onClick={async () => {
                      // Starts from what you had last time, but the amount is still yours to change.
                      const known = all.find((f) => f.id === l.foodId) ?? foodFromLog(l);
                      if (known) {
                        setSelected(known);
                        setStartAt(l.qty && l.unitKey ? { qty: l.qty, unitKey: l.unitKey } : l.grams ? { qty: Math.round(l.grams), unitKey: 'g' } : undefined);
                        return;
                      }
                      const { id: _i, updatedAt: _u, date: _d, deleted: _x, ...rest } = l;
                      await onAdd({ ...rest, meal });
                    }}>
                      <span className="grow">
                        <span className="bold clip" style={{ display: 'block' }}>{l.name}</span>
                        <span className="small muted clip" style={{ display: 'block' }}>{l.amount} · {l.kcal} kcal</span>
                      </span>
                      <Plus size={18} className="faint" />
                    </button>
                  ))}
                </div>
              </>
            )}
            {q.trim() && (
              <div className="list">
                {results.map((f) => <FoodRow key={f.id} food={f} onClick={() => { setSelected(f); setStartAt(undefined); }} />)}
              </div>
            )}
            {q.trim() && !results.length && <div className="empty small">No match in the built-in foods.</div>}
            {q.trim() && !online && (
              <button className="btn block" disabled={onlineState === 'loading'} onClick={searchOnline}>
                <Globe size={15} /> {onlineState === 'loading' ? 'Searching…' : 'Search packaged foods online'}
              </button>
            )}
            {onlineState === 'error' && <div className="small faint center">Could not reach Open Food Facts. You can try again or add the food yourself.</div>}
            {online && (
              <>
                <div className="small muted bold">Packaged foods</div>
                <div className="list">
                  {online.map((f) => <FoodRow key={f.id} food={f} onClick={() => setSelected(f)} />)}
                </div>
                {!online.length && <div className="empty small">Nothing found online either.</div>}
              </>
            )}
          </>
        )}
        {mode === 'meals' && <SavedMeals meal={meal} onAdd={onAdd} />}
        {mode === 'quick' && <QuickAdd meal={meal} onAdd={onAdd} />}
        {mode === 'custom' && <CustomFoodForm initialName={q} onCreated={(f) => { setSelected(f); setMode('search'); }} />}
      </div>
      {selected && <AmountSheet key={selected.id} food={selected} meal={meal} initial={startAt} onClose={() => setSelected(undefined)} onAdd={async (d) => { await onAdd(d); setSelected(undefined); }} />}
      {scanning && <BarcodeSheet onClose={() => setScanning(false)} onCode={handleBarcode} />}
    </Sheet>
  );
}

function SavedMeals({ meal, onAdd }: { meal: Meal; onAdd: (d: LogDraft[]) => void | Promise<void> }) {
  const meals = useLive(() => allAlive(db.savedMeals));
  if (meals && !meals.length) {
    return <Empty icon={<Utensils size={26} />} title="No saved meals yet"><p className="small muted" style={{ maxWidth: 320 }}>Log what you usually eat, then tap Save on that meal. Next time it's one tap.</p></Empty>;
  }
  return (
    <div className="list">
      {(meals ?? []).map((m) => (
        <div key={m.id} className="item" style={{ padding: '9px 0' }}>
          <button className="grow" style={{ textAlign: 'left' }} onClick={() => onAdd(m.items.map((i) => ({ ...i, meal })))}>
            <span className="bold clip" style={{ display: 'block' }}>{m.name}</span>
            <span className="small muted clip" style={{ display: 'block' }}>{num(m.items.reduce((t, i) => t + i.kcal, 0))} kcal · {m.items.map((i) => i.name).join(', ')}</span>
          </button>
          <button className="icon-btn sm" aria-label={`Delete ${m.name}`} onClick={() => remove('savedMeals', m.id)}><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}

function SaveMealSheet({ rows, label, onClose }: { rows: FoodLog[]; label: string; onClose: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(`My ${label.toLowerCase()}`);
  return (
    <Sheet title="Save as a meal" onClose={onClose} footer={
      <button className="btn primary block" disabled={!name.trim()} onClick={async () => {
        await save<SavedMeal>('savedMeals', {
          name: name.trim(),
          items: rows.map(({ id: _i, updatedAt: _u, date: _d, deleted: _x, meal: _m, ...item }) => item),
        });
        toast(`Saved. Find it under Add, then My meals.`);
        onClose();
      }}>Save meal</button>
    }>
      <div className="stack">
        <Field label="Name"><input className="input" data-autofocus="" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <ul className="stack tight small">
          {rows.map((r) => <li key={r.id} className="row between"><span className="clip">{r.name}</span><span className="muted nowrap">{r.amount}</span></li>)}
        </ul>
      </div>
    </Sheet>
  );
}

function FoodRow({ food, onClick }: { food: Food; onClick: () => void }) {
  const s = food.servings[0] ?? { label: '100 g', grams: 100 };
  const v = scale(food, s.grams);
  return (
    <button className="item" style={{ padding: '9px 0' }} onClick={onClick}>
      <span className="grow">
        <span className="bold" style={{ display: 'block', overflowWrap: 'anywhere' }}>{food.name}</span>
        <span className="small muted clip" style={{ display: 'block' }}>
          {food.brand ? `${food.brand} · ` : ''}{s.label} · {v.kcal} kcal · {v.protein} g protein
        </span>
      </span>
      <Plus size={18} className="faint" />
    </button>
  );
}

/** Say what you ate in whatever way you measured it: type any amount, pick any unit. */
function AmountSheet({ food, meal, onClose, onAdd, initial, saveLabel = 'Add' }: {
  food: Food; meal: Meal; onClose: () => void; onAdd: (d: LogDraft) => void | Promise<void>; initial?: { qty: number; unitKey: string }; saveLabel?: string;
}) {
  const units = useMemo(() => portionUnits(food), [food]);
  const [unit, setUnit] = useState<PortionUnit>(() => units.find((u) => u.key === initial?.unitKey) ?? units[0]);
  const [qty, setQty] = useState<number | undefined>(initial?.qty ?? units[0].start);
  const [chosenMeal, setMeal] = useState(meal);
  const grams = unit.grams * (qty ?? 0);
  const v = scale(food, grams);

  return (
    <Sheet title={food.name} onClose={onClose} footer={
      <button className="btn primary block" disabled={!qty} onClick={() => onAdd({
        meal: chosenMeal, foodId: food.id, name: food.name, grams, ...v,
        amount: describeAmount(qty!, unit), qty, unitKey: unit.key,
      })}>{saveLabel} · {v.kcal} kcal</button>
    }>
      <div className="stack">
        <div className="field">
          <span className="field-label">How much did you have?</span>
          <div className="amount-row">
            <Stepper value={qty} onChange={setQty} step={unit.step} label="amount" autoFocus />
            <span className="amount-unit clip">{unit.label}</span>
          </div>
          <div className="chips" aria-label="Common amounts">
            {unit.quick.map((n) => <button key={n} type="button" className={`chip${qty === n ? ' on' : ''}`} style={{ textTransform: 'none' }} aria-pressed={qty === n} onClick={() => setQty(n)}>{fractionLabel(n)}</button>)}
          </div>
        </div>
        <div className="field">
          <span className="field-label">Measured in</span>
          <div className="chips wrap" aria-label="Unit">
            {units.map((u) => (
              <button key={u.key} type="button" className={`chip${u.key === unit.key ? ' on' : ''}`} style={{ textTransform: 'none' }} aria-pressed={u.key === unit.key} onClick={() => { setQty(convertQty(qty ?? 0, unit, u)); setUnit(u); }}>
                {u.label}
              </button>
            ))}
          </div>
          <span className="tiny faint">
            {unit.key === 'g' ? 'Weighed amount.' : `1 ${unit.label} = ${unit.approx ? 'about ' : ''}${+unit.grams.toFixed(1)} g${unit.approx ? '. This varies by food, so use g if you weighed it.' : ''}`}
          </span>
        </div>
        <Field label="Meal">
          <Segmented value={chosenMeal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.key, label: m.label }))} />
        </Field>
        <div className="small"><span className="bold">{Math.round(grams)} g</span> <span className="muted">is {v.kcal} kcal</span></div>
        <div className="macro-grid center">
          <MacroCell label="Protein" v={v.protein} />
          <MacroCell label="Carbs" v={v.carbs} />
          <MacroCell label="Fat" v={v.fat} />
          <MacroCell label="Fibre" v={v.fiber} />
        </div>
        <p className="tiny faint">{food.source === 'curated' ? 'Typical values; home cooking varies.' : food.source === 'usda' ? 'Source: USDA FoodData Central.' : food.source === 'off' ? 'Source: Open Food Facts, contributed by the community.' : 'Your own food.'}</p>
      </div>
    </Sheet>
  );
}

const fractionLabel = (n: number) => ({ 0.25: '¼', 0.5: '½', 0.75: '¾', 1.5: '1½', 2.5: '2½' } as Record<number, string>)[n] ?? String(n);

const MacroCell = ({ label, v }: { label: string; v: number }) => (
  <div><div className="bold">{v} g</div><div className="tiny faint">{label}</div></div>
);

function QuickAdd({ meal, onAdd }: { meal: Meal; onAdd: (d: LogDraft) => void | Promise<void> }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number>();
  const [protein, setProtein] = useState<number>();
  const [carbs, setCarbs] = useState<number>();
  const [fat, setFat] = useState<number>();
  return (
    <div className="stack">
      <p className="small muted">Don't know the details? Just record the calories.</p>
      <Field label="What was it? (optional)"><input className="input" value={name} placeholder="Restaurant dinner" onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Calories"><NumInput value={kcal} onChange={setKcal} placeholder="0" /></Field>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Field label="Protein (g)"><NumInput value={protein} onChange={setProtein} placeholder="—" /></Field>
        <Field label="Carbs (g)"><NumInput value={carbs} onChange={setCarbs} placeholder="—" /></Field>
        <Field label="Fat (g)"><NumInput value={fat} onChange={setFat} placeholder="—" /></Field>
      </div>
      <button className="btn primary block" disabled={!kcal} onClick={() => onAdd({ meal, name: name.trim() || 'Quick add', amount: 'Quick add', kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0, fiber: 0 })}><Zap size={15} /> Add</button>
    </div>
  );
}

function CustomFoodForm({ initialName, onCreated }: { initialName: string; onCreated: (f: Food) => void }) {
  const [name, setName] = useState(initialName);
  const [serving, setServing] = useState('1 serving');
  const [grams, setGrams] = useState<number | undefined>(100);
  const [kcal, setKcal] = useState<number>();
  const [protein, setProtein] = useState<number>();
  const [carbs, setCarbs] = useState<number>();
  const [fat, setFat] = useState<number>();
  const [fiber, setFiber] = useState<number>();
  const per = (v?: number) => +(((v ?? 0) / (grams || 100)) * 100).toFixed(2);
  return (
    <div className="stack">
      <p className="small muted">Saved for next time. Enter the values for one serving, from the label or your recipe.</p>
      <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div className="grid two">
        <Field label="Serving name"><input className="input" value={serving} onChange={(e) => setServing(e.target.value)} /></Field>
        <Field label="Grams per serving"><NumInput value={grams} onChange={setGrams} /></Field>
        <Field label="Calories"><NumInput value={kcal} onChange={setKcal} placeholder="0" /></Field>
        <Field label="Protein (g)"><NumInput value={protein} onChange={setProtein} placeholder="0" /></Field>
        <Field label="Carbs (g)"><NumInput value={carbs} onChange={setCarbs} placeholder="0" /></Field>
        <Field label="Fat (g)"><NumInput value={fat} onChange={setFat} placeholder="0" /></Field>
        <Field label="Fibre (g)"><NumInput value={fiber} onChange={setFiber} placeholder="0" /></Field>
      </div>
      <button className="btn primary block" disabled={!name.trim() || !kcal || !grams} onClick={async () => {
        const row = await save<CustomFood>('customFoods', {
          name: name.trim(), kcal: per(kcal), protein: per(protein), carbs: per(carbs), fat: per(fat), fiber: per(fiber), servings: [{ label: serving || '1 serving', grams: grams! }], source: 'custom',
        });
        onCreated(row as unknown as Food);
      }}>Save food</button>
    </div>
  );
}

// BarcodeDetector exists on Chrome for Android, not on iOS or desktop browsers, so typing is always offered.
function BarcodeSheet({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState('');
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  useEffect(() => {
    type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
    if (!Ctor) { setProblem('This browser cannot scan barcodes. Type the number under the barcode instead.'); return; }
    let stream: MediaStream | undefined;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        while (!stop) {
          const codes = await detector.detect(v).catch(() => []);
          if (codes[0]) { onCodeRef.current(codes[0].rawValue); return; }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setProblem('Could not open the camera. Type the number under the barcode instead.');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <Sheet title="Scan a barcode" onClose={onClose}>
      <div className="stack">
        {problem ? <p className="small muted">{problem}</p> : <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 12, background: '#000', aspectRatio: '4/3', objectFit: 'cover' }} />}
        <Field label="Barcode number">
          <div className="row">
            <input className="input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} />
            <button className="btn primary" disabled={typed.length < 8} onClick={() => onCode(typed)}>Look up</button>
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

export default function Eat() {
  const [date] = useSelectedDate();
  const settings = useSettings();
  const { toast } = useToast();
  const logs = useLive(() => onDate(db.foodLogs, date), [date]);
  const yesterday = useLive(() => onDate(db.foodLogs, addDays(date, -1)), [date]);
  const days = useSummaries(date, date, settings);
  const [adding, setAdding] = useState<Meal>();
  const [editing, setEditing] = useState<FoodLog>();
  const [savingMeal, setSavingMeal] = useState<{ rows: FoodLog[]; label: string }>();
  const d = days?.get(date);

  const totals = useMemo(() => (logs ?? []).reduce((t, l) => ({ kcal: t.kcal + l.kcal, protein: t.protein + l.protein, carbs: t.carbs + l.carbs, fat: t.fat + l.fat, fiber: t.fiber + l.fiber }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }), [logs]);
  if (!settings) return null;
  const g = settings.goals;
  const burned = settings.eatBack ? d?.workoutKcal ?? 0 : 0;
  const budget = g.kcal + burned;
  const left = budget - totals.kcal;

  const addLog = async (drafts: LogDraft | LogDraft[]) => {
    const list = [drafts].flat();
    const rows = await Promise.all(list.map((draft) => save<FoodLog>('foodLogs', { ...draft, date })));
    setAdding(undefined);
    toast(list.length === 1 ? `${list[0].name} added` : `${list.length} foods added`, () => { rows.forEach((row) => void remove('foodLogs', row.id)); });
  };

  const copyMeal = async (meal: Meal) => {
    const rows = (yesterday ?? []).filter((l) => l.meal === meal);
    for (const { id: _i, updatedAt: _u, ...rest } of rows) await save<FoodLog>('foodLogs', { ...rest, date, id: uid() });
    toast(`Copied ${rows.length} item${rows.length === 1 ? '' : 's'} from the day before`);
  };

  return (
    <>
      <div className="page-head">
        <h1>Eat</h1>
        <DateSwitch />
      </div>
      <div className="stack">
        <div className="card">
          <div className="row between">
            <div>
              <div className="hero-num" style={{ fontSize: 40 }}>{num(Math.abs(left))}</div>
              <div className="small muted">{left >= 0 ? 'kcal left' : 'kcal over'}</div>
            </div>
            <div className="small muted" style={{ textAlign: 'right' }}>
              <div><span className="bold" style={{ color: 'var(--ink)' }}>{num(totals.kcal)}</span> eaten</div>
              <div>{num(budget)} goal{burned ? ` (+${burned} exercise)` : ''}</div>
            </div>
          </div>
          <div style={{ margin: '10px 0 12px' }}><Progress value={totals.kcal / budget} color="var(--food)" over={totals.kcal > budget * 1.1} /></div>
          <div className="macro-grid">
            {([['Protein', totals.protein, g.protein], ['Carbs', totals.carbs, g.carbs], ['Fat', totals.fat, g.fat], ['Fibre', totals.fiber, g.fiber]] as const).map(([label, val, goal]) => (
              <div key={label}>
                <div className="tiny faint">{label}</div>
                <div className="small bold">{Math.round(val)}<span className="faint" style={{ fontWeight: 500 }}>/{goal} g</span></div>
                <div style={{ marginTop: 4 }}><Progress value={val / goal} color="var(--ink-2)" /></div>
              </div>
            ))}
          </div>
        </div>

        {MEALS.map((m) => {
          const rows = (logs ?? []).filter((l) => l.meal === m.key);
          const yest = (yesterday ?? []).filter((l) => l.meal === m.key);
          return (
            <div className="card flush" key={m.key}>
              <div className="row between" style={{ padding: '12px 15px 8px' }}>
                <h2>{m.label}</h2>
                <div className="row" style={{ gap: 6 }}>
                  {rows.length > 0 && <span className="small muted nowrap">{num(rows.reduce((t, r) => t + r.kcal, 0))} kcal</span>}
                  {rows.length > 1 && <button className="btn ghost sm" aria-label={`Save ${m.label} as a meal`} onClick={() => setSavingMeal({ rows, label: m.label })}><Bookmark size={13} /> Save</button>}
                  {!rows.length && yest.length > 0 && <button className="btn ghost sm" onClick={() => copyMeal(m.key)}><Copy size={13} /> Copy previous day</button>}
                  <button className="btn sm" aria-label={`Add to ${m.label}`} onClick={() => setAdding(m.key)}><Plus size={14} /> Add</button>
                </div>
              </div>
              {rows.length > 0 && (
                <div className="list" style={{ borderTop: '1px solid var(--line)' }}>
                  {rows.map((l) => (
                    <button key={l.id} className="item" style={{ padding: '9px 15px' }} onClick={() => setEditing(l)}>
                      <span className="grow">
                        <span className="clip" style={{ display: 'block', fontWeight: 550 }}>{l.name}</span>
                        <span className="tiny faint clip" style={{ display: 'block' }}>{l.amount} · P {Math.round(l.protein)} · C {Math.round(l.carbs)} · F {Math.round(l.fat)}</span>
                      </span>
                      <span className="small bold nowrap">{num(l.kcal)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {logs && !logs.length && !yesterday?.length && (
          <Empty icon={<Utensils size={26} />} title="Tap Add on a meal to log your first food" />
        )}
      </div>
      {adding && <FoodPicker meal={adding} onClose={() => setAdding(undefined)} onAdd={addLog} />}
      {editing && <EditLog log={editing} onClose={() => setEditing(undefined)} />}
      {savingMeal && <SaveMealSheet rows={savingMeal.rows} label={savingMeal.label} onClose={() => setSavingMeal(undefined)} />}
    </>
  );
}

function EditLog({ log, onClose }: { log: FoodLog; onClose: () => void }) {
  const { toast } = useToast();
  const { all } = useFoods();
  const [changing, setChanging] = useState(false);
  const food = useMemo(() => all.find((f) => f.id === log.foodId) ?? foodFromLog(log), [all, log]);
  const [kcal, setKcal] = useState<number | undefined>(log.kcal);
  const [protein, setProtein] = useState<number | undefined>(log.protein);
  const [carbs, setCarbs] = useState<number | undefined>(log.carbs);
  const [fat, setFat] = useState<number | undefined>(log.fat);
  const [meal, setMeal] = useState(log.meal);
  return (
    <Sheet title={log.name} onClose={onClose} footer={
      <>
        <button className="btn danger" aria-label="Delete" onClick={async () => {
          await remove('foodLogs', log.id);
          onClose();
          toast(`${log.name} removed`, () => void save<FoodLog>('foodLogs', { ...log, deleted: undefined }));
        }}><Trash2 size={15} /></button>
        <button className="btn primary grow" onClick={async () => { await save<FoodLog>('foodLogs', { ...log, meal, kcal: kcal ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 }); onClose(); }}>Save</button>
      </>
    }>
      <div className="stack">
        <div className="row between">
          <span className="small muted">{log.amount}</span>
          {food && <button className="btn sm" onClick={() => setChanging(true)}>Change amount</button>}
        </div>
        <Field label="Meal"><Segmented value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.key, label: m.label }))} /></Field>
        <div className="grid two">
          <Field label="Calories"><NumInput value={kcal} onChange={setKcal} /></Field>
          <Field label="Protein (g)"><NumInput value={protein} onChange={setProtein} /></Field>
          <Field label="Carbs (g)"><NumInput value={carbs} onChange={setCarbs} /></Field>
          <Field label="Fat (g)"><NumInput value={fat} onChange={setFat} /></Field>
        </div>
      </div>
      {changing && food && (
        <AmountSheet food={food} meal={log.meal} saveLabel="Save" initial={log.qty && log.unitKey ? { qty: log.qty, unitKey: log.unitKey } : log.grams ? { qty: Math.round(log.grams), unitKey: 'g' } : undefined}
          onClose={() => setChanging(false)} onAdd={async (d) => { await save<FoodLog>('foodLogs', { ...log, ...d }); onClose(); }} />
      )}
    </Sheet>
  );
}
