import { useState } from 'react';
import { Field } from '../components/ui';
import { authErrorMessage, createAccount, resetPassword, signInWithEmail, signInWithGoogle } from '../lib/firebase';

type Mode = 'signin' | 'create';

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="onboard">
      <img className="brand-mark" src="icons/icon.svg" alt="" />
      <div className="stack tight">
        <h1 style={{ fontSize: 30 }}>Your whole day, in one place.</h1>
        <p className="muted">Sign in to keep your workouts, food, sleep and habits safe. Your data follows you to any device, even if you clear your browser.</p>
      </div>

      <button className="btn primary block" disabled={busy} onClick={() => run(signInWithGoogle)}>Continue with Google</button>

      <div className="row small faint" style={{ gap: 10 }}>
        <span className="grow" style={{ borderTop: '1px solid var(--line)' }} />or<span className="grow" style={{ borderTop: '1px solid var(--line)' }} />
      </div>

      <form className="stack" onSubmit={(e) => {
        e.preventDefault();
        void run(() => (mode === 'signin' ? signInWithEmail(email.trim(), password) : createAccount(email.trim(), password)));
      }}>
        <Field label="Email"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" hint={mode === 'create' ? 'At least 6 characters' : undefined}>
          <input className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn block" disabled={busy}>{mode === 'signin' ? 'Sign in' : 'Create account'}</button>
      </form>

      <div className="row between small">
        <button className="btn ghost sm" onClick={() => { setMode(mode === 'signin' ? 'create' : 'signin'); setError(''); setNotice(''); }}>
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>
        {mode === 'signin' && (
          <button className="btn ghost sm" disabled={busy || !email.trim()} onClick={() => run(async () => {
            await resetPassword(email.trim());
            setNotice('If that email has an account, a reset link is on its way.');
          })}>Forgot password?</button>
        )}
      </div>

      {error && <p className="small" role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
      {notice && <p className="small" role="status">{notice}</p>}
    </main>
  );
}
