import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Cloud, CloudOff, Download, LogOut, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Field, LiveText, NumInput, Segmented, useToast } from '../components/ui';
import { db, save, useSettings } from '../lib/db';
import { ACTIVITY_LEVELS, fromKg, suggestGoals, tdee, toKg } from '../lib/calc';
import { downloadFile, exportSnapshot, importSnapshot, validateSnapshot } from '../lib/backup';
import { deleteEverything, forgetDevice, getSyncStatus, syncNow, useSyncStatus } from '../lib/cloud';
import { currentEmail, signOut } from '../lib/firebase';
import { useInstall } from '../lib/install';
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
        <AccountSection />
        <InstallSection />
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
      <Field label="Name"><LiveText className="input" value={s.name} onChange={(name) => put(s, { name })} /></Field>
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

function AccountSection() {
  const { toast } = useToast();
  const sync = useSyncStatus();
  const [confirming, setConfirming] = useState(false);
  const email = currentEmail();
  const saved = sync.pending === 0 && sync.state !== 'error';
  const statusText = sync.state === 'syncing' ? 'Saving…'
    : sync.pending > 0 ? `${sync.pending} change${sync.pending === 1 ? '' : 's'} waiting to save${sync.state === 'offline' ? ' until you are back online' : ''}.`
    : sync.state === 'error' ? 'The last sync failed. It will try again automatically.'
    : 'Everything is saved to your account.';

  const leave = async () => {
    await signOut();
    await forgetDevice();
  };
  return (
    <section className="card stack">
      <div>
        <h2>Account</h2>
        <p className="small muted" style={{ marginTop: 3 }}>{email ? `Signed in as ${email}. ` : ''}Your data is stored in your account's database, so clearing your browser or changing phones won't lose it.</p>
      </div>
      <div className="small row" role="status" style={{ color: saved ? undefined : 'var(--bad)' }}>
        {saved ? <Cloud size={15} /> : <CloudOff size={15} />} {statusText}
      </div>
      <div className="row">
        <button className="btn grow" disabled={sync.state === 'syncing'} onClick={() => syncNow().then(() => toast('Saved')).catch(() => toast('Could not reach the database'))}><RefreshCw size={14} /> Sync now</button>
        {!confirming && <button className="btn ghost" onClick={async () => {
          await syncNow().catch(() => {});
          if (getSyncStatus().pending > 0) setConfirming(true);
          else await leave();
        }}><LogOut size={14} /> Sign out</button>}
      </div>
      {confirming && (
        <div className="stack tight">
          <p className="small bold">{getSyncStatus().pending} change{getSyncStatus().pending === 1 ? ' has' : 's have'} not reached the database, and will be lost if you sign out now.</p>
          <div className="row">
            <button className="btn danger grow" onClick={leave}>Sign out anyway</button>
            <button className="btn grow" onClick={() => setConfirming(false)}>Stay signed in</button>
          </div>
        </div>
      )}
    </section>
  );
}

function InstallSection() {
  const { canInstall, install, installed } = useInstall();
  if (installed) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!canInstall && !ios) return null;
  return (
    <section className="card stack">
      <div>
        <h2>Install the app</h2>
        <p className="small muted" style={{ marginTop: 3 }}>{ios ? 'In Safari, tap Share, then Add to Home Screen. Daylyt then opens like a normal app.' : 'Add Daylyt to your home screen so it opens like a normal app.'}</p>
      </div>
      {canInstall && <button className="btn primary" onClick={install}><Download size={15} /> Install Daylyt</button>}
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
        <p className="small muted" style={{ marginTop: 3 }}>Download a copy whenever you like. It's a plain file that you keep, separate from your account.</p>
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
          <p className="small bold">This permanently deletes all your data from the database and this device. It cannot be undone. Any other device keeps its own copy until you sign out there.</p>
          <div className="row">
            <button className="btn danger grow" onClick={async () => {
              try {
                await deleteEverything();
                location.reload();
              } catch {
                toast('Could not reach the database, so nothing was deleted. Check your connection.');
              }
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
