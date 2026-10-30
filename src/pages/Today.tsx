import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CloudOff, Droplet, Dumbbell, Flame, Footprints, ListTodo, Moon, NotebookPen, Plus, Scale, Settings as Gear, Target, Timer, Utensils,
} from 'lucide-react';
import { CheckBox, DayRing, Field, METRIC_COLORS, Progress, useToast } from '../components/ui';
import { useSelectedDate } from '../App';
import { useSyncStatus } from '../lib/cloud';
import { allAlive, db, onDate, remove, save, useLive, useSettings, useStreakDays, useSummaries } from '../lib/db';
import { fmtWeight, num } from '../lib/calc';
import { addDays, dateRange, fmtDay, fmtDuration, relativeDay, sleepMinutes, today, weekStartOf, weekday, WEEKDAYS } from '../lib/date';
import { dayScore, pillars, STREAK_TESTS, streakOf, weeklyWorkoutStreak } from '../lib/summary';
import { plansOn } from '../lib/workouts';
import { addWater, SleepSheet, StepsSheet, WaterSheet, WeightSheet } from './Track';
import { HABIT_ICONS, habitKey, HabitCounter, PLAN_ICON, tapHabit, TaskRow, usePlanAction, type HabitIcon } from './Plan';
import { habitDueOn } from '../lib/summary';
import type { DaySummary, Habit, JournalEntry, PillarKey, Plan, Task } from '../lib/types';

const PILLAR_COLOR: Record<PillarKey, string> = METRIC_COLORS;
const MOODS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Today() {
  const settings = useSettings();
  const [date, setDate] = useSelectedDate();
  const [sheet, setSheet] = useState<'water' | 'sleep' | 'steps' | 'weight' | null>(null);
  const sync = useSyncStatus();
  const { toast } = useToast();
  const now = today();
  const weekStart = settings?.weekStart ?? 1;
  const wkStart = weekStartOf(date, weekStart);
  const weekDates = useMemo(() => dateRange(wkStart, addDays(wkStart, 6)), [wkStart]);
  const weekDays = useSummaries(weekDates[0], weekDates[6], settings);
  const history = useStreakDays(settings);
  const d = weekDays?.get(date);

  if (!settings) return null;
  const g = settings.goals;
  const p = d ? pillars(d, g) : [];
  const score = d ? dayScore(d, g) : 0;
  const met = p.filter((x) => x.met).length;
  const logStreak = history ? streakOf(history, now, STREAK_TESTS[0].test as (d: DaySummary) => boolean) : 0;
  const trainStreak = history ? weeklyWorkoutStreak(history, now, g.workoutsPerWeek, weekStart) : 0;

  const burned = (d?.workoutKcal ?? 0) + (d?.stepKcal ?? 0);
  const budget = g.kcal + (settings.eatBack ? d?.workoutKcal ?? 0 : 0);
  const left = budget - (d?.kcal ?? 0);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="small muted">{date === now ? `${greeting()}${settings.name ? `, ${settings.name}` : ''}` : fmtDay(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{relativeDay(date)}</h1>
        </div>
        {date !== now && <button className="btn sm" onClick={() => setDate(now)}>Back to today</button>}
        {sync.pending > 0 && (sync.state === 'offline' || sync.state === 'error') && (
          <Link to="/settings" className="icon-btn" aria-label={`${sync.pending} changes waiting to save`} title="Changes are waiting to save to your account"><CloudOff size={19} /></Link>
        )}
        <Link to="/settings" className="icon-btn" aria-label="Settings"><Gear size={19} /></Link>
      </div>

      <div className="row" style={{ gap: 2, marginBottom: 2 }}>
        <button className="icon-btn sm" aria-label="Previous week" onClick={() => setDate(addDays(date, -7))}><ChevronLeft size={17} /></button>
        <div className="datebar grow" style={{ marginBottom: 0 }}>
          {weekDates.map((x) => {
            const sum = weekDays?.get(x);
            const s = sum ? dayScore(sum, g) : 0;
            return (
              <button key={x} className={`${x === date ? 'on ' : ''}${x > now ? 'future' : ''}`} aria-current={x === date ? 'date' : undefined} aria-label={fmtDay(x)} onClick={() => setDate(x)}>
                {WEEKDAYS[weekday(x)].slice(0, 2)}
                <span className="d">{Number(x.slice(8))}</span>
                <i className={`dot ${s >= 80 ? 'good' : s > 0 ? 'some' : ''}`} />
              </button>
            );
          })}
        </div>
        <button className="icon-btn sm" aria-label="Next week" onClick={() => setDate(addDays(date, 7))}><ChevronRight size={17} /></button>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        <div className="card hero">
          <DayRing segments={p.map((x) => ({ key: x.key, progress: x.progress, color: PILLAR_COLOR[x.key] }))}>
            <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}>{score}</div>
            <div className="tiny faint">day score</div>
          </DayRing>
          <div className="stack tight grow">
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge accent" title="Days in a row with anything logged"><Flame size={13} /> {logStreak} day{logStreak === 1 ? '' : 's'}</span>
              <span className="badge" title={`Weeks in a row with ${g.workoutsPerWeek}+ workouts`}><Dumbbell size={13} /> {trainStreak} week{trainStreak === 1 ? '' : 's'}</span>
            </div>
            <div className="small muted">{met} of {p.length} goals met</div>
            <div className="pillar-list small">
              {p.map((x) => (
                <span key={x.key} className="row" style={{ gap: 6 }}>
                  <i className="swatch" style={{ '--c': PILLAR_COLOR[x.key] } as CSSProperties} />
                  <span className="clip">{x.label}</span>
                  <span className="faint tabular" style={{ marginLeft: 'auto' }}>{Math.round(x.progress * 100)}%</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <PlanCard date={date} />

        <div className="grid cards">
          <Tile title="Food" icon={<Utensils size={15} />} color={METRIC_COLORS.food} to="/eat" action={<Link to="/eat" className="btn sm"><Plus size={14} /> Log</Link>}>
            <div className="big">{num(Math.abs(left))}<span className="unit">kcal {left >= 0 ? 'left' : 'over'}</span></div>
            <div style={{ margin: '8px 0' }}><Progress value={(d?.kcal ?? 0) / budget} color={METRIC_COLORS.food} over={(d?.kcal ?? 0) > budget * 1.1} /></div>
            <div className="small muted row wrap" style={{ gap: '0 10px' }}>
              <span>{num(d?.kcal ?? 0)} eaten</span>
              <span>{num(burned)} burned</span>
              <span>P {Math.round(d?.protein ?? 0)}/{g.protein} g</span>
            </div>
          </Tile>

          <Tile title="Water" icon={<Droplet size={15} />} color={METRIC_COLORS.water} to="/track/water" action={
            <button className="btn sm" onClick={async () => {
              const row = await addWater(date, settings.glassMl);
              toast(`Added ${settings.glassMl} ml`, () => void remove('water', row.id));
            }}><Plus size={14} /> {settings.glassMl} ml</button>
          }>
            <button style={{ textAlign: 'left', width: '100%' }} onClick={() => setSheet('water')}>
              <div className="big">{num(d?.waterMl ?? 0)}<span className="unit">of {num(g.waterMl)} ml</span></div>
              <div style={{ margin: '8px 0' }}><Progress value={(d?.waterMl ?? 0) / g.waterMl} color={METRIC_COLORS.water} /></div>
              <div className="small muted">{Math.max(0, Math.ceil((g.waterMl - (d?.waterMl ?? 0)) / settings.glassMl))} glasses to go</div>
            </button>
          </Tile>

          <Tile title="Workout" icon={<Dumbbell size={15} />} color={METRIC_COLORS.workout} to="/train" action={<Link to="/train" className="btn sm"><Plus size={14} /> Log</Link>}>
            {d?.workouts ? (
              <>
                <div className="big">{d.sets}<span className="unit">{d.sets === 1 ? 'set' : 'sets'}</span></div>
                <div className="small muted" style={{ marginTop: 8 }}>{d.workouts} workout{d.workouts > 1 ? 's' : ''} · {num(d.workoutKcal)} kcal · {fmtDuration(d.activeMin)}</div>
              </>
            ) : (
              <>
                <div className="big">Not yet</div>
                <div className="small muted" style={{ marginTop: 8 }}>{d?.workoutPlanned ? 'A workout is planned for this day' : 'Search any exercise to log it'}</div>
              </>
            )}
          </Tile>

          <Tile title="Sleep" icon={<Moon size={15} />} color={METRIC_COLORS.sleep} to="/track/sleep" action={<button className="btn sm" onClick={() => setSheet('sleep')}>{d?.sleepMin ? 'Edit' : <><Plus size={14} /> Log</>}</button>}>
            <SleepBody date={date} d={d} goal={g.sleepMin} />
          </Tile>

          <Tile title="Steps" icon={<Footprints size={15} />} color={METRIC_COLORS.steps} to="/track/steps" action={<button className="btn sm" onClick={() => setSheet('steps')}>{d?.steps ? 'Edit' : <><Plus size={14} /> Log</>}</button>}>
            <div className="big">{num(d?.steps ?? 0)}<span className="unit">of {num(g.steps)}</span></div>
            <div style={{ margin: '8px 0' }}><Progress value={(d?.steps ?? 0) / g.steps} color={METRIC_COLORS.steps} /></div>
            <div className="small muted">{(d?.km ?? 0).toFixed(1)} km · {num(d?.stepKcal ?? 0)} kcal</div>
          </Tile>

          <Tile title="Focus" icon={<Timer size={15} />} color={METRIC_COLORS.focus} to="/plan?tab=focus" action={<Link to="/plan?tab=focus" className="btn sm">Start</Link>}>
            <div className="big">{fmtDuration(d?.focusMin ?? 0)}<span className="unit">of {fmtDuration(g.focusMin)}</span></div>
            <div style={{ margin: '8px 0' }}><Progress value={(d?.focusMin ?? 0) / (g.focusMin || 1)} color={METRIC_COLORS.focus} /></div>
            <div className="small muted">{d?.tasksDone ?? 0} task{d?.tasksDone === 1 ? '' : 's'} done</div>
          </Tile>

          <HabitsCard date={date} />
          <TasksCard date={date} />
          <BodyCard date={date} unit={settings.weightUnit} onLog={() => setSheet('weight')} />
          <JournalCard date={date} />
        </div>
      </div>

      {sheet === 'water' && <WaterSheet date={date} onClose={() => setSheet(null)} />}
      {sheet === 'sleep' && <SleepSheet date={date} onClose={() => setSheet(null)} />}
      {sheet === 'steps' && <StepsSheet date={date} onClose={() => setSheet(null)} />}
      {sheet === 'weight' && <WeightSheet date={date} onClose={() => setSheet(null)} />}
    </>
  );
}

function Tile({ title, icon, color, to, action, children }: { title: string; icon: ReactNode; color: string; to?: string; action?: ReactNode; children: ReactNode }) {
  const head = <span className="card-title"><span className="icon-tile" style={{ '--c': color, width: 26, height: 26, borderRadius: 8 } as CSSProperties}>{icon}</span>{title}</span>;
  return (
    <div className="card">
      <div className="card-head">
        {to ? <Link to={to}>{head}</Link> : head}
        {action}
      </div>
      {children}
    </div>
  );
}

function SleepBody({ date, d, goal }: { date: string; d?: DaySummary; goal: number }) {
  const logs = useLive(() => onDate(db.sleep, date), [date]);
  const row = logs?.[0];
  if (!d?.sleepMin || !row) {
    return (
      <>
        <div className="big">Not logged</div>
        <div className="small muted" style={{ marginTop: 8 }}>Goal: {fmtDuration(goal)}</div>
      </>
    );
  }
  return (
    <>
      <div className="big">{fmtDuration(d.sleepMin)}<span className="unit">of {fmtDuration(goal)}</span></div>
      <div style={{ margin: '8px 0' }}><Progress value={d.sleepMin / goal} color={METRIC_COLORS.sleep} /></div>
      <div className="small muted">{row.bed} – {row.wake} · Quality {row.quality}/5{row.napMin ? ` · ${fmtDuration(sleepMinutes(row.bed, row.wake))} + nap` : ''}</div>
    </>
  );
}

function PlanCard({ date }: { date: string }) {
  const plans = useLive(() => allAlive(db.plans));
  const act = usePlanAction();
  const nav = useNavigate();
  const items = plansOn(plans ?? [], date);
  if (!items.length) {
    return (
      <Link to="/plan" className="card row between">
        <span className="small muted">Nothing planned for this day</span>
        <span className="btn sm">Open planner</span>
      </Link>
    );
  }
  const left = items.filter((p) => !p.doneDates.includes(date)).length;
  return (
    <div className="card">
      <div className="card-head">
        <h2>Plan</h2>
        <button className="btn ghost sm" onClick={() => nav('/plan')}>{left ? `${left} to do` : 'All done'}<ChevronRight size={14} /></button>
      </div>
      {items.map((p: Plan) => {
        const Icon = PLAN_ICON[p.kind];
        const done = p.doneDates.includes(date);
        return (
          <div key={p.id} className={`plan-item${done ? ' done' : ''}`}>
            <CheckBox on={done} label={`${p.title} done`} onClick={() => act(p, date)} />
            <span className="grow plan-title clip" style={{ fontWeight: 550 }}>{p.title}</span>
            {p.time && <span className="tiny faint">{p.time}</span>}
            <Icon size={15} className="faint" />
            {p.kind === 'workout' && !done && <button className="btn sm primary" onClick={() => act(p, date)}>Start</button>}
          </div>
        );
      })}
    </div>
  );
}

function HabitsCard({ date }: { date: string }) {
  const habits = useLive(() => allAlive(db.habits));
  const logs = useLive(() => onDate(db.habitLogs, date), [date]);
  const due = (habits ?? []).filter((h: Habit) => habitDueOn(h, date)).sort((a, b) => a.order - b.order);
  const byId = new Map((logs ?? []).map((l) => [l.id, l]));
  return (
    <Tile title="Habits" icon={<Target size={15} />} color={METRIC_COLORS.habits} to="/plan?tab=habits" action={<Link to="/plan?tab=habits" className="btn sm">{due.length ? 'All' : <><Plus size={14} /> Add</>}</Link>}>
      {due.length ? (
        <div>
          {due.slice(0, 5).map((h) => {
            const Icon = HABIT_ICONS[h.icon as HabitIcon] ?? Target;
            const log = byId.get(habitKey(h.id, date));
            return (
              <div className="plan-item" key={h.id}>
                <Icon size={16} className="faint" />
                <span className="grow clip">{h.name}</span>
                {h.target > 1
                  ? <HabitCounter h={h} value={log?.value ?? 0} date={date} />
                  : <CheckBox on={(log?.value ?? 0) >= 1} color={METRIC_COLORS.habits} label={`${h.name} done`} onClick={() => tapHabit(h, log, date)} />}
              </div>
            );
          })}
        </div>
      ) : <div className="small muted">No habits due. Add one you want to keep up.</div>}
    </Tile>
  );
}

function TasksCard({ date }: { date: string }) {
  const tasks = useLive(() => allAlive(db.tasks));
  const [text, setText] = useState('');
  const nav = useNavigate();
  const rows = (tasks ?? [])
    .filter((t: Task) => t.date === date || (date === today() && !t.done && t.date && t.date < date))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.priority - b.priority);
  return (
    <Tile title="Tasks" icon={<ListTodo size={15} />} color="var(--ink-2)" to="/plan?tab=tasks">
      <form className="row" style={{ marginBottom: 4 }} onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await save<Task>('tasks', { title: text.trim(), date, priority: 2, done: false });
        setText('');
      }}>
        <input className="input" style={{ minHeight: 36 }} value={text} placeholder="Add a task" aria-label="New task" onChange={(e) => setText(e.target.value)} />
        <button className="icon-btn filled" style={{ width: 36, height: 36 }} aria-label="Add task" disabled={!text.trim()}><Plus size={16} /></button>
      </form>
      <div style={{ margin: '0 -15px' }}>
        {rows.slice(0, 5).map((t) => <TaskRow key={t.id} t={t} onEdit={() => nav('/plan?tab=tasks')} />)}
      </div>
    </Tile>
  );
}

function BodyCard({ date, unit, onLog }: { date: string; unit: 'kg' | 'lb'; onLog: () => void }) {
  const rows = useLive(() => allAlive(db.body));
  const sorted = [...(rows ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted.find((r) => r.date <= date);
  const previous = latest && sorted.find((r) => r.date < latest.date);
  const diff = latest && previous ? latest.kg - previous.kg : 0;
  return (
    <Tile title="Body" icon={<Scale size={15} />} color="var(--ink-2)" to="/track/body" action={<button className="btn sm" onClick={onLog}><Plus size={14} /> Log</button>}>
      {latest ? (
        <>
          <div className="big">{fmtWeight(latest.kg, unit)}</div>
          <div className="small muted" style={{ marginTop: 8 }}>{relativeDay(latest.date)}{previous && diff !== 0 ? ` · ${diff > 0 ? '+' : ''}${fmtWeight(diff, unit)} since last` : ''}</div>
        </>
      ) : <div className="small muted">Weigh in weekly or more to see your trend.</div>}
    </Tile>
  );
}

function JournalCard({ date }: { date: string }) {
  const entry = useLive(() => db.journal.get(`journal:${date}`), [date]);
  const row = entry && !entry.deleted ? entry : undefined;
  const update = (patch: Partial<JournalEntry>) => save<JournalEntry>('journal', { id: `journal:${date}`, date, mood: row?.mood, energy: row?.energy, note: row?.note, ...patch });
  return (
    <Tile title="Mood and notes" icon={<NotebookPen size={15} />} color="var(--ink-2)">
      <div className="stack">
        <div className="mood-row" role="group" aria-label="Mood">
          {MOODS.map((m, i) => <button key={m} aria-pressed={row?.mood === i + 1} className={row?.mood === i + 1 ? 'on' : ''} onClick={() => update({ mood: row?.mood === i + 1 ? undefined : i + 1 })}>{m}</button>)}
        </div>
        <Field label={<span className="sr">Note</span>}>
          <textarea key={date} className="input" style={{ minHeight: 56 }} defaultValue={row?.note ?? ''} placeholder="How did today go?" onBlur={(e) => { if (e.target.value !== (row?.note ?? '')) void update({ note: e.target.value }); }} />
        </Field>
      </div>
    </Tile>
  );
}
