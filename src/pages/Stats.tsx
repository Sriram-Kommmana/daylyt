import { useMemo, useState, type ReactNode } from 'react';
import { Award, Flame, Lightbulb, Lock, Minus, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { Empty, METRIC_COLORS, Progress, Segmented } from '../components/ui';
import { BarChart, ChartTable, Heatmap, HeatLegend, Legend, LineChart } from '../components/charts';
import { allAlive, db, useLive, useSettings, useStreakDays } from '../lib/db';
import { compact, fromKg, num, workoutSets } from '../lib/calc';
import { addDays, dateRange, fmtDay, fmtDuration, today, weekStartOf } from '../lib/date';
import { bestStreak, dayScore, insights, STREAK_TESTS, streakOf, weeklyWorkoutStreak } from '../lib/summary';
import { personalRecords } from '../lib/workouts';
import type { DaySummary, Goals, Settings, Workout } from '../lib/types';

type Range = '7' | '30' | '90' | '365';

export default function Stats() {
  const settings = useSettings();
  const history = useStreakDays(settings);
  const workouts = useLive(() => allAlive(db.workouts));
  const [range, setRange] = useState<Range>('30');
  const now = today();
  const n = Number(range);
  const dates = useMemo(() => dateRange(addDays(now, -(n - 1)), now), [now, n]);
  const prevDates = useMemo(() => dateRange(addDays(now, -(2 * n - 1)), addDays(now, -n)), [now, n]);
  const rows = useMemo(() => (history ? dates.map((d) => history.get(d)!).filter(Boolean) : []), [history, dates]);
  const prev = useMemo(() => (history ? prevDates.map((d) => history.get(d)!).filter(Boolean) : []), [history, prevDates]);

  if (!settings || !history) return <div className="page-head"><h1>Stats</h1></div>;
  const g = settings.goals;
  const unit = settings.weightUnit;
  const anyData = [...history.values()].some((d) => d.logged);

  const avg = (list: DaySummary[], get: (d: DaySummary) => number) => {
    const vals = list.map(get).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const delta = (get: (d: DaySummary) => number) => {
    const a = avg(rows, get);
    const b = avg(prev, get);
    return b ? (a - b) / b : null;
  };
  // Long ranges read better as weekly bars than as hundreds of slivers.
  const grouped = n > 60;
  const bucket = (get: (d: DaySummary) => number, mode: 'avg' | 'sum' = 'avg') => {
    if (!grouped) return rows.map((d) => ({ date: d.date, values: [get(d)] }));
    const weeks = new Map<string, DaySummary[]>();
    for (const d of rows) {
      const w = weekStartOf(d.date, settings.weekStart);
      weeks.set(w, [...(weeks.get(w) ?? []), d]);
    }
    return [...weeks.entries()].map(([date, list]) => ({
      date,
      label: fmtDay(date, { day: 'numeric', month: 'short' }),
      values: [mode === 'sum' ? list.reduce((t, x) => t + get(x), 0) : avg(list, get)],
    }));
  };
  const period = grouped ? 'Weekly average' : 'Daily';

  return (
    <>
      <div className="page-head"><h1>Stats</h1></div>
      {!anyData ? (
        <div className="card"><Empty icon={<TrendingUp size={28} />} title="Your stats will grow here"><p className="small muted">Log a few days of anything. Charts, streaks and personal insights appear as data builds up.</p></Empty></div>
      ) : (
        <div className="stack">
          <Segmented<Range> value={range} onChange={setRange} label="Date range" options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: 'Year' }]} />

          <div className="grid fit">
            <StatTile label="Day score" value={String(Math.round(avg(rows, (d) => dayScore(d, g))))} delta={delta((d) => dayScore(d, g))} good="up" />
            <StatTile label="Calories" value={compact(avg(rows, (d) => d.kcal))} unit="kcal" delta={delta((d) => d.kcal)} />
            <StatTile label="Water" value={compact(avg(rows, (d) => d.waterMl))} unit="ml" delta={delta((d) => d.waterMl)} good="up" />
            <StatTile label="Sleep" value={fmtDuration(avg(rows, (d) => d.sleepMin))} delta={delta((d) => d.sleepMin)} good="up" />
            <StatTile label="Steps" value={compact(avg(rows, (d) => d.steps))} delta={delta((d) => d.steps)} good="up" />
            <StatTile label="Workouts" value={String(rows.reduce((t, d) => t + d.workouts, 0))} delta={prev.length ? deltaOfSum(rows, prev, (d) => d.workouts) : null} good="up" />
          </div>

          <Streaks history={history} goals={g} weekStart={settings.weekStart} now={now} />

          <div className="card">
            <h2 style={{ marginBottom: 10 }}>Consistency</h2>
            <Heatmap end={now} days={Math.max(n, 182)} weekStart={settings.weekStart}
              value={(d) => { const s = history.get(d); return s?.logged ? dayScore(s, g) : null; }}
              label={(d, v) => `${fmtDay(d)}: ${v == null ? 'Nothing logged' : `score ${v}`}`} />
            <HeatLegend>Day score</HeatLegend>
          </div>

          <Insights days={[...history.values()].filter((d) => d.logged)} goals={g} />

          <div className="grid cards">
            <ChartCard title="Calories" sub={period}>
              <BarChart bars={bucket((d) => d.kcal)} series={[{ name: 'Calories', color: METRIC_COLORS.food }]} goal={g.kcal} fmt={(v) => `${num(v)} kcal`} ariaLabel="Calories per day" />
              <ChartTable head={['Date', 'kcal', 'Protein', 'Carbs', 'Fat']} rows={rows.filter((d) => d.kcal).map((d) => [fmtDay(d.date), num(d.kcal), Math.round(d.protein), Math.round(d.carbs), Math.round(d.fat)])} />
            </ChartCard>
            <MacroCard rows={rows} goals={g} />
            <ChartCard title="Water" sub={period}>
              <BarChart bars={bucket((d) => d.waterMl)} series={[{ name: 'Water', color: METRIC_COLORS.water }]} goal={g.waterMl} fmt={(v) => `${num(v)} ml`} ariaLabel="Water per day" />
              <ChartTable head={['Date', 'ml']} rows={rows.filter((d) => d.waterMl).map((d) => [fmtDay(d.date), num(d.waterMl)])} />
            </ChartCard>
            <ChartCard title="Sleep" sub={period}>
              <BarChart bars={bucket((d) => d.sleepMin / 60)} series={[{ name: 'Sleep', color: METRIC_COLORS.sleep }]} goal={g.sleepMin / 60} goalLabel={`Goal ${fmtDuration(g.sleepMin)}`} fmt={(v) => fmtDuration(v * 60)} ariaLabel="Hours of sleep" />
              <ChartTable head={['Date', 'Slept', 'Quality']} rows={rows.filter((d) => d.sleepMin).map((d) => [fmtDay(d.date), fmtDuration(d.sleepMin), d.sleepQuality])} />
            </ChartCard>
            <ChartCard title="Steps" sub={period}>
              <BarChart bars={bucket((d) => d.steps)} series={[{ name: 'Steps', color: METRIC_COLORS.steps }]} goal={g.steps} fmt={num} ariaLabel="Steps per day" />
              <ChartTable head={['Date', 'Steps', 'Km']} rows={rows.filter((d) => d.steps).map((d) => [fmtDay(d.date), num(d.steps), d.km.toFixed(1)])} />
            </ChartCard>
            <ChartCard title="Calories burned in workouts" sub={grouped ? 'Weekly total' : 'Daily'}>
              <BarChart bars={bucket((d) => d.workoutKcal, 'sum')} series={[{ name: 'Burned', color: METRIC_COLORS.workout }]} fmt={(v) => `${num(v)} kcal`} ariaLabel="Workout calories" />
              <ChartTable head={['Date', 'kcal', 'Sets']} rows={rows.filter((d) => d.workoutKcal).map((d) => [fmtDay(d.date), num(d.workoutKcal), d.sets])} />
            </ChartCard>
            <ChartCard title="Volume lifted" sub={grouped ? 'Weekly total' : 'Daily'}>
              <BarChart bars={bucket((d) => fromKg(d.volume, unit), 'sum')} series={[{ name: 'Volume', color: METRIC_COLORS.workout }]} fmt={(v) => `${num(v)} ${unit}`} ariaLabel="Volume lifted" />
              <ChartTable head={['Date', `Volume (${unit})`]} rows={rows.filter((d) => d.volume).map((d) => [fmtDay(d.date), num(fromKg(d.volume, unit))])} />
            </ChartCard>
            <MuscleCard workouts={workouts ?? []} dates={dates} />
            <WeightCard rows={rows} unit={unit} />
            <ChartCard title="Focus and tasks" sub={grouped ? 'Weekly average of focus time' : 'Focus time per day'}>
              <BarChart bars={bucket((d) => d.focusMin)} series={[{ name: 'Focus', color: METRIC_COLORS.focus }]} goal={g.focusMin} goalLabel={`Goal ${fmtDuration(g.focusMin)}`} fmt={fmtDuration} ariaLabel="Focus minutes" />
              <div className="small muted" style={{ marginTop: 6 }}>{rows.reduce((t, d) => t + d.tasksDone, 0)} tasks completed in this period</div>
            </ChartCard>
            <HabitRates dates={dates} />
          </div>

          <Achievements history={history} settings={settings} workouts={workouts ?? []} />
        </div>
      )}
    </>
  );
}

const deltaOfSum = (a: DaySummary[], b: DaySummary[], get: (d: DaySummary) => number) => {
  const x = a.reduce((t, d) => t + get(d), 0);
  const y = b.reduce((t, d) => t + get(d), 0);
  return y ? (x - y) / y : null;
};

function StatTile({ label, value, unit, delta, good }: { label: string; value: string; unit?: string; delta: number | null; good?: 'up' }) {
  const pct = delta == null ? null : Math.round(delta * 100);
  const Icon = pct == null || pct === 0 ? Minus : pct > 0 ? TrendingUp : TrendingDown;
  const color = good && pct ? (pct > 0 ? 'var(--good)' : 'var(--bad)') : undefined;
  return (
    <div className="card">
      <div className="small muted">{label}</div>
      <div className="big" style={{ margin: '3px 0' }}>{value}{unit && <span className="unit">{unit}</span>}</div>
      {pct != null && <div className="stat-delta" style={{ color }} title="Compared with the previous period"><Icon size={13} /> {pct > 0 ? '+' : ''}{pct}%</div>}
    </div>
  );
}

const ChartCard = ({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) => (
  <div className="card">
    <div style={{ marginBottom: 10 }}>
      <h2>{title}</h2>
      {sub && <div className="tiny faint">{sub}</div>}
    </div>
    {children}
  </div>
);

function Streaks({ history, goals, weekStart, now }: { history: Map<string, DaySummary>; goals: Goals; weekStart: 0 | 1; now: string }) {
  const rows = STREAK_TESTS.map((s) => {
    const test = (d: DaySummary) => s.test(d, goals);
    return { key: s.key, label: s.label, current: streakOf(history, now, test), best: bestStreak(history, test), unit: 'days' };
  });
  rows.splice(1, 0, { key: 'train', label: `${goals.workoutsPerWeek}+ workouts a week`, current: weeklyWorkoutStreak(history, now, goals.workoutsPerWeek, weekStart), best: 0, unit: 'weeks' });
  return (
    <div className="card flush">
      <div style={{ padding: '13px 15px 8px' }}><h2>Streaks</h2></div>
      <table className="data-table" style={{ margin: 0 }}>
        <thead><tr><th scope="col" style={{ paddingLeft: 15 }}>Goal</th><th scope="col">Now</th><th scope="col" style={{ paddingRight: 15 }}>Best</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ paddingLeft: 15 }}>{r.label}</td>
              <td className="bold"><span className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>{r.current > 0 && <Flame size={13} style={{ color: 'var(--accent)' }} />}{r.current} {r.unit === 'weeks' ? 'wk' : 'd'}</span></td>
              <td style={{ paddingRight: 15 }}>{r.unit === 'weeks' ? '—' : `${r.best} d`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Insights({ days, goals }: { days: DaySummary[]; goals: Goals }) {
  const list = useMemo(() => insights(days, goals), [days, goals]);
  if (!list.length) return null;
  return (
    <div className="card">
      <h2 className="row" style={{ marginBottom: 8 }}><Lightbulb size={17} /> What your data shows</h2>
      <ul className="stack tight small">{list.map((x) => <li key={x.text}>{x.text}</li>)}</ul>
      <p className="tiny faint" style={{ marginTop: 8 }}>These are patterns in your own logs, not proof that one thing causes another.</p>
    </div>
  );
}

function MacroCard({ rows, goals }: { rows: DaySummary[]; goals: Goals }) {
  const logged = rows.filter((d) => d.kcal > 0);
  const avg = (get: (d: DaySummary) => number) => (logged.length ? logged.reduce((t, d) => t + get(d), 0) / logged.length : 0);
  const items = [
    { name: 'Protein', val: avg((d) => d.protein), goal: goals.protein, color: METRIC_COLORS.water, kcal: 4 },
    { name: 'Carbs', val: avg((d) => d.carbs), goal: goals.carbs, color: METRIC_COLORS.food, kcal: 4 },
    { name: 'Fat', val: avg((d) => d.fat), goal: goals.fat, color: METRIC_COLORS.steps, kcal: 9 },
  ];
  const total = items.reduce((t, x) => t + x.val * x.kcal, 0);
  return (
    <ChartCard title="Macros" sub={logged.length ? `Average of ${logged.length} logged day${logged.length === 1 ? '' : 's'}` : undefined}>
      {!logged.length ? <div className="empty small">No food logged in this period.</div> : (
        <div className="stack">
          <div className="row" style={{ gap: 2, height: 12 }} role="img" aria-label="Share of calories from protein, carbs and fat">
            {items.map((x) => <i key={x.name} style={{ flex: Math.max(0.01, x.val * x.kcal), background: x.color, height: '100%', borderRadius: 3 }} />)}
          </div>
          <Legend items={items.map((x) => ({ name: `${x.name} ${total ? Math.round((x.val * x.kcal / total) * 100) : 0}%`, color: x.color }))} />
          {items.map((x) => (
            <div key={x.name}>
              <div className="row between small"><span>{x.name}</span><span className="muted">{Math.round(x.val)} of {x.goal} g</span></div>
              <div style={{ marginTop: 3 }}><Progress value={x.val / x.goal} color={x.color} /></div>
            </div>
          ))}
          <div>
            <div className="row between small"><span>Fibre</span><span className="muted">{Math.round(avg((d) => d.fiber))} of {goals.fiber} g</span></div>
            <div style={{ marginTop: 3 }}><Progress value={avg((d) => d.fiber) / goals.fiber} color="var(--ink-2)" /></div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function MuscleCard({ workouts, dates }: { workouts: Workout[]; dates: string[] }) {
  const set = useMemo(() => new Set(dates), [dates]);
  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of workouts) {
      if (!set.has(w.date)) continue;
      for (const e of w.exercises) {
        const n = e.sets.filter((s) => s.done && !s.warmup).length;
        for (const m of e.primary) counts.set(m, (counts.get(m) ?? 0) + n);
      }
    }
    return [...counts.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  }, [workouts, set]);
  const max = rows[0]?.[1] ?? 1;
  return (
    <ChartCard title="Sets by muscle" sub="Spot what you're neglecting">
      {rows.length ? (
        <ul className="stack tight">
          {rows.slice(0, 12).map(([m, v]) => (
            <li key={m} className="small">
              <div className="row between"><span style={{ textTransform: 'capitalize' }}>{m}</span><span className="muted tabular">{v}</span></div>
              <div style={{ marginTop: 2 }}><Progress value={v / max} color={METRIC_COLORS.workout} /></div>
            </li>
          ))}
        </ul>
      ) : <div className="empty small">No sets logged in this period.</div>}
    </ChartCard>
  );
}

function WeightCard({ rows, unit }: { rows: DaySummary[]; unit: 'kg' | 'lb' }) {
  const byDate = new Map(rows.filter((d) => d.weightKg).map((d) => [d.date, d.weightKg!]));
  const points = rows.map((d) => {
    const window = dateRange(addDays(d.date, -6), d.date).map((x) => byDate.get(x)).filter((v): v is number => v != null);
    return { date: d.date, value: d.weightKg ? fromKg(d.weightKg, unit) : null, trend: window.length ? fromKg(window.reduce((a, b) => a + b, 0) / window.length, unit) : null };
  });
  return (
    <ChartCard title="Body weight" sub="With 7-day average">
      <LineChart points={points} color="var(--food)" trendLabel="7-day average" fmt={(v) => `${v.toFixed(1)} ${unit}`} ariaLabel="Body weight" />
      {byDate.size > 0 && <div style={{ marginTop: 6 }}><Legend items={[{ name: 'Weigh-ins', color: 'var(--food)' }, { name: '7-day average', color: 'var(--ink-3)' }]} /></div>}
    </ChartCard>
  );
}

function HabitRates({ dates }: { dates: string[] }) {
  const habits = useLive(() => allAlive(db.habits));
  const logs = useLive(() => allAlive(db.habitLogs));
  const rows = useMemo(() => {
    const set = new Set(dates);
    return (habits ?? []).filter((h) => !h.archived).map((h) => {
      const due = dates.filter((d) => h.days.includes(new Date(`${d}T12:00`).getDay())).length;
      const hit = (logs ?? []).filter((l) => l.habitId === h.id && set.has(l.date) && l.value >= h.target).length;
      return { id: h.id, name: h.name, rate: due ? Math.min(1, hit / due) : 0, hit, due };
    });
  }, [habits, logs, dates]);
  return (
    <ChartCard title="Habits" sub="Completion in this period">
      {rows.length ? (
        <ul className="stack tight">
          {rows.map((r) => (
            <li key={r.id} className="small">
              <div className="row between"><span className="clip">{r.name}</span><span className="muted tabular nowrap">{r.hit}/{r.due} · {Math.round(r.rate * 100)}%</span></div>
              <div style={{ marginTop: 2 }}><Progress value={r.rate} color={METRIC_COLORS.habits} /></div>
            </li>
          ))}
        </ul>
      ) : <div className="empty small">Add habits in the planner to track them here.</div>}
    </ChartCard>
  );
}

function Achievements({ history, settings, workouts }: { history: Map<string, DaySummary>; settings: Settings; workouts: Workout[] }) {
  const g = settings.goals;
  const days = [...history.values()];
  const count = (t: (d: DaySummary) => boolean) => days.filter(t).length;
  const logStreak = bestStreak(history, (d) => d.logged);
  const totalWorkouts = workouts.filter((w) => workoutSets(w) > 0).length;
  const totalSteps = days.reduce((t, d) => t + d.steps, 0);
  const prs = personalRecords(workouts).length;
  const list = [
    { name: 'First step', hint: 'Log your first entry', got: count((d) => d.logged) > 0 },
    { name: 'One week strong', hint: 'Log 7 days in a row', got: logStreak >= 7 },
    { name: 'Thirty days in', hint: 'Log 30 days in a row', got: logStreak >= 30 },
    { name: 'Hundred club', hint: 'Log 100 days in a row', got: logStreak >= 100 },
    { name: 'First workout', hint: 'Finish a workout', got: totalWorkouts >= 1 },
    { name: 'Regular', hint: 'Finish 25 workouts', got: totalWorkouts >= 25 },
    { name: 'Centurion', hint: 'Finish 100 workouts', got: totalWorkouts >= 100 },
    { name: 'Record breaker', hint: 'Set records on 10 exercises', got: prs >= 10 },
    { name: 'Well watered', hint: 'Hit your water goal 30 times', got: count((d) => d.waterMl >= g.waterMl) >= 30 },
    { name: 'Well rested', hint: 'Hit your sleep goal 30 times', got: count((d) => d.sleepMin >= g.sleepMin) >= 30 },
    { name: 'Long walk', hint: 'Walk 100,000 steps in total', got: totalSteps >= 100_000 },
    { name: 'Marathon of steps', hint: 'Walk 1,000,000 steps in total', got: totalSteps >= 1_000_000 },
    { name: 'Perfect day', hint: 'Score 100 on any day', got: days.some((d) => d.logged && dayScore(d, g) === 100) },
    { name: 'Deep worker', hint: 'Focus for 2 hours in a day', got: count((d) => d.focusMin >= 120) > 0 },
  ];
  const got = list.filter((a) => a.got).length;
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h2 className="row"><Award size={17} /> Milestones</h2>
        <span className="small muted">{got} of {list.length}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {list.map((a) => (
          <div key={a.name} className="row top" style={{ gap: 8, opacity: a.got ? 1 : 0.62 }}>
            {a.got ? <Trophy size={16} style={{ color: 'var(--accent)', marginTop: 2 }} /> : <Lock size={15} className="faint" style={{ marginTop: 2 }} />}
            <div className="grow">
              <div className="small bold">{a.name}</div>
              <div className="tiny faint">{a.hint}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

