import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Dumbbell, Plus } from 'lucide-react';
import { Field, NumInput, SearchBox, Sheet, Stepper, useToast } from './ui';
import { exerciseImage, useExercises } from '../lib/catalog';
import { allAlive, db, save, useLive, useSettings } from '../lib/db';
import { fromKg, metFor, metKcal, setMinutes, toKg } from '../lib/calc';
import { search } from '../lib/search';
import { lastSets } from '../lib/workouts';
import type { CustomExercise, Exercise, ExerciseKind, WorkoutSet } from '../lib/types';

const MUSCLES = ['chest', 'lats', 'middle back', 'lower back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'traps', 'neck'];
const TYPES = [
  { key: 'strength', label: 'Strength' }, { key: 'cardio', label: 'Cardio' }, { key: 'sport', label: 'Sports' }, { key: 'yoga', label: 'Yoga' },
  { key: 'stretching', label: 'Stretching' }, { key: 'plyometrics', label: 'Plyometrics' }, { key: 'powerlifting', label: 'Powerlifting' },
  { key: 'olympic weightlifting', label: 'Olympic' }, { key: 'strongman', label: 'Strongman' }, { key: 'activity', label: 'Everyday' },
];
const EQUIPMENT = ['body only', 'dumbbell', 'barbell', 'machine', 'cable', 'kettlebells', 'bands', 'e-z curl bar', 'medicine ball', 'exercise ball', 'foam roll', 'other'];

const PAGE = 40;

export function ExerciseThumb({ e }: { e: Pick<Exercise, 'images' | 'name'> }) {
  const [failed, setFailed] = useState(false);
  if (!e.images?.length || failed) return <div className="thumb"><Dumbbell size={20} /></div>;
  return <img className="thumb" loading="lazy" alt="" src={exerciseImage(e.images[0])} onError={() => setFailed(true)} />;
}

/**
 * Full-screen exercise search. `multi` picks several (for routines); otherwise tapping one calls
 * onPick straight away so the user can enter sets and reps.
 */
export function ExercisePicker({ onPick, onPickMany, onClose, multi, title = 'Add exercise' }: {
  onPick?: (e: Exercise) => void; onPickMany?: (e: Exercise[]) => void; onClose: () => void; multi?: boolean; title?: string;
}) {
  const { idx, all, error } = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [type, setType] = useState('');
  const [equip, setEquip] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [picked, setPicked] = useState<Exercise[]>([]);
  const [creating, setCreating] = useState(false);
  const workouts = useLive(() => allAlive(db.workouts));

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workouts ?? []) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    return m;
  }, [workouts]);

  const results = useMemo(() => {
    const boost = (e: Exercise) => Math.min(5, usage.get(e.id) ?? 0) + (e.custom ? 2 : 0);
    let rows = search(idx, q, boost);
    if (muscle) rows = rows.filter((e) => e.primary.includes(muscle));
    if (type) rows = rows.filter((e) => e.category === type);
    if (equip) rows = rows.filter((e) => e.equipment === equip);
    if (!q && !muscle && !type && !equip) {
      // Empty search: what you actually do first, then the alphabetical catalogue.
      rows = [...rows].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name));
    }
    return rows;
  }, [idx, q, muscle, type, equip, usage]);

  useEffect(() => setLimit(PAGE), [q, muscle, type, equip]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) setLimit((l) => l + PAGE); });
    io.observe(el);
    return () => io.disconnect();
  });

  const isPicked = (e: Exercise) => picked.some((p) => p.id === e.id);
  const tap = (e: Exercise) => {
    if (multi) setPicked(isPicked(e) ? picked.filter((p) => p.id !== e.id) : [...picked, e]);
    else onPick?.(e);
  };

  return (
    <Sheet title={title} onClose={onClose} full footer={multi ? (
      <button className="btn primary block" disabled={!picked.length} onClick={() => onPickMany?.(picked)}>
        {picked.length ? `Add ${picked.length} exercise${picked.length > 1 ? 's' : ''}` : 'Select exercises'}
      </button>
    ) : undefined}>
      <div className="stack">
        <SearchBox autoFocus value={q} onChange={setQ} placeholder={`Search ${all ? all.length.toLocaleString() : ''} exercises`} />
        <div className="stack tight">
          <div className="chips" aria-label="Filter by type">
            {TYPES.map((t) => <button key={t.key} className={`chip${type === t.key ? ' on' : ''}`} aria-pressed={type === t.key} onClick={() => setType(type === t.key ? '' : t.key)}>{t.label}</button>)}
          </div>
          <div className="chips" aria-label="Filter by muscle">
            {MUSCLES.map((m) => <button key={m} className={`chip${muscle === m ? ' on' : ''}`} aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)}>{m}</button>)}
          </div>
          <div className="chips" aria-label="Filter by equipment">
            {EQUIPMENT.map((m) => <button key={m} className={`chip${equip === m ? ' on' : ''}`} aria-pressed={equip === m} onClick={() => setEquip(equip === m ? '' : m)}>{m}</button>)}
          </div>
        </div>
        {error && <div className="empty">Could not load the exercise list. Check your connection and reopen this screen.</div>}
        {!all && !error && <div className="empty small">Loading exercises…</div>}
        {all && (
          <div className="list">
            {results.slice(0, limit).map((e) => (
              <button key={e.id} className="item" style={{ padding: '9px 0' }} onClick={() => tap(e)}>
                <ExerciseThumb e={e} />
                <span className="grow">
                  <span className="bold clip" style={{ display: 'block' }}>{e.name}</span>
                  <span className="small muted clip" style={{ display: 'block', textTransform: 'capitalize' }}>
                    {e.primary.join(', ') || e.category} · {e.equipment}
                  </span>
                </span>
                {multi ? <span className={`check${isPicked(e) ? ' on' : ''}`}><Check size={16} strokeWidth={3} /></span> : <Plus size={18} className="faint" />}
              </button>
            ))}
            {results.length > limit && <div ref={sentinel} style={{ height: 1 }} />}
          </div>
        )}
        {all && !results.length && <div className="empty small">No match for that search.</div>}
        {all && (
          <button className="btn block" onClick={() => setCreating(true)}><Plus size={16} /> Create {q ? `“${q}”` : 'a custom exercise'}</button>
        )}
      </div>
      {creating && <CustomExerciseSheet initialName={q} onClose={() => setCreating(false)} onCreated={(e) => { setCreating(false); tap(e); }} />}
    </Sheet>
  );
}

function CustomExerciseSheet({ initialName, onClose, onCreated }: { initialName: string; onClose: () => void; onCreated: (e: Exercise) => void }) {
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<ExerciseKind>('reps');
  const [muscle, setMuscle] = useState('chest');
  const [equipment, setEquipment] = useState('body only');
  const create = async () => {
    const category = kind === 'cardio' ? 'cardio' : kind === 'time' ? 'stretching' : 'strength';
    const row = await save<CustomExercise>('customExercises', {
      name: name.trim(), kind, category, primary: [muscle], secondary: [], equipment, level: 'beginner', instructions: [], images: [], custom: true,
    });
    onCreated(row as unknown as Exercise);
  };
  return (
    <Sheet title="Custom exercise" onClose={onClose} footer={<button className="btn primary block" disabled={!name.trim()} onClick={create}>Create exercise</button>}>
      <div className="stack">
        <Field label="Name"><input className="input" value={name} data-autofocus="" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="How do you measure it?">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as ExerciseKind)}>
            <option value="reps">Sets, reps and weight</option>
            <option value="time">Timed holds</option>
            <option value="cardio">Duration and distance</option>
          </select>
        </Field>
        <Field label="Main muscle">
          <select className="input" style={{ textTransform: 'capitalize' }} value={muscle} onChange={(e) => setMuscle(e.target.value)}>
            {MUSCLES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Equipment">
          <select className="input" style={{ textTransform: 'capitalize' }} value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            {EQUIPMENT.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
      </div>
    </Sheet>
  );
}

/** The fast path: picked an exercise, say how many sets and reps, done. */
export function QuickLogSheet({ exercise, date, onClose, onSave, saveLabel = 'Log exercise', plannedOnly }: {
  exercise: Exercise; date: string; onClose: () => void; onSave: (sets: WorkoutSet[]) => void | Promise<void>; saveLabel?: string; plannedOnly?: boolean;
}) {
  const settings = useSettings();
  const workouts = useLive(() => allAlive(db.workouts));
  const unit = settings?.weightUnit ?? 'kg';
  const [sets, setSets] = useState<number | undefined>(exercise.kind === 'cardio' ? 1 : 3);
  const [reps, setReps] = useState<number | undefined>(10);
  const [weight, setWeight] = useState<number | undefined>();
  const [minutes, setMinutes_] = useState<number | undefined>(exercise.kind === 'cardio' ? 30 : undefined);
  const [secs, setSecs] = useState<number | undefined>(exercise.kind === 'time' ? 60 : undefined);
  const [km, setKm] = useState<number | undefined>();
  const seeded = useRef(false);
  const { toast } = useToast();

  // Start from what you did last time: the most useful default there is.
  const last = workouts && lastSets(workouts, exercise.id, date);
  useEffect(() => {
    if (seeded.current || !last?.length) return;
    seeded.current = true;
    const s = last[last.length - 1];
    if (exercise.kind === 'cardio') { setMinutes_(s.sec ? Math.round(s.sec / 60) : 30); setKm(s.km); setSets(1); }
    else if (exercise.kind === 'time') { setSecs(s.sec); setSets(last.length); }
    else { setReps(s.reps); setSets(last.length); if (s.weight) setWeight(+fromKg(s.weight, unit).toFixed(1)); }
  }, [last, exercise.kind, unit]);

  const build = (): WorkoutSet[] => {
    const n = Math.max(1, sets ?? 1);
    return Array.from({ length: n }, () => {
      if (exercise.kind === 'cardio') return { sec: (minutes ?? 0) * 60, km, done: !plannedOnly };
      if (exercise.kind === 'time') return { sec: secs, done: !plannedOnly };
      return { reps, weight: weight ? toKg(weight, unit) : undefined, done: !plannedOnly };
    });
  };
  const valid = exercise.kind === 'cardio' ? !!minutes : exercise.kind === 'time' ? !!secs : !!reps;
  const kg = settings?.weightKg ?? 70;
  const kcal = valid ? Math.round(metKcal(metFor(exercise), kg, build().reduce((m, s) => m + setMinutes(s, exercise.kind), 0))) : 0;

  return (
    <Sheet title={exercise.name} onClose={onClose} footer={
      <button className="btn primary block" disabled={!valid} onClick={async () => { await onSave(build()); if (!plannedOnly) toast(`${exercise.name} logged`); }}>{saveLabel}</button>
    }>
      <div className="stack">
        <div className="small muted" style={{ textTransform: 'capitalize' }}>{exercise.primary.join(', ') || exercise.category} · {exercise.equipment}</div>
        {exercise.kind === 'reps' && (
          <div className="grid two">
            <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} label="sets" /></Field>
            <Field label="Reps per set"><Stepper value={reps} onChange={setReps} min={1} label="reps" /></Field>
            <div className="span-all">
              <Field label={`Weight (${unit}, optional)`} hint={exercise.equipment === 'body only' ? 'Leave empty for bodyweight' : undefined}>
                <Stepper value={weight} onChange={setWeight} step={unit === 'kg' ? 2.5 : 5} label="weight" />
              </Field>
            </div>
          </div>
        )}
        {exercise.kind === 'time' && (
          <div className="grid two">
            <Field label="Sets"><Stepper value={sets} onChange={setSets} min={1} label="sets" /></Field>
            <Field label="Seconds each"><Stepper value={secs} onChange={setSecs} step={15} min={5} label="seconds" /></Field>
          </div>
        )}
        {exercise.kind === 'cardio' && (
          <div className="grid two">
            <Field label="Minutes"><Stepper value={minutes} onChange={setMinutes_} step={5} min={1} label="minutes" /></Field>
            <Field label="Distance (km, optional)"><NumInput value={km} onChange={setKm} placeholder="—" label="distance" /></Field>
          </div>
        )}
        {!plannedOnly && (
          <div className="row between small">
            <span className="muted">Estimated burn</span>
            <span className="bold">{kcal} kcal</span>
          </div>
        )}
        {last && last.length > 0 && (
          <div className="small faint">Last time: {describeSets(last, unit)}</div>
        )}
      </div>
    </Sheet>
  );
}

export function describeSets(sets: WorkoutSet[], unit: 'kg' | 'lb') {
  const first = sets[0];
  if (!first) return '';
  if (first.reps != null) {
    const same = sets.every((s) => s.reps === first.reps && s.weight === first.weight);
    const w = (s: WorkoutSet) => (s.weight ? ` × ${+fromKg(s.weight, unit).toFixed(1)} ${unit}` : '');
    return same ? `${sets.length} × ${first.reps}${w(first)}` : sets.map((s) => `${s.reps}${w(s)}`).join(', ');
  }
  const totalSec = sets.reduce((t, s) => t + (s.sec ?? 0), 0);
  const km = sets.reduce((t, s) => t + (s.km ?? 0), 0);
  const time = totalSec >= 120 ? `${Math.round(totalSec / 60)} min` : `${sets.length} × ${first.sec ?? 0}s`;
  return km ? `${time}, ${+km.toFixed(2)} km` : time;
}

