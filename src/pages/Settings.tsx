import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Field, NumInput, Segmented, useToast } from '../components/ui';
import { db, save, TABLES, useSettings } from '../lib/db';
import { ACTIVITY_LEVELS, fromKg, suggestGoals, tdee, toKg } from '../lib/calc';
import { connectSync, disconnectSync, downloadFile, exportSnapshot, importSnapshot, lastSync, syncConfigured, syncNow, validateSnapshot } from '../lib/sync';
import type { Goals, GoalType, Settings as S } from '../lib/types';

export function applyTheme(theme: S['theme']) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem('daylyt-theme');
    else localStorage.setItem('daylyt-theme', theme);
  } catch { /* storage blocked */ }
}

export default function Settings() {
  const s = useSettings();
  if (!s) return null;
  return (
    <>
      <Link to="/" className="back"><ChevronLeft size={17} /> Today</Link>
      <div className="page-head"><h1>Settings</h1></div>
      <div className="stack loose" style={{ maxWidth: 640 }}>
        <Profile s={s} />
        <GoalsSection s={s} />
        <Preferences s={s} />
        <Sync />
        <DataSection />
        <About />
      </div>
    </>
  );
}

const put = (s: S, patch: Partial<S>) => save<S>('settings', { ...s, ...patch });

function Profile({ s }: { s: S }) {
  const unit = s.weightUnit;
  return (
    <section className="card stack">
      <h2>Profile</h2>
      <Field label="Name"><input className="input" value={s.name} onChange={(e) => put(s, { name: e.target.value })} /></Field>
      <div className="grid two">
        <Field label="Sex" hint="Used for the calorie estimate">
          <Segmented value={s.sex} onChange={(sex) => put(s, { sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
        </Field>
        <Field label="Birth year"><NumInput value={s.birthYear} onChange={(v) => v && put(s, { birthYear: v })} /></Field>
        <Field label="Height (cm)"><NumInput value={s.heightCm} onChange={(v) => v && put(s, { heightCm: v })} /></Field>
        <Field label={`Weight (${unit})`}><NumInput value={+fromKg(s.weightKg, unit).toFixed(1)} onChange={(v) => v && put(s, { weightKg: toKg(v, unit) })} /></Field>
      </div>
      <Field label="Activity level">
        <select className="input" value={s.activity} onChange={(e) => put(s, { activity: Number(e.target.value) })}>
          {ACTIVITY_LEVELS.map((a) => <option key={a.value} value={a.value}>{a.label}: {a.hint}</option>)}
        </select>
      </Field>
      <Field label="Goal">
        <Segmented<GoalType> value={s.goalType} onChange={(goalType) => put(s, { goalType })} options={[{ value: 'lose', label: 'Lose fat' }, { value: 'maintain', label: 'Maintain' }, { value: 'gain', label: 'Build muscle' }]} />
      </Field>
      <Field label={`Target weight (${unit}, optional)`}><NumInput value={s.targetKg ? +fromKg(s.targetKg, unit).toFixed(1) : undefined} onChange={(v) => put(s, { targetKg: v ? toKg(v, unit) : undefined })} /></Field>
    </section>
  );
}

function GoalsSection({ s }: { s: S }) {
  const { toast } = useToast();
  const g = s.goals;
  const set = (patch: Partial<Goals>) => put(s, { goals: { ...g, ...patch } });
  const field = (label: string, key: keyof Goals) => (
    <Field label={label}><NumInput value={g[key]} onChange={(v) => set({ [key]: v ?? 0 })} /></Field>
  );
  return (
    <section className="card stack">
      <div className="row between">
        <div>
          <h2>Daily goals</h2>
          <div className="tiny faint">You burn roughly {Math.round(tdee(s)).toLocaleString()} kcal a day</div>
        </div>
        <button className="btn sm" onClick={() => { void put(s, { goals: { ...suggestGoals(s), focusMin: g.focusMin, workoutsPerWeek: g.workoutsPerWeek, steps: g.steps } }); toast('Goals recalculated from your profile'); }}><RefreshCw size={13} /> Recalculate</button>
      </div>
      <div className="grid two">
        {field('Calories (kcal)', 'kcal')}
        {field('Protein (g)', 'protein')}
        {field('Carbs (g)', 'carbs')}
        {field('Fat (g)', 'fat')}
        {field('Fibre (g)', 'fiber')}
        {field('Water (ml)', 'waterMl')}
        <Field label="Sleep (hours)"><NumInput value={+(g.sleepMin / 60).toFixed(2)} onChange={(v) => set({ sleepMin: Math.round((v ?? 0) * 60) })} /></Field>
        {field('Steps', 'steps')}
        {field('Focus (minutes)', 'focusMin')}
        {field('Workouts per week', 'workoutsPerWeek')}
      </div>
      <label className="row between">
        <span><span className="field-label">Add workout calories to food budget</span><br /><span className="tiny faint">Leave off if your activity level already includes training</span></span>
        <input type="checkbox" checked={s.eatBack} style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} onChange={(e) => put(s, { eatBack: e.target.checked })} />
      </label>
    </section>
  );
}

function Preferences({ s }: { s: S }) {
  return (
    <section className="card stack">
      <h2>Preferences</h2>
      <Field label="Theme">
        <Segmented<S['theme']> value={s.theme} onChange={(theme) => { applyTheme(theme); void put(s, { theme }); }} options={[{ value: 'system', label: 'Automatic' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Field>
      <div className="grid two">
        <Field label="Weight unit"><Segmented<S['weightUnit']> value={s.weightUnit} onChange={(weightUnit) => put(s, { weightUnit })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></Field>
        <Field label="Week starts on"><Segmented value={String(s.weekStart)} onChange={(v) => put(s, { weekStart: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} /></Field>
        <Field label="Glass size (ml)"><NumInput value={s.glassMl} onChange={(v) => v && put(s, { glassMl: v })} /></Field>
        <Field label="Rest between sets (sec)" hint="0 turns the rest timer off"><NumInput value={s.restSec} onChange={(v) => put(s, { restSec: v ?? 0 })} /></Field>
        <Field label="Focus length (min)"><NumInput value={s.focusLen} onChange={(v) => v && put(s, { focusLen: v })} /></Field>
        <Field label="Break length (min)"><NumInput value={s.breakLen} onChange={(v) => v && put(s, { breakLen: v })} /></Field>
      </div>
    </section>
  );
}

function Sync() {
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState(syncConfigured());
  const [last, setLast] = useState(lastSync());
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      setOn(syncConfigured());
      setLast(lastSync());
      setToken('');
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack">
      <div>
        <h2>Sync between devices (optional)</h2>
        <p className="small muted" style={{ marginTop: 3 }}>
          Your data lives on this device. To use Daylyt on your phone and laptop together, store it in a secret GitHub Gist on your own free GitHub account. The app talks directly to GitHub, with no Daylyt server in between.
        </p>
      </div>
      {on ? (
        <>
          <div className="small">Connected. {last ? `Last synced ${new Date(last).toLocaleString()}.` : ''}</div>
          <div className="row">
            <button className="btn grow" disabled={busy} onClick={() => run(syncNow, 'Synced')}><RefreshCw size={14} /> {busy ? 'Syncing…' : 'Sync now'}</button>
            <button className="btn ghost" onClick={() => { disconnectSync(); setOn(false); setLast(0); toast('Sync turned off on this device'); }}>Turn off</button>
          </div>
        </>
      ) : (
        <>
          <ol className="small muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
            <li>On GitHub, create a <a style={{ textDecoration: 'underline' }} href="https://github.com/settings/tokens/new?scopes=gist&description=Daylyt%20sync" target="_blank" rel="noreferrer">personal access token</a> with only the “gist” permission. Set the expiry to “No expiration”.</li>
            <li>Paste it below. Use the same token on your other devices.</li>
          </ol>
          <Field label="GitHub token" hint="Kept only in this browser. Anyone with this device could read it, so don't connect on a shared computer.">
            <input className="input" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <button className="btn primary" disabled={!token.trim() || busy} onClick={() => run(() => connectSync(token), 'Sync is on')}>{busy ? 'Connecting…' : 'Connect'}</button>
        </>
      )}
    </section>
  );
}

function csv(rows: (string | number | undefined)[][]) {
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

function DataSection() {
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);
  const exportCsv = async () => {
    const food = await db.foodLogs.toArray();
    const workouts = await db.workouts.toArray();
    const foodCsv = csv([['date', 'meal', 'food', 'amount', 'kcal', 'protein', 'carbs', 'fat', 'fibre'], ...food.filter((f) => !f.deleted).map((f) => [f.date, f.meal, f.name, f.amount, f.kcal, f.protein, f.carbs, f.fat, f.fiber])]);
    const setRows: (string | number | undefined)[][] = [['date', 'workout', 'exercise', 'set', 'reps', 'weight_kg', 'seconds', 'km', 'done']];
    for (const w of workouts) {
      if (w.deleted) continue;
      for (const e of w.exercises) e.sets.forEach((s, i) => setRows.push([w.date, w.name, e.name, i + 1, s.reps, s.weight, s.sec, s.km, s.done ? 'yes' : 'no']));
    }
    downloadFile(`daylyt-food-${stamp}.csv`, foodCsv, 'text/csv');
    downloadFile(`daylyt-workouts-${stamp}.csv`, csv(setRows), 'text/csv');
  };
  return (
    <section className="card stack">
      <div>
        <h2>Your data</h2>
        <p className="small muted" style={{ marginTop: 3 }}>Browsers can clear stored data, for example if you clear site data. Keep a backup, or turn on sync above.</p>
      </div>
      <div className="row wrap">
        <button className="btn grow" onClick={async () => { downloadFile(`daylyt-backup-${stamp}.json`, JSON.stringify(await exportSnapshot())); toast('Backup downloaded'); }}><Download size={15} /> Download backup</button>
        <button className="btn grow" onClick={() => file.current?.click()}><Upload size={15} /> Restore backup</button>
        <button className="btn grow" onClick={exportCsv}><Download size={15} /> Export CSV</button>
      </div>
      <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Backup file" onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try {
          const data = JSON.parse(await f.text());
          validateSnapshot(data);
          const n = await importSnapshot(data);
          toast(`Restored ${n} item${n === 1 ? '' : 's'}`);
        } catch (err) {
          toast(err instanceof Error && err.message.includes('Daylyt') ? err.message : 'That file could not be read.');
        }
      }} />
      {confirming ? (
        <div className="stack tight">
          <p className="small bold">This deletes everything on this device and cannot be undone.</p>
          <div className="row">
            <button className="btn danger grow" onClick={async () => {
              disconnectSync();
              await Promise.all(TABLES.map((t) => db[t].clear()));
              location.reload();
            }}>Delete everything</button>
            <button className="btn grow" onClick={() => setConfirming(false)}>Keep my data</button>
          </div>
        </div>
      ) : (
        <button className="btn ghost danger" onClick={() => setConfirming(true)}><Trash2 size={15} /> Delete all data</button>
      )}
    </section>
  );
}

function About() {
  return (
    <section className="small muted stack tight">
      <p>Calorie burn and food values are estimates, good for tracking trends. Daylyt isn't medical advice.</p>
      <p>Exercises: <a style={{ textDecoration: 'underline' }} href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer">free-exercise-db</a> (public domain). Foods: <a style={{ textDecoration: 'underline' }} href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">USDA FoodData Central</a> and <a style={{ textDecoration: 'underline' }} href="https://world.openfoodfacts.org/" target="_blank" rel="noreferrer">Open Food Facts</a>. Activity burn rates follow the Compendium of Physical Activities.</p>
    </section>
  );
}
