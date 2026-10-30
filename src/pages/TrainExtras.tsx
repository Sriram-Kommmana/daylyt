import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, MoreHorizontal, Play, Plus, Trash2 } from 'lucide-react';
import { Empty, Field, SearchBox, Sheet, useToast } from '../components/ui';
import { ChartTable, LineChart } from '../components/charts';
import { ExercisePicker, ExerciseThumb, QuickLogSheet, describeSets } from '../components/exercises';
import { useSelectedDate } from '../App';
import { exerciseImage, useExercises } from '../lib/catalog';
import { allAlive, db, remove, save, useLive, useSettings } from '../lib/db';
import { fromKg, oneRepMax } from '../lib/calc';
import { dateRange, fmtDay } from '../lib/date';
import { search } from '../lib/search';
import { appendExercise, bestSet, historyOf, startFromRoutine, toWorkoutExercise } from '../lib/workouts';
import { SetRows, nextSet } from './Session';
import type { Exercise, Routine, WorkoutExercise } from '../lib/types';

export function Library() {
  const { idx, all } = useExercises();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(60);
  const rows = useMemo(() => search(idx, q), [idx, q]);
  return (
    <>
      <Link to="/train" className="back"><ChevronLeft size={17} /> Train</Link>
      <div className="page-head"><h1>Exercises</h1><span className="small muted">{all?.length.toLocaleString()} total</span></div>
      <div className="stack">
        <SearchBox value={q} onChange={(v) => { setQ(v); setLimit(60); }} placeholder="Search by name, muscle or equipment" />
        <div className="card flush list">
          {rows.slice(0, limit).map((e) => (
            <Link key={e.id} to={`/train/exercise/${encodeURIComponent(e.id)}`} className="item">
              <ExerciseThumb e={e} />
              <span className="grow">
                <span className="bold clip" style={{ display: 'block' }}>{e.name}</span>
                <span className="small muted clip" style={{ display: 'block', textTransform: 'capitalize' }}>{e.primary.join(', ') || e.category} · {e.equipment}</span>
              </span>
            </Link>
          ))}
        </div>
        {rows.length > limit && <button className="btn block" onClick={() => setLimit(limit + 100)}>Show more</button>}
      </div>
    </>
  );
}

export function ExerciseDetail() {
  const { id } = useParams();
  const decoded = decodeURIComponent(id ?? '');
  const { all } = useExercises();
  const settings = useSettings();
  const [date] = useSelectedDate();
  const workouts = useLive(() => allAlive(db.workouts));
  const [logging, setLogging] = useState(false);
  const [frame, setFrame] = useState(0);
  const exercise = all?.find((e) => e.id === decoded);
  const unit = settings?.weightUnit ?? 'kg';
  const history = useMemo(() => historyOf(workouts ?? [], decoded), [workouts, decoded]);

  if (!all) return null;
  if (!exercise) return <div className="empty">Exercise not found. <Link className="btn" to="/train/library">All exercises</Link></div>;

  const points = chartPoints(history, unit, exercise);
  return (
    <>
      <Link to="/train" className="back"><ChevronLeft size={17} /> Train</Link>
      <div className="stack">
        <div className="card">
          <div className="row between top">
            <h1 style={{ fontSize: 22 }}>{exercise.name}</h1>
            <button className="btn primary sm" onClick={() => setLogging(true)}><Plus size={14} /> Log</button>
          </div>
          <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
            {[...exercise.primary, exercise.equipment, exercise.level].map((t) => <span key={t} className="badge" style={{ textTransform: 'capitalize' }}>{t}</span>)}
            {exercise.met && <span className="badge" title="Metabolic equivalent, used for calorie estimates">MET {exercise.met}</span>}
          </div>
          {exercise.images.length > 0 && (
            <button style={{ display: 'block', width: '100%', marginTop: 12 }} aria-label="Show next position" onClick={() => setFrame((frame + 1) % exercise.images.length)}>
              <img className="ex-img" alt={`${exercise.name}, position ${frame + 1}`} loading="lazy" src={exerciseImage(exercise.images[frame])} />
            </button>
          )}
        </div>
        {exercise.instructions.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: 8 }}>How to do it</h2>
            <ol className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 7 }}>
              {exercise.instructions.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
            {exercise.secondary.length > 0 && <p className="small muted" style={{ marginTop: 10, textTransform: 'capitalize' }}>Also works: {exercise.secondary.join(', ')}</p>}
          </div>
        )}
        <div className="card">
          <h2 style={{ marginBottom: 8 }}>Your progress</h2>
          {history.length ? (
            <div className="stack">
              {points.length > 1 && (
                <div>
                  <div className="small muted" style={{ marginBottom: 4 }}>{points.label}</div>
                  <LineChart points={points.line} color="var(--workout)" ariaLabel={`${exercise.name} progress`} fmt={(v) => `${+v.toFixed(1)} ${points.suffix}`} />
                  <ChartTable head={['Date', points.label]} rows={points.line.filter((p) => p.value != null).map((p) => [fmtDay(p.date), `${+(p.value ?? 0).toFixed(1)} ${points.suffix}`])} />
                </div>
              )}
              <ul className="list small">
                {[...history].reverse().slice(0, 12).map((h) => (
                  <li key={h.workoutId + h.date} className="row between" style={{ padding: '7px 0' }}>
                    <Link to={`/train/session/${h.workoutId}`} className="muted">{fmtDay(h.date)}</Link>
                    <span>{describeSets(h.sets, unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="small muted">Log this exercise and your progress will chart here.</p>}
        </div>
      </div>
      {logging && (
        <QuickLogSheet exercise={exercise} date={date} onClose={() => setLogging(false)} onSave={async (sets) => {
          await appendExercise(date, toWorkoutExercise(exercise, sets));
          setLogging(false);
        }} />
      )}
    </>
  );
}

function chartPoints(history: ReturnType<typeof historyOf>, unit: 'kg' | 'lb', exercise: Exercise) {
  if (!history.length) return { line: [], length: 0, label: '', suffix: '' };
  const weighted = history.some((h) => h.sets.some((s) => s.weight));
  const value = (h: (typeof history)[number]) => {
    if (weighted) {
      const b = bestSet(h.sets);
      return b ? fromKg(oneRepMax(b.weight ?? 0, b.reps ?? 0), unit) : null;
    }
    if (exercise.kind === 'reps') return Math.max(...h.sets.map((s) => s.reps ?? 0));
    return h.sets.reduce((t, s) => t + (s.sec ?? 0), 0) / 60;
  };
  const byDate = new Map<string, number | null>();
  for (const h of history) byDate.set(h.date, Math.max(byDate.get(h.date) ?? 0, value(h) ?? 0));
  const line = dateRange(history[0].date, history[history.length - 1].date).map((date) => ({ date, value: byDate.get(date) ?? null }));
  return {
    line,
    length: byDate.size,
    label: weighted ? 'Estimated one-rep max' : exercise.kind === 'reps' ? 'Most reps in a set' : 'Total minutes',
    suffix: weighted ? unit : exercise.kind === 'reps' ? 'reps' : 'min',
  };
}

export function RoutineEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const settings = useSettings();
  const [date] = useSelectedDate();
  const isNew = id === 'new';
  const stored = useLive(() => (isNew ? Promise.resolve(undefined) : db.routines.get(id ?? '')), [id]);
  const [draft, setDraft] = useState<Pick<Routine, 'name' | 'exercises'> & { id?: string }>();
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const routine = draft ?? stored ?? (isNew ? { name: '', exercises: [] as WorkoutExercise[] } : undefined);
  const unit = settings?.weightUnit ?? 'kg';

  if (!routine) return null;
  const change = (patch: Partial<Routine>) => setDraft({ ...routine, ...patch });
  const store = async () => save<Routine>('routines', { ...routine, name: routine.name.trim() || 'Untitled routine' });

  return (
    <>
      <Link to="/train" className="back"><ChevronLeft size={17} /> Train</Link>
      <div className="stack">
        <Field label="Routine name"><input className="input" value={routine.name} autoFocus={isNew} placeholder="Push day" onChange={(e) => change({ name: e.target.value })} /></Field>
        {routine.exercises.map((ex, i) => (
          <div className="card" key={`${ex.exerciseId}-${i}`}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <h3 className="clip">{ex.name}</h3>
              <button className="icon-btn sm" aria-label={`Remove ${ex.name}`} onClick={() => setMenu(i)}><MoreHorizontal size={17} /></button>
            </div>
            <SetRows plan ex={ex} unit={unit} onChange={(sets) => change({ exercises: routine.exercises.map((e, k) => (k === i ? { ...e, sets } : e)) })} />
            <button className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => change({ exercises: routine.exercises.map((e, k) => (k === i ? { ...e, sets: [...e.sets, nextSet(e)] } : e)) })}><Plus size={14} /> Add set</button>
          </div>
        ))}
        {!routine.exercises.length && <div className="card"><Empty title="Add the exercises for this routine" /></div>}
        <button className="btn block" onClick={() => setPicking(true)}><Plus size={16} /> Add exercises</button>
        <div className="row">
          <button className="btn primary grow" disabled={!routine.exercises.length} onClick={async () => { await store(); toast('Routine saved'); nav('/train'); }}>Save routine</button>
          {!isNew && <button className="btn grow" onClick={async () => { const r = await store(); const w = await startFromRoutine(r, date); nav(`/train/session/${w.id}`); }}><Play size={15} /> Save and start</button>}
        </div>
        {!isNew && <button className="btn danger" onClick={async () => { await remove('routines', id!); toast('Routine deleted'); nav('/train'); }}><Trash2 size={15} /> Delete routine</button>}
      </div>
      {picking && (
        <ExercisePicker multi onClose={() => setPicking(false)} onPickMany={(list) => {
          change({ exercises: [...routine.exercises, ...list.map((e) => {
            const ex = toWorkoutExercise(e);
            return { ...ex, sets: Array.from({ length: e.kind === 'cardio' ? 1 : 3 }, () => nextSet(ex)) };
          })] });
          setPicking(false);
        }} />
      )}
      {menu !== null && routine.exercises[menu] && (
        <Sheet title={routine.exercises[menu].name} onClose={() => setMenu(null)}>
          <button className="btn danger block" onClick={() => { change({ exercises: routine.exercises.filter((_, k) => k !== menu) }); setMenu(null); }}><Trash2 size={15} /> Remove from routine</button>
        </Sheet>
      )}
    </>
  );
}

