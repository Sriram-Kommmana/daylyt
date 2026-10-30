import { useState } from 'react';
import { Field, NumInput, Segmented } from '../components/ui';
import { defaultSettings, save } from '../lib/db';
import { ACTIVITY_LEVELS, fromKg, suggestGoals, toKg } from '../lib/calc';
import { importSnapshot, validateSnapshot } from '../lib/backup';
import type { GoalType, Settings } from '../lib/types';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [s, setS] = useState<Settings>(defaultSettings());
  const [error, setError] = useState('');
  const set = (p: Partial<Settings>) => setS({ ...s, ...p });
  const goals = suggestGoals(s);
  const unit = s.weightUnit;

  const finish = async () => {
    await save<Settings>('settings', { ...s, onboarded: true, goals });
  };

  return (
    <main className="onboard">
      <img className="brand-mark" src="icons/icon.svg" alt="" />
      <div className="steps-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <div className="stack tight">
            <h1 style={{ fontSize: 30 }}>Welcome to Daylyt.</h1>
            <p className="muted">A few details first, so your calorie and protein targets fit you.</p>
          </div>
          <Field label="What should we call you? (optional)"><input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Sex" hint="Only used to estimate how many calories you burn">
            <Segmented value={s.sex} onChange={(sex) => set({ sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} />
          </Field>
          <div className="grid two">
            <Field label="Birth year"><NumInput value={s.birthYear} onChange={(v) => set({ birthYear: v ?? s.birthYear })} /></Field>
            <Field label="Height (cm)"><NumInput value={s.heightCm} onChange={(v) => set({ heightCm: v ?? s.heightCm })} /></Field>
            <Field label={`Weight (${unit})`}><NumInput value={+fromKg(s.weightKg, unit).toFixed(1)} onChange={(v) => set({ weightKg: v ? toKg(v, unit) : s.weightKg })} /></Field>
            <Field label="Unit"><Segmented value={unit} onChange={(weightUnit) => set({ weightUnit })} options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]} /></Field>
          </div>
          <button className="btn primary block" onClick={() => setStep(1)}>Continue</button>
          <label className="btn ghost block">
            I have a backup file
            <input type="file" hidden accept="application/json,.json" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                validateSnapshot(data);
                await importSnapshot(data);
              } catch {
                setError('That file could not be read as a Daylyt backup.');
              }
            }} />
          </label>
          {error &&<p className="small" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
        </>
      )}

      {step === 1 && (
        <>
          <div className="stack tight">
            <h1>What's your goal?</h1>
            <p className="muted">This sets your calorie and protein targets.</p>
          </div>
          <div className="stack tight">
            {([['lose', 'Lose fat', 'A steady deficit of about 500 kcal a day'], ['maintain', 'Stay where I am', 'Eat about what you burn'], ['gain', 'Build muscle', 'A small surplus of about 300 kcal a day']] as [GoalType, string, string][]).map(([v, label, hint]) => (
              <button key={v} className={`option${s.goalType === v ? ' on' : ''}`} aria-pressed={s.goalType === v} onClick={() => set({ goalType: v })}>
                <div className="bold">{label}</div><div className="small muted">{hint}</div>
              </button>
            ))}
          </div>
          <div className="field-label">How active are you?</div>
          <div className="stack tight">
            {ACTIVITY_LEVELS.slice(0, 4).map((a) => (
              <button key={a.value} className={`option${s.activity === a.value ? ' on' : ''}`} aria-pressed={s.activity === a.value} onClick={() => set({ activity: a.value })}>
                <div className="bold">{a.label}</div><div className="small muted">{a.hint}</div>
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={() => setStep(0)}>Back</button>
            <button className="btn primary grow" onClick={() => setStep(2)}>Continue</button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="stack tight">
            <h1>Here's your starting plan.</h1>
            <p className="muted">Estimates from your profile. You can change any of them later in Settings.</p>
          </div>
          <div className="card">
            <div className="grid two">
              <Goal label="Calories" value={`${goals.kcal.toLocaleString()} kcal`} />
              <Goal label="Protein" value={`${goals.protein} g`} />
              <Goal label="Carbs" value={`${goals.carbs} g`} />
              <Goal label="Fat" value={`${goals.fat} g`} />
              <Goal label="Water" value={`${(goals.waterMl / 1000).toFixed(2).replace(/0$/, '')} L`} />
              <Goal label="Sleep" value="8 hours" />
              <Goal label="Steps" value={goals.steps.toLocaleString()} />
              <Goal label="Workouts" value={`${goals.workoutsPerWeek} a week`} />
            </div>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setStep(1)}>Back</button>
            <button className="btn primary grow" onClick={finish}>Start tracking</button>
          </div>
        </>
      )}
    </main>
  );
}

const Goal = ({ label, value }: { label: string; value: string }) => (
  <div><div className="tiny faint">{label}</div><div className="bold" style={{ fontSize: 17 }}>{value}</div></div>
);
