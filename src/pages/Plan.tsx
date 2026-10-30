import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Apple, BedDouble, BookOpen, CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, Coffee, Droplet, Dumbbell, Flag, Flame, Footprints, Heart,
  Leaf, ListTodo, Moon, Pause, Pencil, Pill, Play, Plus, Smartphone, Sparkles, Square, Sun, Target, Trash2, Utensils, X,
} from 'lucide-react';
import { CheckBox, Empty, Field, METRIC_COLORS, NumInput, Segmented, Sheet, Stepper, WeekdayPicker, useToast } from '../components/ui';
import { ProgramSheet } from './Train';
import { FoodPicker, mealForNow, type LogDraft } from './Eat';
import { useSelectedDate } from '../App';
import { allAlive, db, remove, save, useLive, useSettings } from '../lib/db';
import { num } from '../lib/calc';
import { addDays, dateRange, fmtClock, fmtDay, fmtDuration, relativeDay, today, weekStartOf, weekday, WEEKDAYS } from '../lib/date';
import { downloadFile } from '../lib/sync';
import { habitDueOn } from '../lib/summary';
import { useTimers } from '../lib/timers';
import { plansOn, removePlanOn, startFromRoutine, togglePlanDone } from '../lib/workouts';
import type { FocusLog, FoodLog, Habit, HabitLog, Plan, PlanKind, PlanMealItem, Priority, Task, Workout } from '../lib/types';

type Tab = 'week' | 'tasks' | 'habits' | 'focus';

export default function PlanPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'week';
  return (
    <>
      <div className="page-head"><h1>Plan</h1></div>
      <div className="stack">
        <Segmented<Tab> value={tab} onChange={(t) => setParams(t === 'week' ? {} : { tab: t }, { replace: true })} label="Planning sections" options={[
          { value: 'week', label: 'Week' }, { value: 'tasks', label: 'Tasks' }, { value: 'habits', label: 'Habits' }, { value: 'focus', label: 'Focus' },
        ]} />
        {tab === 'week' && <WeekView />}
        {tab === 'tasks' && <TasksView />}
        {tab === 'habits' && <HabitsView />}
        {tab === 'focus' && <FocusView />}
      </div>
    </>
  );
}

// ---- Week planner ----

export const PLAN_ICON: Record<PlanKind, typeof Dumbbell> = { workout: Dumbbell, meal: Utensils, other: CalendarDays };

/** Runs a plan's main action: opens the workout, logs the meal, or ticks it off. */
export function usePlanAction() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [, setDate] = useSelectedDate();
  return async (p: Plan, date: string) => {
    if (p.doneDates.includes(date)) { await togglePlanDone(p, date); return; }
    if (p.kind === 'workout') {
      const routine = p.routineId ? await db.routines.get(p.routineId) : undefined;
      await togglePlanDone(p, date);
      setDate(date);
      if (routine && !routine.deleted) {
        const w = await startFromRoutine(routine, date, p.id);
        nav(`/train/session/${w.id}`);
      } else {
        const w = await save<Workout>('workouts', { date, name: p.title, startedAt: Date.now(), exercises: [], planId: p.id });
        nav(`/train/session/${w.id}`);
      }
      return;
    }
    if (p.kind === 'meal' && p.meals?.length) {
      for (const m of p.meals) await save<FoodLog>('foodLogs', { ...m, date });
      toast(`Logged ${p.title}`);
    }
    await togglePlanDone(p, date);
  };
}

function WeekView() {
  const settings = useSettings();
  const weekStart = settings?.weekStart ?? 1;
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState<string>();
  const [editing, setEditing] = useState<{ plan: Plan; date: string }>();
  const [programs, setPrograms] = useState(false);
  const { toast } = useToast();
  const plans = useLive(() => allAlive(db.plans));
  const tasks = useLive(() => allAlive(db.tasks));
  const act = usePlanAction();
  const now = today();
  const start = addDays(weekStartOf(now, weekStart), offset * 7);
  const days = dateRange(start, addDays(start, 6));
  const title = offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(days[6], { day: 'numeric', month: 'short' })}`;

  return (
    <>
      <div className="row between">
        <div className="row" style={{ gap: 2 }}>
          <button className="icon-btn" aria-label="Previous week" onClick={() => setOffset(offset - 1)}><ChevronLeft size={19} /></button>
          <h2 className="nowrap" style={{ minWidth: 92, textAlign: 'center' }}>{title}</h2>
          <button className="icon-btn" aria-label="Next week" onClick={() => setOffset(offset + 1)}><ChevronRight size={19} /></button>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm" onClick={() => setPrograms(true)}><Sparkles size={13} /> Plans</button>
          <button className="icon-btn filled sm" aria-label="Export plan to calendar" title="Export to your phone's calendar for reminders" onClick={() => {
            downloadFile('daylyt-plan.ics', plansToIcs(plans ?? []), 'text/calendar');
            toast('Open the file to add reminders to your calendar');
          }}><CalendarPlus size={15} /></button>
        </div>
      </div>
      <div className="week wide">
        {days.map((d) => {
          const dayPlans = plansOn(plans ?? [], d);
          const dayTasks = (tasks ?? []).filter((t) => t.date === d);
          return (
            <section className={`day-col${d === now ? ' today' : ''}`} key={d} aria-label={fmtDay(d)}>
              <div className="row between">
                <div className="bold small">{WEEKDAYS[weekday(d)]} <span className="faint" style={{ fontWeight: 500 }}>{fmtDay(d, { day: 'numeric', month: 'short' })}</span></div>
                <button className="icon-btn sm" aria-label={`Add to ${fmtDay(d)}`} onClick={() => setAdding(d)}><Plus size={16} /></button>
              </div>
              {dayPlans.map((p) => {
                const Icon = PLAN_ICON[p.kind];
                const done = p.doneDates.includes(d);
                return (
                  <div key={p.id} className={`plan-item${done ? ' done' : ''}`}>
                    <CheckBox on={done} color="var(--accent)" label={`${p.title} done`} onClick={() => act(p, d)} />
                    <button className="grow" style={{ textAlign: 'left' }} onClick={() => setEditing({ plan: p, date: d })}>
                      <span className="plan-title" style={{ display: 'block', overflowWrap: 'anywhere', fontWeight: 550 }}>{p.title}</span>
                      <span className="tiny faint row" style={{ gap: 4 }}><Icon size={11} />{p.time ?? (p.weekdays ? 'Weekly' : 'Once')}</span>
                    </button>
                  </div>
                );
              })}
              {dayTasks.map((t) => (
                <div key={t.id} className={`plan-item${t.done ? ' done' : ''}`}>
                  <CheckBox on={t.done} label={`${t.title} done`} onClick={() => toggleTask(t)} />
                  <Link to="/plan?tab=tasks" className="grow">
                    <span className="plan-title" style={{ display: 'block', overflowWrap: 'anywhere' }}>{t.title}</span>
                    <span className="tiny faint row" style={{ gap: 4 }}><ListTodo size={11} />{t.time ?? 'Task'}</span>
                  </Link>
                </div>
              ))}
              {!dayPlans.length && !dayTasks.length && <div className="tiny faint" style={{ padding: '2px 0 4px' }}>Nothing planned</div>}
            </section>
          );
        })}
      </div>
      {adding && <PlanSheet date={adding} onClose={() => setAdding(undefined)} />}
      {editing && <PlanSheet date={editing.date} plan={editing.plan} onClose={() => setEditing(undefined)} />}
      {programs && <ProgramSheet onClose={() => setPrograms(false)} onApplied={(p) => { setPrograms(false); toast(`${p.name} added`); }} />}
    </>
  );
}

function PlanSheet({ date, plan, onClose }: { date: string; plan?: Plan; onClose: () => void }) {
  const settings = useSettings();
  const routines = useLive(() => allAlive(db.routines));
  const { toast } = useToast();
  const act = usePlanAction();
  const [kind, setKind] = useState<PlanKind>(plan?.kind ?? 'workout');
  const [title, setTitle] = useState(plan?.title ?? '');
  const [time, setTime] = useState(plan?.time ?? '');
  const [note, setNote] = useState(plan?.note ?? '');
  const [routineId, setRoutineId] = useState(plan?.routineId ?? '');
  const [repeat, setRepeat] = useState(!!plan?.weekdays);
  const [weekdays, setWeekdays] = useState<number[]>(plan?.weekdays ?? [weekday(date)]);
  const [meals, setMeals] = useState<PlanMealItem[]>(plan?.meals ?? []);
  const [picking, setPicking] = useState(false);

  const canSave = (title.trim() || routineId) && (!repeat || weekdays.length);
  const submit = async () => {
    const routine = routines?.find((r) => r.id === routineId);
    await save<Plan>('plans', {
      id: plan?.id,
      kind,
      title: title.trim() || routine?.name || 'Workout',
      time: time || undefined,
      note: note || undefined,
      routineId: kind === 'workout' && routineId ? routineId : undefined,
      meals: kind === 'meal' ? meals : undefined,
      date: repeat ? undefined : plan?.date ?? date,
      weekdays: repeat ? weekdays : undefined,
      from: repeat ? plan?.from ?? date : undefined,
      doneDates: plan?.doneDates ?? [],
      skipDates: plan?.skipDates ?? [],
    });
    onClose();
  };
  const kcal = meals.reduce((t, m) => t + m.kcal, 0);

  return (
    <Sheet title={plan ? 'Edit plan' : `Plan for ${relativeDay(date)}`} onClose={onClose} footer={
      <button className="btn primary block" disabled={!canSave} onClick={submit}>{plan ? 'Save changes' : 'Add to plan'}</button>
    }>
      <div className="stack">
        {plan && (
          <div className="row">
            <button className="btn grow" onClick={async () => { await act(plan, date); onClose(); }}>
              {plan.doneDates.includes(date) ? 'Mark not done' : plan.kind === 'workout' ? <><Play size={14} /> Start now</> : plan.kind === 'meal' ? <><Utensils size={14} /> Log meal</> : <><Check size={14} /> Mark done</>}
            </button>
            <button className="btn danger" onClick={async () => { await removePlanOn(plan, date); toast(plan.weekdays ? `Skipped ${relativeDay(date)}` : 'Removed'); onClose(); }}>{plan.weekdays ? 'Skip this day' : 'Remove'}</button>
          </div>
        )}
        <Segmented<PlanKind> value={kind} onChange={setKind} label="Plan type" options={[{ value: 'workout', label: 'Workout' }, { value: 'meal', label: 'Meal' }, { value: 'other', label: 'Other' }]} />
        {kind === 'workout' && (
          <Field label="Routine">
            <select className="input" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
              <option value="">No routine, just a name</option>
              {routines?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={kind === 'workout' && routineId ? 'Name (optional)' : 'Name'}>
          <input className="input" value={title} placeholder={kind === 'meal' ? 'High-protein lunch' : kind === 'workout' ? 'Evening run' : 'Doctor appointment'} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {kind === 'meal' && (
          <div className="stack tight">
            <div className="row between"><span className="field-label">Foods{kcal ? ` · ${num(kcal)} kcal` : ''}</span><button className="btn sm" onClick={() => setPicking(true)}><Plus size={13} /> Add food</button></div>
            {meals.map((m, i) => (
              <div key={i} className="row between small">
                <span className="clip">{m.name} <span className="faint">{m.amount}</span></span>
                <button className="icon-btn sm" aria-label={`Remove ${m.name}`} onClick={() => setMeals(meals.filter((_, k) => k !== i))}><X size={14} /></button>
              </div>
            ))}
            {!meals.length && <span className="tiny faint">Foods you add here are logged in one tap when you eat the meal.</span>}
          </div>
        )}
        <Field label="Time (optional)"><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <div className="stack tight">
          <label className="row between"><span className="field-label">Repeat every week</span>
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
          </label>
          {repeat && <WeekdayPicker value={weekdays} onChange={setWeekdays} weekStart={settings?.weekStart ?? 1} />}
        </div>
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {plan && (
          <button className="btn danger" onClick={async () => { await remove('plans', plan.id); toast('Plan deleted'); onClose(); }}><Trash2 size={15} /> {plan.weekdays ? 'Delete all repeats' : 'Delete'}</button>
        )}
      </div>
      {picking && <FoodPicker meal={mealForNow()} title="Add food to plan" onClose={() => setPicking(false)} onAdd={(d: LogDraft) => { setMeals([...meals, d as PlanMealItem]); setPicking(false); }} />}
    </Sheet>
  );
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** A static web app can't push reliable reminders, but a calendar can: export plans as .ics events. */
export function plansToIcs(plans: Plan[]) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const events = plans.flatMap((p) => {
    const start = p.date ?? p.from ?? today();
    const compact = start.replaceAll('-', '');
    const when = p.time ? [`DTSTART:${compact}T${p.time.replace(':', '')}00`, `DTEND:${compact}T${endTime(p.time)}00`] : [`DTSTART;VALUE=DATE:${compact}`];
    return [
      'BEGIN:VEVENT', `UID:${p.id}@daylyt`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(p.title)}`, ...when,
      ...(p.weekdays?.length ? [`RRULE:FREQ=WEEKLY;BYDAY=${p.weekdays.map((d) => BYDAY[d]).join(',')}`] : []),
      ...(p.time ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(p.title)}`, 'TRIGGER:-PT10M', 'END:VALARM'] : []),
      'END:VEVENT',
    ];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Daylyt//Plan//EN', ...events, 'END:VCALENDAR'].join('\r\n');
}

const endTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const mins = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}`;
};

// ---- Tasks ----

export const toggleTask = (t: Task) =>
  save<Task>('tasks', { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() });

function TasksView() {
  const tasks = useLive(() => allAlive(db.tasks));
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Task>();
  const [showDone, setShowDone] = useState(false);
  const now = today();

  const groups = useMemo(() => {
    const open = (tasks ?? []).filter((t) => !t.done).sort((a, b) => a.priority - b.priority || (a.time ?? '99').localeCompare(b.time ?? '99'));
    return {
      overdue: open.filter((t) => t.date && t.date < now),
      today: open.filter((t) => t.date === now),
      upcoming: open.filter((t) => t.date && t.date > now).sort((a, b) => a.date!.localeCompare(b.date!)),
      someday: open.filter((t) => !t.date),
      done: (tasks ?? []).filter((t) => t.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 30),
    };
  }, [tasks, now]);

  const add = async () => {
    if (!text.trim()) return;
    await save<Task>('tasks', { title: text.trim(), date: now, priority: 2, done: false });
    setText('');
  };

  const section = (title: string, rows: Task[]) => rows.length > 0 && (
    <div key={title} className="stack tight">
      <h3 className="small muted">{title} · {rows.length}</h3>
      <div className="card flush list">{rows.map((t) => <TaskRow key={t.id} t={t} onEdit={() => setEditing(t)} />)}</div>
    </div>
  );

  return (
    <>
      <form className="row" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <input className="input grow" value={text} placeholder="Add a task for today" aria-label="New task" onChange={(e) => setText(e.target.value)} />
        <button className="btn primary" disabled={!text.trim()}><Plus size={16} /> Add</button>
      </form>
      {section('Overdue', groups.overdue)}
      {section('Today', groups.today)}
      {section('Upcoming', groups.upcoming)}
      {section('No date', groups.someday)}
      {tasks && !tasks.some((t) => !t.done) && <div className="card"><Empty icon={<ListTodo size={28} />} title={tasks.length ? 'All caught up' : 'No tasks yet'} /></div>}
      {groups.done.length > 0 && (
        <button className="btn ghost" onClick={() => setShowDone(!showDone)}>{showDone ? 'Hide' : 'Show'} completed ({groups.done.length})</button>
      )}
      {showDone && <div className="card flush list">{groups.done.map((t) => <TaskRow key={t.id} t={t} onEdit={() => setEditing(t)} />)}</div>}
      {editing && <TaskSheet task={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

const PRIORITY_NAMES: Record<Priority, string> = { 1: 'High', 2: 'Normal', 3: 'Low' };

export function TaskRow({ t, onEdit }: { t: Task; onEdit: () => void }) {
  return (
    <div className={`item plan-item${t.done ? ' done' : ''}`} style={{ padding: '9px 15px' }}>
      <CheckBox on={t.done} label={`${t.title} done`} onClick={() => toggleTask(t)} />
      <button className="grow" style={{ textAlign: 'left' }} onClick={onEdit}>
        <span className="plan-title" style={{ display: 'block', overflowWrap: 'anywhere' }}>{t.title}</span>
        {(t.date || t.time) && <span className="tiny faint">{t.date ? relativeDay(t.date) : ''}{t.time ? ` · ${t.time}` : ''}</span>}
      </button>
      {t.priority === 1 && !t.done && <Flag size={14} aria-label="High priority" style={{ color: 'var(--bad)' }} />}
    </div>
  );
}

function TaskSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const [draft, setDraft] = useState(task);
  const set = (p: Partial<Task>) => setDraft({ ...draft, ...p });
  return (
    <Sheet title="Edit task" onClose={onClose} footer={
      <>
        <button className="btn danger" aria-label="Delete task" onClick={async () => { await remove('tasks', task.id); onClose(); }}><Trash2 size={15} /></button>
        <button className="btn primary grow" disabled={!draft.title.trim()} onClick={async () => { await save<Task>('tasks', draft); onClose(); }}>Save</button>
      </>
    }>
      <div className="stack">
        <Field label="Task"><input className="input" value={draft.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="grid two">
          <Field label="Date"><input className="input" type="date" value={draft.date ?? ''} onChange={(e) => set({ date: e.target.value || undefined })} /></Field>
          <Field label="Time"><input className="input" type="time" value={draft.time ?? ''} onChange={(e) => set({ time: e.target.value || undefined })} /></Field>
        </div>
        <Field label="Priority">
          <Segmented value={String(draft.priority)} onChange={(v) => set({ priority: Number(v) as Priority })} options={([1, 2, 3] as Priority[]).map((p) => ({ value: String(p), label: PRIORITY_NAMES[p] }))} />
        </Field>
        <Field label="Note"><textarea className="input" value={draft.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      </div>
    </Sheet>
  );
}

// ---- Habits ----

export const HABIT_ICONS = { flame: Flame, book: BookOpen, leaf: Leaf, moon: Moon, sun: Sun, pill: Pill, heart: Heart, apple: Apple, droplet: Droplet, coffee: Coffee, phone: Smartphone, bed: BedDouble, walk: Footprints, gym: Dumbbell, target: Target, pencil: Pencil };
export type HabitIcon = keyof typeof HABIT_ICONS;

const TEMPLATES: { name: string; icon: HabitIcon; target?: number; unit?: string }[] = [
  { name: 'Read', icon: 'book', target: 20, unit: 'pages' }, { name: 'Meditate', icon: 'leaf' }, { name: 'Take vitamins', icon: 'pill' }, { name: 'No sugar', icon: 'apple' },
  { name: 'Wake up early', icon: 'sun' }, { name: 'No phone in bed', icon: 'phone' }, { name: 'Journal', icon: 'pencil' }, { name: 'Stretch', icon: 'heart' },
];

export const habitKey = (habitId: string, date: string) => `${habitId}:${date}`;

/** A plain habit toggles; a counted one adds up, and tapping past the target clears it. */
export async function tapHabit(h: Habit, log: HabitLog | undefined, date: string) {
  const value = log?.value ?? 0;
  const next = h.target <= 1 ? (value >= 1 ? 0 : 1) : value >= h.target ? 0 : h.target;
  await save<HabitLog>('habitLogs', { id: habitKey(h.id, date), habitId: h.id, date, value: next });
}

function HabitsView() {
  const habits = useLive(() => allAlive(db.habits));
  const logRows = useLive(() => allAlive(db.habitLogs));
  const settings = useSettings();
  const [date] = useSelectedDate();
  const [editing, setEditing] = useState<Habit | 'new'>();
  const logs = useMemo(() => new Map((logRows ?? []).map((l) => [l.id, l.value])), [logRows]);
  const list = (habits ?? []).filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const weekStart = settings?.weekStart ?? 1;
  const start = weekStartOf(date, weekStart);
  const week = dateRange(start, addDays(start, 6));

  return (
    <>
      <div className="row between">
        <h2>{relativeDay(date)}</h2>
        <button className="btn sm" onClick={() => setEditing('new')}><Plus size={14} /> New habit</button>
      </div>
      {list.length ? (
        <div className="card flush list">
          {list.map((h) => {
            const Icon = HABIT_ICONS[h.icon as HabitIcon] ?? Target;
            const val = logs.get(habitKey(h.id, date)) ?? 0;
            const due = habitDueOn(h, date);
            const row = logRows?.find((l) => l.id === habitKey(h.id, date));
            return (
              <div className="item" key={h.id} style={{ opacity: due ? 1 : 0.6 }}>
                <span className="icon-tile" style={{ '--c': METRIC_COLORS.habits } as CSSProperties}><Icon size={17} /></span>
                <button className="grow" style={{ textAlign: 'left' }} onClick={() => setEditing(h)}>
                  <span className="bold clip" style={{ display: 'block' }}>{h.name}</span>
                  <span className="tiny faint">{streakText(h, logRows ?? [], date)}{h.target > 1 ? ` · ${h.target} ${h.unit ?? ''}` : ''}{!due ? ' · Not due today' : ''}</span>
                  <span className="row" style={{ gap: 3, marginTop: 4 }} aria-hidden="true">
                    {week.map((d) => {
                      const hit = (logs.get(habitKey(h.id, d)) ?? 0) >= h.target;
                      return <i key={d} style={{ width: 13, height: 5, borderRadius: 3, background: hit ? METRIC_COLORS.habits : habitDueOn(h, d) ? 'var(--surface-3)' : 'transparent' }} />;
                    })}
                  </span>
                </button>
                {h.target > 1 ? (
                  <HabitCounter h={h} value={val} date={date} />
                ) : (
                  <CheckBox on={val >= 1} color={METRIC_COLORS.habits} label={`${h.name} done`} onClick={() => tapHabit(h, row, date)} />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <Empty icon={<Target size={28} />} title="Build a habit">
            <p className="small muted">Small things done daily add up. Start with one of these, or your own.</p>
            <div className="chips wrap" style={{ justifyContent: 'center' }}>
              {TEMPLATES.map((t) => (
                <button key={t.name} className="chip" style={{ textTransform: 'none' }} onClick={() => save<Habit>('habits', {
                  name: t.name, icon: t.icon, days: [0, 1, 2, 3, 4, 5, 6], target: t.target ?? 1, unit: t.unit, order: Date.now(),
                })}>{t.name}</button>
              ))}
            </div>
          </Empty>
        </div>
      )}
      {editing && <HabitSheet habit={editing === 'new' ? undefined : editing} weekStart={weekStart} onClose={() => setEditing(undefined)} />}
    </>
  );
}

export function HabitCounter({ h, value, date }: { h: Habit; value: number; date: string }) {
  const set = (v: number) => save<HabitLog>('habitLogs', { id: habitKey(h.id, date), habitId: h.id, date, value: Math.max(0, v) });
  return (
    <div className="row" style={{ gap: 2 }}>
      <NumInput className="set-input" label={`${h.name} amount`} value={value || undefined} placeholder="0" onChange={(v) => set(v ?? 0)} />
      <CheckBox on={value >= h.target} color={METRIC_COLORS.habits} label={`${h.name} complete`} onClick={() => set(value >= h.target ? 0 : h.target)} />
    </div>
  );
}

/** Counts back over days the habit was due; days it wasn't due neither count nor break the run. */
export function streakText(h: Habit, logs: HabitLog[], date: string) {
  const byDate = new Map(logs.filter((l) => l.habitId === h.id).map((l) => [l.date, l.value]));
  let n = 0;
  let cursor = date;
  if ((byDate.get(cursor) ?? 0) < h.target) cursor = addDays(cursor, -1);
  for (let i = 0; i < 1500; i++) {
    if (habitDueOn(h, cursor)) {
      if ((byDate.get(cursor) ?? 0) >= h.target) n += 1;
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return n ? `${n} day streak` : 'No streak yet';
}

function HabitSheet({ habit, weekStart, onClose }: { habit?: Habit; weekStart: 0 | 1; onClose: () => void }) {
  const [name, setName] = useState(habit?.name ?? '');
  const [icon, setIcon] = useState<string>(habit?.icon ?? 'target');
  const [days, setDays] = useState(habit?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [target, setTarget] = useState<number | undefined>(habit?.target ?? 1);
  const [unit, setUnit] = useState(habit?.unit ?? '');
  return (
    <Sheet title={habit ? 'Edit habit' : 'New habit'} onClose={onClose} footer={
      <>
        {habit && <button className="btn danger" aria-label="Delete habit" onClick={async () => { await remove('habits', habit.id); onClose(); }}><Trash2 size={15} /></button>}
        <button className="btn primary grow" disabled={!name.trim() || !days.length} onClick={async () => {
          await save<Habit>('habits', { ...(habit ?? { order: Date.now() }), name: name.trim(), icon, days, target: Math.max(1, target ?? 1), unit: unit || undefined } as Habit);
          onClose();
        }}>Save</button>
      </>
    }>
      <div className="stack">
        <Field label="Name"><input className="input" value={name} data-autofocus={habit ? undefined : ''} placeholder="Read before bed" onChange={(e) => setName(e.target.value)} /></Field>
        <div className="field">
          <span className="field-label">Icon</span>
          <div className="row wrap" style={{ gap: 4 }}>
            {(Object.keys(HABIT_ICONS) as HabitIcon[]).map((k) => {
              const I = HABIT_ICONS[k];
              return <button key={k} type="button" className={`icon-btn${icon === k ? ' filled' : ''}`} aria-label={k} aria-pressed={icon === k} style={icon === k ? { outline: '2px solid var(--accent)' } : undefined} onClick={() => setIcon(k)}><I size={17} /></button>;
            })}
          </div>
        </div>
        <div className="field"><span className="field-label">Which days?</span><WeekdayPicker value={days} onChange={setDays} weekStart={weekStart} /></div>
        <div className="grid two">
          <Field label="Daily target" hint="1 means a simple yes or no"><Stepper value={target} onChange={setTarget} min={1} label="target" /></Field>
          <Field label="Unit (optional)"><input className="input" value={unit} placeholder="pages" onChange={(e) => setUnit(e.target.value)} /></Field>
        </div>
      </div>
    </Sheet>
  );
}

// ---- Focus ----

function FocusView() {
  const settings = useSettings();
  const timers = useTimers();
  const logs = useLive(() => allAlive(db.focus));
  const [label, setLabel] = useState('');
  const { toast } = useToast();
  const now = today();
  const todayLogs = (logs ?? []).filter((l) => l.date === now).sort((a, b) => b.at - a.at);
  const total = todayLogs.reduce((t, l) => t + l.minutes, 0);
  const goal = settings?.goals.focusMin ?? 60;
  const focusLen = settings?.focusLen ?? 25;
  const breakLen = settings?.breakLen ?? 5;
  const f = timers.focus;
  const left = timers.focusLeft;
  const fraction = f ? left / f.total : 1;
  const size = 220;
  const r = 100;
  const circ = 2 * Math.PI * r;

  const askNotifications = () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch { /* unsupported */ }
  };

  return (
    <>
      <div className="card">
        <div className="focus-ring">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
            <circle cx={110} cy={110} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={11} />
            <circle cx={110} cy={110} r={r} fill="none" stroke={f?.mode === 'break' ? 'var(--steps)' : 'var(--focus)'} strokeWidth={11} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - fraction)} transform="rotate(-90 110 110)" style={{ transition: 'stroke-dashoffset 0.5s linear' }} />
          </svg>
          <div className="inner">
            <div className="tiny faint">{f ? (f.mode === 'break' ? 'Break' : f.label || 'Focus') : 'Ready'}</div>
            <div className="hero-num tabular" style={{ fontSize: 46 }} role="timer">{fmtClock(f ? left : focusLen * 60)}</div>
            <div className="tiny faint">{fmtDuration(total)} of {fmtDuration(goal)} today</div>
          </div>
        </div>
        {!f ? (
          <div className="stack" style={{ marginTop: 10 }}>
            <input className="input" value={label} placeholder="What are you working on? (optional)" aria-label="Focus label" onChange={(e) => setLabel(e.target.value)} />
            <div className="row">
              <button className="btn primary grow" onClick={() => { askNotifications(); timers.startFocus(focusLen, label); }}><Play size={15} /> Focus {focusLen} min</button>
              <button className="btn grow" onClick={() => timers.startFocus(breakLen, '', 'break')}><Coffee size={15} /> Break {breakLen} min</button>
            </div>
            <div className="chips" style={{ justifyContent: 'center' }}>
              {[15, 45, 60, 90].map((m) => <button key={m} className="chip" style={{ textTransform: 'none' }} onClick={() => { askNotifications(); timers.startFocus(m, label); }}>{m} min</button>)}
            </div>
          </div>
        ) : (
          <div className="row" style={{ marginTop: 10 }}>
            {f.endsAt
              ? <button className="btn grow" onClick={timers.pauseFocus}><Pause size={15} /> Pause</button>
              : <button className="btn primary grow" onClick={timers.resumeFocus}><Play size={15} /> Resume</button>}
            <button className="btn grow" onClick={() => { timers.endFocus(true); toast(f.mode === 'focus' ? 'Time saved' : 'Break ended'); }}><Square size={14} /> {f.mode === 'focus' ? 'End and save' : 'End break'}</button>
          </div>
        )}
      </div>
      {todayLogs.length > 0 && (
        <div className="card flush list">
          {todayLogs.map((l: FocusLog) => (
            <div className="item" key={l.id}>
              <span className="grow clip">{l.label || 'Focus session'}</span>
              <span className="small muted">{fmtDuration(l.minutes)}</span>
              <button className="icon-btn sm" aria-label="Delete session" onClick={() => remove('focus', l.id)}><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

