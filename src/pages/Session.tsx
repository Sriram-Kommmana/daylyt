import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, MoreHorizontal, Plus, Repeat, Save, Timer, Trash2, Trophy } from 'lucide-react';
import { CheckBox, Field, LiveText, NumInput, Sheet, useToast } from '../components/ui';
import { ExercisePicker } from '../components/exercises';
import { useSelectedDate } from '../App';
import { allAlive, db, remove, save, useLive, useSettings } from '../lib/db';
import { fmtWeight, fromKg, roundTo, setsLabel, toKg, workoutKcal, workoutMinutes, workoutSets, workoutVolume } from '../lib/calc';
import { fmtClock, fmtDay, fmtDuration, today } from '../lib/date';
import { useTimers } from '../lib/timers';
import { isPR, lastSets, repeatWorkout, saveAsRoutine, toWorkoutExercise, workoutTitle } from '../lib/workouts';
import type { Routine, Workout, WorkoutExercise, WorkoutSet } from '../lib/types';

export function SetRows({ ex, unit, previous, onChange, onToggle, plan, prFor }: {
  ex: WorkoutExercise; unit: 'kg' | 'lb'; previous?: WorkoutSet[]; onChange: (sets: WorkoutSet[]) => void; onToggle?: (i: number, done: boolean) => void; plan?: boolean; prFor?: (s: WorkoutSet) => boolean;
}) {
  const put = (i: number, patch: Partial<WorkoutSet>) => onChange(ex.sets.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const prevText = (i: number) => {
    const p = previous?.[i];
    if (!p) return '—';
    if (ex.kind === 'reps') return p.weight ? `${+fromKg(p.weight, unit).toFixed(1)}×${p.reps}` : `${p.reps}`;
    return p.sec ? (ex.kind === 'cardio' ? `${Math.round(p.sec / 60)}m` : `${p.sec}s`) : '—';
  };
  return (
    <table className="set-table">
      <thead>
        <tr>
          <th scope="col">Set</th>
          {!plan && <th scope="col">Last</th>}
          {ex.kind === 'reps' && <><th scope="col">{unit}</th><th scope="col">Reps</th></>}
          {ex.kind === 'time' && <th scope="col">Seconds</th>}
          {ex.kind === 'cardio' && <><th scope="col">Min</th><th scope="col">Km</th></>}
          <th scope="col"><span className="sr">{plan ? 'Remove' : 'Done'}</span></th>
        </tr>
      </thead>
      <tbody>
        {ex.sets.map((s, i) => (
          <tr key={i} className={s.done && !plan ? 'done' : ''}>
            <td>
              <button className="tabular" title="Mark as warm-up" aria-label={`Set ${i + 1}, toggle warm-up`} onClick={() => put(i, { warmup: !s.warmup })} style={{ color: s.warmup ? 'var(--focus)' : undefined, fontWeight: 650 }}>
                {s.warmup ? 'W' : i + 1 - ex.sets.slice(0, i).filter((x) => x.warmup).length}
              </button>
            </td>
            {!plan && <td className="small faint tabular">{prevText(i)}</td>}
            {ex.kind === 'reps' && (
              <>
                <td><NumInput className="set-input" label={`Set ${i + 1} weight`} placeholder="—" value={s.weight != null ? +fromKg(s.weight, unit).toFixed(2) : undefined} onChange={(v) => put(i, { weight: v != null ? toKg(v, unit) : undefined })} /></td>
                <td><NumInput className="set-input" label={`Set ${i + 1} reps`} placeholder="0" value={s.reps} onChange={(v) => put(i, { reps: v })} /></td>
              </>
            )}
            {ex.kind === 'time' && <td><NumInput className="set-input" label={`Set ${i + 1} seconds`} placeholder="0" value={s.sec} onChange={(v) => put(i, { sec: v })} /></td>}
            {ex.kind === 'cardio' && (
              <>
                <td><NumInput className="set-input" label={`Set ${i + 1} minutes`} placeholder="0" value={s.sec != null ? +(s.sec / 60).toFixed(1) : undefined} onChange={(v) => put(i, { sec: v != null ? v * 60 : undefined })} /></td>
                <td><NumInput className="set-input" label={`Set ${i + 1} distance`} placeholder="—" value={s.km} onChange={(v) => put(i, { km: v })} /></td>
              </>
            )}
            <td>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 3 }}>
                {prFor?.(s) && <Trophy size={15} aria-label="Personal record" style={{ color: 'var(--focus)' }} />}
                {plan
                  ? <button className="icon-btn sm" aria-label={`Remove set ${i + 1}`} onClick={() => onChange(ex.sets.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
                  : <CheckBox on={s.done} color="var(--workout)" label={`Set ${i + 1} done`} onClick={() => { put(i, { done: !s.done }); onToggle?.(i, !s.done); }} />}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const nextSet = (ex: WorkoutExercise): WorkoutSet => {
  const last = ex.sets[ex.sets.length - 1];
  return last ? { ...last, done: false, warmup: false } : ex.kind === 'reps' ? { reps: 10, done: false } : ex.kind === 'cardio' ? { sec: 1800, done: false } : { sec: 60, done: false };
};

export default function Session() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [, setDate] = useSelectedDate();
  const settings = useSettings();
  const timers = useTimers();
  const workout = useLive(() => db.workouts.get(id ?? ''), [id]);
  const all = useLive(() => allAlive(db.workouts));
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [now, setNow] = useState(Date.now());
  const unit = settings?.weightUnit ?? 'kg';
  const kg = settings?.weightKg ?? 70;
  const running = !!workout?.startedAt && !workout.endedAt && workout.date === today();

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const update = (patch: Partial<Workout>) => { if (workout) void save<Workout>('workouts', { ...workout, ...patch }); };
  const setExercise = (i: number, next: WorkoutExercise) => update({ exercises: workout!.exercises.map((e, k) => (k === i ? next : e)) });
  const move = (i: number, by: number) => {
    const list = [...workout!.exercises];
    const [row] = list.splice(i, 1);
    list.splice(i + by, 0, row);
    update({ exercises: list });
    setMenu(null);
  };

  const others = useMemo(() => all ?? [], [all]);

  if (workout === undefined) return null;
  if (!workout || workout.deleted) {
    return <div className="empty">This workout no longer exists. <Link className="btn" to="/train">Back to Train</Link></div>;
  }

  const finish = () => {
    update({ endedAt: Date.now() });
    timers.stopRest();
    toast('Workout saved');
    setDate(workout.date);
    nav('/train');
  };

  return (
    <>
      <Link to="/train" className="back"><ChevronLeft size={17} /> Train</Link>
      <div className="stack">
        <div className="card">
          <div className="row between">
            <LiveText className="input" style={{ border: 0, padding: 0, minHeight: 0, fontFamily: 'var(--display)', fontWeight: 700, fontSize: 21, background: 'transparent', boxShadow: 'none' }}
              aria-label="Workout name" value={workout.name} placeholder={workoutTitle(workout)} onChange={(name) => update({ name })} />
            <button className="icon-btn filled" aria-label="More options" onClick={() => setMore(true)}><MoreHorizontal size={18} /></button>
          </div>
          <div className="row wrap small muted" style={{ gap: '2px 14px', marginTop: 6 }}>
            <span>{fmtDay(workout.date)}</span>
            {running && <span className="bold tabular" style={{ color: 'var(--ink)' }}><Timer size={13} style={{ verticalAlign: -2 }} /> {fmtClock((now - workout.startedAt!) / 1000)}</span>}
            {!running && <span>{fmtDuration(workoutMinutes(workout))}</span>}
            <span>{setsLabel(workoutSets(workout))}</span>
            <span>{workoutKcal(workout, kg)} kcal</span>
            {workoutVolume(workout) > 0 && <span>{fmtWeight(Math.round(workoutVolume(workout)), unit)}</span>}
          </div>
        </div>

        {workout.exercises.map((ex, i) => (
          <div className="card" key={`${ex.exerciseId}-${i}`}>
            <div className="row between" style={{ marginBottom: 8 }}>
              <Link to={`/train/exercise/${encodeURIComponent(ex.exerciseId)}`} className="grow">
                <h3 className="clip">{ex.name}</h3>
                <div className="tiny faint clip" style={{ textTransform: 'capitalize' }}>{ex.primary.join(', ')}</div>
              </Link>
              <button className="icon-btn sm" aria-label={`Options for ${ex.name}`} onClick={() => setMenu(i)}><MoreHorizontal size={17} /></button>
            </div>
            <SetRows
              ex={ex} unit={unit}
              previous={lastSets(others, ex.exerciseId, workout.date, workout.id)}
              onChange={(sets) => setExercise(i, { ...ex, sets })}
              prFor={(s) => isPR(others, workout.id, workout.date, ex.exerciseId, s)}
              onToggle={(_, done) => {
                if (done && running && ex.kind !== 'cardio' && settings?.restSec) timers.startRest(settings.restSec);
              }}
            />
            <button className="btn ghost sm block" style={{ marginTop: 6 }} onClick={() => setExercise(i, { ...ex, sets: [...ex.sets, nextSet(ex)] })}><Plus size={14} /> Add set</button>
          </div>
        ))}

        <button className="btn block" onClick={() => setPicking(true)}><Plus size={16} /> Add exercise</button>
        {running && <button className="btn primary block" onClick={finish}>Finish workout</button>}
      </div>

      {picking && (
        <ExercisePicker multi onClose={() => setPicking(false)} onPickMany={(list) => {
          update({ exercises: [...workout.exercises, ...list.map((e) => {
            const ex = toWorkoutExercise(e);
            const prev = lastSets(others, e.id, workout.date, workout.id);
            const seed = prev?.length ? prev.map((s) => ({ ...s, done: false })) : [nextSet(ex), nextSet(ex), nextSet(ex)].slice(0, e.kind === 'cardio' ? 1 : 3);
            return { ...ex, sets: seed };
          })] });
          setPicking(false);
        }} />
      )}

      {menu !== null && workout.exercises[menu] && (
        <Sheet title={workout.exercises[menu].name} onClose={() => setMenu(null)}>
          <div className="stack tight">
            <Field label="Note"><LiveText className="input" value={workout.exercises[menu].note ?? ''} placeholder="Seat height, grip, how it felt…" onChange={(note) => setExercise(menu, { ...workout.exercises[menu], note })} /></Field>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn grow" disabled={menu === 0} onClick={() => move(menu, -1)}><ArrowUp size={15} /> Move up</button>
              <button className="btn grow" disabled={menu === workout.exercises.length - 1} onClick={() => move(menu, 1)}><ArrowDown size={15} /> Move down</button>
            </div>
            <button className="btn danger" onClick={() => { update({ exercises: workout.exercises.filter((_, k) => k !== menu) }); setMenu(null); }}><Trash2 size={15} /> Remove from workout</button>
          </div>
        </Sheet>
      )}

      {more && (
        <MoreSheet workout={workout} unitKcal={workoutKcal(workout, kg)} onClose={() => setMore(false)} onUpdate={update}
          onRepeat={async () => { const w = await repeatWorkout(workout, today()); setMore(false); setDate(today()); nav(`/train/session/${w.id}`); }}
          onDelete={async () => { await remove('workouts', workout.id); toast('Workout deleted'); nav('/train'); }} />
      )}
    </>
  );
}

function MoreSheet({ workout, unitKcal, onClose, onUpdate, onRepeat, onDelete }: {
  workout: Workout; unitKcal: number; onClose: () => void; onUpdate: (p: Partial<Workout>) => void; onRepeat: () => void; onDelete: () => void;
}) {
  const { toast } = useToast();
  const [routineName, setRoutineName] = useState(workoutTitle(workout));
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet title="Workout options" onClose={onClose}>
      <div className="stack">
        <div className="grid two">
          <Field label="Duration (minutes)" hint="Blank uses the timer or an estimate"><NumInput value={workout.minutes} placeholder={String(workoutMinutes({ ...workout, minutes: undefined }))} onChange={(v) => onUpdate({ minutes: v })} /></Field>
          <Field label="Calories burned" hint="Blank uses the estimate"><NumInput value={workout.kcalOverride} placeholder={String(unitKcal)} onChange={(v) => onUpdate({ kcalOverride: v != null ? roundTo(v, 1) : undefined })} /></Field>
        </div>
        <Field label="Date"><input className="input" type="date" value={workout.date} onChange={(e) => { if (e.target.value) onUpdate({ date: e.target.value }); }} /></Field>
        <Field label="Notes"><LiveText multiline className="input" value={workout.note ?? ''} onChange={(note) => onUpdate({ note })} /></Field>
        <Field label="Save as a routine">
          <div className="row">
            <input className="input" value={routineName} onChange={(e) => setRoutineName(e.target.value)} />
            <button className="btn" disabled={!routineName.trim() || !workout.exercises.length} onClick={async () => { await saveAsRoutine(workout, routineName.trim()) as Routine; toast('Routine saved'); onClose(); }}><Save size={15} /> Save</button>
          </div>
        </Field>
        <button className="btn" onClick={onRepeat}><Repeat size={15} /> Repeat this workout today</button>
        {confirm
          ? <button className="btn danger" onClick={onDelete}>Tap again to delete for good</button>
          : <button className="btn danger" onClick={() => setConfirm(true)}><Trash2 size={15} /> Delete workout</button>}
      </div>
    </Sheet>
  );
}
