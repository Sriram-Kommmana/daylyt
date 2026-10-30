import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ChevronLeft, Droplet, Footprints, Moon, Plus, Scale, Trash2 } from 'lucide-react';
import { Field, METRIC_COLORS, NumInput, Segmented, Sheet, Stepper, useToast } from '../components/ui';
import { BarChart, ChartTable, LineChart } from '../components/charts';
import { useSelectedDate } from '../App';
import { allAlive, db, onDate, remove, save, useLive, useSettings, useSummaries } from '../lib/db';
import { fmtWeight, fromKg, num, stepsToKcal, stepsToKm, toKg } from '../lib/calc';
import { addDays, dateRange, fmtDay, fmtDuration, relativeDay, sleepMinutes, today } from '../lib/date';
import type { ActivityLog, BodyLog, Settings, SleepLog, WaterLog } from '../lib/types';

// ---- Quick-entry sheets (also opened from Today) ----

export const addWater = (date: string, ml: number) => save<WaterLog>('water', { date, ml, at: Date.now() });

export function WaterSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const settings = useSettings();
  const logs = useLive(() => onDate(db.water, date), [date]);
  const { toast } = useToast();
  const [custom, setCustom] = useState<number>();
  const glass = settings?.glassMl ?? 250;
  const total = (logs ?? []).reduce((t, l) => t + l.ml, 0);
  const add = async (ml: number) => {
    const row = await addWater(date, ml);
    toast(`Added ${ml} ml`, () => void remove('water', row.id));
  };
  return (
    <Sheet title={`Water · ${relativeDay(date)}`} onClose={onClose}>
      <div className="stack">
        <div className="big center">{num(total)} ml <span className="unit">of {num(settings?.goals.waterMl ?? 0)}</span></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {[glass, 500, 1000].map((ml) => <button key={ml} className="btn" onClick={() => add(ml)}><Plus size={14} /> {ml} ml</button>)}
        </div>
        <div className="row">
          <div className="grow"><NumInput value={custom} onChange={setCustom} placeholder="Other amount (ml)" label="Custom amount in ml" /></div>
          <button className="btn primary" disabled={!custom} onClick={() => { void add(custom!); setCustom(undefined); }}>Add</button>
        </div>
        {!!logs?.length && (
          <ul className="list small">
            {[...logs].sort((a, b) => b.at - a.at).map((l) => (
              <li key={l.id} className="row between" style={{ padding: '5px 0' }}>
                <span>{l.ml} ml <span className="faint">{new Date(l.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></span>
                <button className="icon-btn sm" aria-label={`Remove ${l.ml} ml`} onClick={() => remove('water', l.id)}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

const QUALITY = ['Terrible', 'Poor', 'Okay', 'Good', 'Great'];

export function SleepSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const logs = useLive(() => onDate(db.sleep, date), [date]);
  const lastNight = logs?.[0];
  if (logs === undefined) return null;
  return <SleepForm key={lastNight?.id ?? 'new'} date={date} existing={lastNight} onClose={onClose} />;
}

function SleepForm({ date, existing, onClose }: { date: string; existing?: SleepLog; onClose: () => void }) {
  const [bed, setBed] = useState(existing?.bed ?? '23:00');
  const [wake, setWake] = useState(existing?.wake ?? '07:00');
  const [quality, setQuality] = useState(existing?.quality ?? 3);
  const [nap, setNap] = useState<number | undefined>(existing?.napMin);
  const [note, setNote] = useState(existing?.note ?? '');
  const mins = sleepMinutes(bed, wake);
  return (
    <Sheet title={`Sleep · ${relativeDay(date)} morning`} onClose={onClose} footer={
      <>
        {existing && <button className="btn danger" aria-label="Delete sleep entry" onClick={async () => { await remove('sleep', existing.id); onClose(); }}><Trash2 size={15} /></button>}
        <button className="btn primary grow" onClick={async () => {
          await save<SleepLog>('sleep', { id: existing?.id ?? `sleep:${date}`, date, bed, wake, quality, napMin: nap || undefined, note: note || undefined });
          onClose();
        }}>Save · {fmtDuration(mins + (nap ?? 0))}</button>
      </>
    }>
      <div className="stack">
        <div className="grid two">
          <Field label="Went to bed"><input className="input" type="time" value={bed} onChange={(e) => e.target.value && setBed(e.target.value)} /></Field>
          <Field label="Woke up"><input className="input" type="time" value={wake} onChange={(e) => e.target.value && setWake(e.target.value)} /></Field>
        </div>
        <div className="field">
          <span className="field-label">How well did you sleep?</span>
          <div className="mood-row">
            {QUALITY.map((q, i) => <button key={q} type="button" aria-pressed={quality === i + 1} className={quality === i + 1 ? 'on' : ''} onClick={() => setQuality(i + 1)}><b style={{ fontSize: 14 }}>{i + 1}</b>{q}</button>)}
          </div>
        </div>
        <Field label="Nap (minutes, optional)"><NumInput value={nap} onChange={setNap} placeholder="0" /></Field>
        <Field label="Note (optional)"><input className="input" value={note} placeholder="Late coffee, woke at 3am…" onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

export function StepsSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const settings = useSettings();
  const row = useLive(() => db.activity.get(`activity:${date}`), [date]);
  if (row === undefined && !settings) return null;
  return <StepsForm key={row?.updatedAt ?? 'new'} date={date} existing={row && !row.deleted ? row : undefined} settings={settings} onClose={onClose} />;
}

function StepsForm({ date, existing, settings, onClose }: { date: string; existing?: ActivityLog; settings?: Settings; onClose: () => void }) {
  const [steps, setSteps] = useState<number | undefined>(existing?.steps);
  const [active, setActive] = useState<number | undefined>(existing?.activeMin);
  const [km, setKm] = useState<number | undefined>(existing?.km);
  const est = stepsToKm(steps ?? 0, settings?.heightCm ?? 170);
  return (
    <Sheet title={`Steps · ${relativeDay(date)}`} onClose={onClose} footer={
      <button className="btn primary block" onClick={async () => {
        await save<ActivityLog>('activity', { id: `activity:${date}`, date, steps: steps ?? 0, activeMin: active || undefined, km: km || undefined });
        onClose();
      }}>Save</button>
    }>
      <div className="stack">
        <Field label="Steps today" hint="Copy the total from your phone's health app or your watch">
          <Stepper value={steps} onChange={setSteps} step={500} label="steps" />
        </Field>
        <div className="chips" style={{ justifyContent: 'center' }}>
          {[1000, 2000, 5000].map((n) => <button key={n} className="chip" onClick={() => setSteps((steps ?? 0) + n)}>+{num(n)}</button>)}
        </div>
        <div className="grid two">
          <Field label="Other active minutes" hint="Beyond logged workouts"><NumInput value={active} onChange={setActive} placeholder="0" /></Field>
          <Field label="Distance (km)" hint="Blank uses an estimate"><NumInput value={km} onChange={setKm} placeholder={est ? est.toFixed(1) : '0'} /></Field>
        </div>
        {!!steps && <div className="small muted">About {est.toFixed(1)} km and {stepsToKcal(steps, settings?.weightKg ?? 70)} kcal from walking.</div>}
      </div>
    </Sheet>
  );
}

export function WeightSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const settings = useSettings();
  const row = useLive(() => db.body.get(`body:${date}`), [date]);
  if (!settings) return null;
  return <WeightForm key={row?.updatedAt ?? 'new'} date={date} existing={row && !row.deleted ? row : undefined} settings={settings} onClose={onClose} />;
}

function WeightForm({ date, existing, settings, onClose }: { date: string; existing?: BodyLog; settings: Settings; onClose: () => void }) {
  const unit = settings.weightUnit;
  const [value, setValue] = useState<number | undefined>(+fromKg(existing?.kg ?? settings.weightKg, unit).toFixed(1));
  const [fat, setFat] = useState<number | undefined>(existing?.bodyFat);
  const [waist, setWaist] = useState<number | undefined>(existing?.waistCm);
  return (
    <Sheet title={`Body · ${relativeDay(date)}`} onClose={onClose} footer={
      <>
        {existing && <button className="btn danger" aria-label="Delete entry" onClick={async () => { await remove('body', existing.id); onClose(); }}><Trash2 size={15} /></button>}
        <button className="btn primary grow" disabled={!value} onClick={async () => {
          const kg = toKg(value!, unit);
          await save<BodyLog>('body', { id: `body:${date}`, date, kg, bodyFat: fat, waistCm: waist });
          // The newest weigh-in also becomes the profile weight, which calorie estimates use.
          if (date >= today()) await save<Settings>('settings', { ...settings, weightKg: kg });
          onClose();
        }}>Save</button>
      </>
    }>
      <div className="stack">
        <Field label={`Weight (${unit})`}><Stepper value={value} onChange={setValue} step={unit === 'kg' ? 0.1 : 0.2} label="weight" /></Field>
        <div className="grid two">
          <Field label="Body fat % (optional)"><NumInput value={fat} onChange={setFat} placeholder="—" /></Field>
          <Field label="Waist cm (optional)"><NumInput value={waist} onChange={setWaist} placeholder="—" /></Field>
        </div>
      </div>
    </Sheet>
  );
}

// ---- History pages ----

const RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }];

const META = {
  water: { title: 'Water', icon: Droplet, color: METRIC_COLORS.water },
  sleep: { title: 'Sleep', icon: Moon, color: METRIC_COLORS.sleep },
  steps: { title: 'Steps', icon: Footprints, color: METRIC_COLORS.steps },
  body: { title: 'Body', icon: Scale, color: 'var(--ink-2)' },
} as const;

type Metric = keyof typeof META;

export default function Track() {
  const { metric } = useParams();
  const [date] = useSelectedDate();
  const settings = useSettings();
  const [range, setRange] = useState('30');
  const [open, setOpen] = useState(false);
  const end = today();
  const start = addDays(end, -(Number(range) - 1));
  const days = useSummaries(start, end, settings);
  const rows = useMemo(() => (days ? dateRange(start, end).map((d) => days.get(d)!) : []), [days, start, end]);
  const body = useLive(() => allAlive(db.body));

  if (!metric || !(metric in META)) return <Navigate to="/" replace />;
  if (!settings) return null;
  const m = metric as Metric;
  const g = settings.goals;
  const Icon = META[m].icon;
  const avg = (get: (d: (typeof rows)[number]) => number) => {
    const vals = rows.map(get).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  const hit = (test: (d: (typeof rows)[number]) => boolean) => rows.filter(test).length;
  const unit = settings.weightUnit;
  const series = [{ name: META[m].title, color: META[m].color }];

  return (
    <>
      <Link to="/" className="back"><ChevronLeft size={17} /> Today</Link>
      <div className="page-head">
        <h1 className="row"><Icon size={22} /> {META[m].title}</h1>
        <button className="btn primary sm" onClick={() => setOpen(true)}><Plus size={14} /> Log {date === today() ? 'today' : relativeDay(date)}</button>
      </div>
      <div className="stack">
        <Segmented value={range} onChange={setRange} label="Date range" options={RANGES} />
        {m === 'water' && (
          <div className="card">
            <Stats items={[['Daily average', `${num(avg((d) => d.waterMl))} ml`], ['Goal reached', `${hit((d) => d.waterMl >= g.waterMl)} days`]]} />
            <BarChart bars={rows.map((d) => ({ date: d.date, values: [d.waterMl] }))} series={series} goal={g.waterMl} fmt={(v) => `${num(v)} ml`} ariaLabel="Water per day" />
            <ChartTable head={['Date', 'Water (ml)']} rows={rows.filter((d) => d.waterMl).map((d) => [fmtDay(d.date), num(d.waterMl)])} />
          </div>
        )}
        {m === 'sleep' && (
          <>
            <div className="card">
              <Stats items={[['Average', fmtDuration(avg((d) => d.sleepMin))], ['Quality', `${avg((d) => d.sleepQuality).toFixed(1)} / 5`], ['Goal reached', `${hit((d) => d.sleepMin >= g.sleepMin)} nights`]]} />
              <BarChart bars={rows.map((d) => ({ date: d.date, values: [d.sleepMin / 60] }))} series={series} goal={g.sleepMin / 60} goalLabel={`Goal ${fmtDuration(g.sleepMin)}`} fmt={(v) => fmtDuration(v * 60)} ariaLabel="Hours of sleep per night" />
              <ChartTable head={['Night', 'Slept', 'Quality']} rows={rows.filter((d) => d.sleepMin).map((d) => [fmtDay(d.date), fmtDuration(d.sleepMin), d.sleepQuality])} />
            </div>
            <SleepConsistency start={start} end={end} />
          </>
        )}
        {m === 'steps' && (
          <div className="card">
            <Stats items={[['Daily average', num(avg((d) => d.steps))], ['Distance', `${rows.reduce((t, d) => t + d.km, 0).toFixed(1)} km`], ['Goal reached', `${hit((d) => d.steps >= g.steps)} days`]]} />
            <BarChart bars={rows.map((d) => ({ date: d.date, values: [d.steps] }))} series={series} goal={g.steps} fmt={num} ariaLabel="Steps per day" />
            <ChartTable head={['Date', 'Steps', 'Km']} rows={rows.filter((d) => d.steps).map((d) => [fmtDay(d.date), num(d.steps), d.km.toFixed(1)])} />
          </div>
        )}
        {m === 'body' && <BodyHistory rows={body ?? []} start={start} end={end} unit={unit} targetKg={settings.targetKg} />}
      </div>
      {open && m === 'water' && <WaterSheet date={date} onClose={() => setOpen(false)} />}
      {open && m === 'sleep' && <SleepSheet date={date} onClose={() => setOpen(false)} />}
      {open && m === 'steps' && <StepsSheet date={date} onClose={() => setOpen(false)} />}
      {open && m === 'body' && <WeightSheet date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

const Stats = ({ items }: { items: [string, string][] }) => (
  <div className="row wrap" style={{ gap: '6px 22px', marginBottom: 12 }}>
    {items.map(([k, v]) => <div key={k}><div className="tiny faint">{k}</div><div className="bold" style={{ fontSize: 17 }}>{v}</div></div>)}
  </div>
);

function SleepConsistency({ start, end }: { start: string; end: string }) {
  const logs = useLive(() => db.sleep.where('date').between(start, end, true, true).toArray(), [start, end]);
  const rows = (logs ?? []).filter((l) => !l.deleted);
  if (rows.length < 3) return null;
  // Bedtimes straddle midnight, so measure them from noon to keep 23:30 and 00:30 close together.
  const fromNoon = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return ((h + 12) % 24) * 60 + m;
  };
  const clock = (mins: number) => {
    const total = (Math.round(mins) + 720) % 1440;
    return new Date(2000, 0, 1, Math.floor(total / 60), total % 60).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };
  const stats = (vals: number[]) => {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { mean, sd: Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length) };
  };
  const bed = stats(rows.map((r) => fromNoon(r.bed)));
  const wake = stats(rows.map((r) => fromNoon(r.wake)));
  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}>Your schedule</h2>
      <Stats items={[['Usual bedtime', clock(bed.mean)], ['Usual wake time', clock(wake.mean)], ['Bedtime varies by', `±${fmtDuration(bed.sd)}`]]} />
      <p className="small muted">A steady schedule usually helps sleep as much as extra hours. Within 30 minutes either way is a good target.</p>
    </div>
  );
}

function BodyHistory({ rows, start, end, unit, targetKg }: { rows: BodyLog[]; start: string; end: string; unit: 'kg' | 'lb'; targetKg?: number }) {
  const inRange = rows.filter((r) => r.date >= start && r.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(rows.map((r) => [r.date, r.kg]));
  const trendAt = (date: string) => {
    const window = dateRange(addDays(date, -6), date).map((d) => byDate.get(d)).filter((v): v is number => v != null);
    return window.length ? fromKg(window.reduce((a, b) => a + b, 0) / window.length, unit) : null;
  };
  const points = dateRange(start, end).map((date) => ({ date, value: byDate.has(date) ? fromKg(byDate.get(date)!, unit) : null, trend: trendAt(date) }));
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  const change = first && last ? last.kg - first.kg : 0;
  return (
    <>
      <div className="card">
        <Stats items={[
          ['Latest', last ? fmtWeight(last.kg, unit) : '—'],
          ['Change', first && first !== last ? `${change > 0 ? '+' : ''}${fmtWeight(change, unit)}` : '—'],
          ...(targetKg ? ([['Target', fmtWeight(targetKg, unit)]] as [string, string][]) : []),
        ]} />
        <LineChart points={points} color="var(--food)" ariaLabel="Body weight over time" trendLabel="7-day average" fmt={(v) => `${v.toFixed(1)} ${unit}`} />
        {inRange.length > 0 && (
          <div className="legend" style={{ marginTop: 6 }}>
            <span><i style={{ '--c': 'var(--food)' } as React.CSSProperties} />Weigh-ins</span>
            <span><i style={{ '--c': 'var(--ink-3)' } as React.CSSProperties} />7-day average</span>
          </div>
        )}
        <ChartTable head={['Date', `Weight (${unit})`, 'Body fat %', 'Waist cm']} rows={[...inRange].reverse().map((r) => [fmtDay(r.date), fromKg(r.kg, unit).toFixed(1), r.bodyFat ?? '—', r.waistCm ?? '—'])} />
      </div>
      <p className="small muted">Weight swings 1–2 kg day to day with water and food. Watch the 7-day average, not single weigh-ins.</p>
    </>
  );
}

