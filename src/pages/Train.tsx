import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, ClipboardList, Dumbbell, History, Play, Plus, Search, Sparkles, Trophy } from 'lucide-react';
import { Empty, Segmented, Sheet, useToast } from '../components/ui';
import { ExercisePicker, QuickLogSheet, describeSets } from '../components/exercises';
import { useSelectedDate } from '../App';
import { PROGRAMS, type Program } from '../data/programs';
import { useExercises } from '../lib/catalog';
import { allAlive, db, save, useLive, useSettings } from '../lib/db';
import { fmtWeight, num, setsLabel, workoutKcal, workoutMinutes, workoutSets, workoutVolume } from '../lib/calc';
import { fmtDay, fmtDuration, relativeDay, today } from '../lib/date';
import { appendExercise, applyProgram, personalRecords, startFromRoutine, toWorkoutExercise, workoutTitle } from '../lib/workouts';
import type { Exercise, Workout } from '../lib/types';

type Tab = 'log' | 'routines' | 'history' | 'records';

export default function Train() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [date] = useSelectedDate();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('log');
  const [picking, setPicking] = useState(false);
  const [logging, setLogging] = useState<Exercise>();
  const [showPrograms, setShowPrograms] = useState(false);
  const workouts = useLive(() => allAlive(db.workouts));
  const routines = useLive(() => allAlive(db.routines));
  const sorted = useMemo(() => [...(workouts ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt), [workouts]);
  const onDay = sorted.filter((w) => w.date === date);
  const unit = settings?.weightUnit ?? 'kg';
  const kg = settings?.weightKg ?? 70;

  const start = async () => {
    const w = await save<Workout>('workouts', { date, name: '', startedAt: Date.now(), exercises: [] });
    nav(`/train/session/${w.id}`);
  };

  return (
    <>
      <div className="page-head">
        <h1>Train</h1>
        <Link to="/train/library" className="btn sm">Exercises</Link>
      </div>
      <div className="stack">
        <button className="card row" style={{ textAlign: 'left', width: '100%' }} onClick={() => setPicking(true)}>
          <span className="icon-tile" style={{ '--c': 'var(--workout)' } as React.CSSProperties}><Search size={18} /></span>
          <span className="grow">
            <span className="bold" style={{ display: 'block' }}>Search and log an exercise</span>
            <span className="small muted">Enter your sets and reps{date === today() ? '' : ` for ${relativeDay(date)}`}</span>
          </span>
          <Plus size={20} className="faint" />
        </button>
        <Segmented<Tab> value={tab} onChange={setTab} label="Training sections" options={[
          { value: 'log', label: date === today() ? 'Today' : relativeDay(date) }, { value: 'routines', label: 'Routines' }, { value: 'history', label: 'History' }, { value: 'records', label: 'Records' },
        ]} />

        {tab === 'log' && (
          <>
            {onDay.map((w) => <WorkoutCard key={w.id} w={w} kg={kg} unit={unit} />)}
            {!onDay.length && (
              <div className="card">
                <Empty icon={<Dumbbell size={28} />} title="Nothing logged yet">
                  <div className="row wrap" style={{ justifyContent: 'center' }}>
                    <button className="btn primary" onClick={start}><Play size={15} /> Start live workout</button>
                    <button className="btn" onClick={() => setTab('routines')}>Use a routine</button>
                  </div>
                  <p className="small muted" style={{ maxWidth: 340 }}>A live workout has a timer and a rest timer between sets. For a quick record, search above instead.</p>
                </Empty>
              </div>
            )}
            {onDay.length > 0 && <button className="btn" onClick={start}><Play size={15} /> Start another workout</button>}
          </>
        )}

        {tab === 'routines' && (
          <>
            <div className="row">
              <Link to="/train/routine/new" className="btn primary grow"><Plus size={16} /> New routine</Link>
              <button className="btn grow" onClick={() => setShowPrograms(true)}><Sparkles size={15} /> Ready-made plans</button>
            </div>
            {routines && routines.length > 0 ? (
              <div className="card flush list">
                {routines.map((r) => (
                  <div key={r.id} className="item">
                    <Link to={`/train/routine/${r.id}`} className="grow">
                      <div className="bold clip">{r.name}</div>
                      <div className="small muted clip">{r.exercises.map((e) => e.name).join(', ') || 'No exercises yet'}</div>
                    </Link>
                    <button className="btn sm primary" aria-label={`Start ${r.name}`} onClick={async () => { const w = await startFromRoutine(r, date); nav(`/train/session/${w.id}`); }}><Play size={13} /> Start</button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card"><Empty icon={<ClipboardList size={28} />} title="No routines yet"><p className="small muted">Save a workout you repeat, or start from a ready-made plan.</p></Empty></div>
            )}
          </>
        )}

        {tab === 'history' && (
          sorted.length ? (
            <div className="card flush list">
              {sorted.slice(0, 100).map((w) => (
                <Link key={w.id} to={`/train/session/${w.id}`} className="item">
                  <span className="grow">
                    <span className="bold clip" style={{ display: 'block' }}>{workoutTitle(w)}</span>
                    <span className="small muted clip" style={{ display: 'block' }}>
                      {fmtDay(w.date)} · {setsLabel(workoutSets(w))} · {fmtDuration(workoutMinutes(w))} · {workoutKcal(w, kg)} kcal
                    </span>
                  </span>
                  <ChevronRight size={17} className="faint" />
                </Link>
              ))}
            </div>
          ) : <div className="card"><Empty icon={<History size={28} />} title="No workouts yet" /></div>
        )}

        {tab === 'records' && <Records workouts={workouts ?? []} unit={unit} />}
      </div>

      {picking && (
        <ExercisePicker title="Log an exercise" onClose={() => setPicking(false)} onPick={(e) => setLogging(e)} />
      )}
      {logging && (
        <QuickLogSheet exercise={logging} date={date} onClose={() => setLogging(undefined)} onSave={async (sets) => {
          await appendExercise(date, toWorkoutExercise(logging, sets));
          setLogging(undefined);
          setPicking(false);
          setTab('log');
        }} />
      )}
      {showPrograms && <ProgramSheet onClose={() => setShowPrograms(false)} onApplied={(p) => { setShowPrograms(false); toast(`${p.name} added to your planner`); nav('/plan'); }} />}
    </>
  );
}

function WorkoutCard({ w, kg, unit }: { w: Workout; kg: number; unit: 'kg' | 'lb' }) {
  const volume = workoutVolume(w);
  return (
    <Link to={`/train/session/${w.id}`} className="card" style={{ display: 'block' }}>
      <div className="row between">
        <h2 className="clip">{workoutTitle(w)}</h2>
        <ChevronRight size={18} className="faint" />
      </div>
      <div className="row wrap small muted" style={{ gap: '2px 12px', margin: '3px 0 9px' }}>
        <span>{setsLabel(workoutSets(w))}</span>
        <span>{fmtDuration(workoutMinutes(w))}</span>
        <span>{workoutKcal(w, kg)} kcal</span>
        {volume > 0 && <span>{fmtWeight(volume, unit)} lifted</span>}
      </div>
      <ul className="stack tight small">
        {w.exercises.map((e) => (
          <li key={e.exerciseId} className="row between">
            <span className="clip">{e.name}</span>
            <span className="muted nowrap">{describeSets(e.sets.filter((s) => s.done), unit) || 'Not started'}</span>
          </li>
        ))}
      </ul>
    </Link>
  );
}

function Records({ workouts, unit }: { workouts: Workout[]; unit: 'kg' | 'lb' }) {
  const prs = useMemo(() => personalRecords(workouts), [workouts]);
  const totals = useMemo(() => ({
    count: workouts.filter((w) => workoutSets(w) > 0).length,
    sets: workouts.reduce((n, w) => n + workoutSets(w), 0),
    volume: workouts.reduce((n, w) => n + workoutVolume(w), 0),
  }), [workouts]);
  return (
    <>
      <div className="grid fit">
        <div className="card"><div className="small muted">Workouts</div><div className="big">{num(totals.count)}</div></div>
        <div className="card"><div className="small muted">Sets</div><div className="big">{num(totals.sets)}</div></div>
        <div className="card"><div className="small muted">Total lifted</div><div className="big">{fmtWeight(Math.round(totals.volume), unit)}</div></div>
      </div>
      {prs.length ? (
        <div className="card flush list">
          {prs.slice(0, 60).map((p) => (
            <Link key={p.exerciseId} to={`/train/exercise/${encodeURIComponent(p.exerciseId)}`} className="item">
              <Trophy size={17} className="faint" />
              <span className="grow">
                <span className="bold clip" style={{ display: 'block' }}>{p.name}</span>
                <span className="small muted">{fmtWeight(p.weight, unit)} × {p.reps} · {fmtDay(p.date)}</span>
              </span>
              <span className="small muted nowrap" title="Estimated one-rep max">{fmtWeight(Math.round(p.e1rm), unit)} 1RM</span>
            </Link>
          ))}
        </div>
      ) : <div className="card"><Empty icon={<Trophy size={28} />} title="No records yet"><p className="small muted">Log weighted sets and your bests appear here.</p></Empty></div>}
    </>
  );
}

export function ProgramSheet({ onClose, onApplied }: { onClose: () => void; onApplied: (p: Program) => void }) {
  const { all } = useExercises();
  const [busy, setBusy] = useState('');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <Sheet title="Ready-made plans" onClose={onClose} full>
      <div className="stack">
        <p className="small muted">Adds the routines and repeats them weekly in your planner. You can change anything afterwards.</p>
        {PROGRAMS.map((p) => (
          <div className="card" key={p.id}>
            <div className="row between top">
              <h2>{p.name}</h2>
              <span className="badge">{p.level}</span>
            </div>
            <p className="small muted" style={{ margin: '4px 0 8px' }}>{p.description}</p>
            <ul className="small stack tight" style={{ marginBottom: 10 }}>
              {p.days.map((d, i) => (
                <li key={d.name} className="row between"><span className="clip">{d.name}</span><span className="faint nowrap">{p.schedule[i].length === 7 ? 'Every day' : p.schedule[i].map((x) => days[x]).join(', ')}</span></li>
              ))}
            </ul>
            <button className="btn block" disabled={!all || !!busy} onClick={async () => {
              setBusy(p.id);
              await applyProgram(p, all!, today());
              onApplied(p);
            }}>{busy === p.id ? 'Adding…' : 'Use this plan'}</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

