import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { CalendarDays, Dumbbell, LineChart, Settings as Gear, Sun, Utensils } from 'lucide-react';
import { ToastProvider } from './components/ui';
import { useSettings } from './lib/db';
import { today, fmtClock } from './lib/date';
import { hasLocalProfile, prepareAccount, startSync, syncNow } from './lib/cloud';
import { firestoreRemote, isConfigured, useUser } from './lib/firebase';
import { TimerProvider, useTimers } from './lib/timers';
import SignIn from './pages/SignIn';
import Today from './pages/Today';
import Train from './pages/Train';
import Eat from './pages/Eat';
import PlanPage from './pages/Plan';
import Track from './pages/Track';
import Onboarding from './pages/Onboarding';
import Settings, { applyTheme } from './pages/Settings';

const Session = lazy(() => import('./pages/Session'));
const Stats = lazy(() => import('./pages/Stats'));
const Library = lazy(() => import('./pages/TrainExtras').then((m) => ({ default: m.Library })));
const ExerciseDetail = lazy(() => import('./pages/TrainExtras').then((m) => ({ default: m.ExerciseDetail })));
const RoutineEdit = lazy(() => import('./pages/TrainExtras').then((m) => ({ default: m.RoutineEdit })));

// The day being viewed is shared, so choosing yesterday on Today also logs to yesterday on Eat and Train.
const DateCtx = createContext<[string, (d: string) => void]>(['', () => {}]);
export const useSelectedDate = () => useContext(DateCtx);

function DateProvider({ children }: { children: React.ReactNode }) {
  const [date, setDate] = useState(today());
  // If the app stays open past midnight, roll forward instead of logging to yesterday by accident.
  const [lastToday, setLastToday] = useState(today());
  useEffect(() => {
    const check = () => {
      const t = today();
      if (t !== lastToday) {
        setLastToday(t);
        setDate((cur) => (cur === lastToday ? t : cur));
      }
    };
    const id = setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [lastToday]);
  const value = useMemo(() => [date, setDate] as [string, (d: string) => void], [date]);
  return <DateCtx.Provider value={value}>{children}</DateCtx.Provider>;
}

const NAV = [
  { to: '/', label: 'Today', icon: Sun, end: true },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/eat', label: 'Eat', icon: Utensils },
  { to: '/plan', label: 'Plan', icon: CalendarDays },
  { to: '/stats', label: 'Stats', icon: LineChart },
];

function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <Link to="/" className="nav-brand" aria-hidden="true" tabIndex={-1}><img src="icons/icon.svg" width={28} height={28} alt="" /> Daylyt</Link>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}><Icon size={21} /><span>{label}</span></NavLink>
      ))}
      <NavLink to="/settings" className="nav-settings"><Gear size={21} /><span>Settings</span></NavLink>
    </nav>
  );
}

function TimerDock() {
  const t = useTimers();
  const { pathname } = useLocation();
  const showFocus = t.focus && !(pathname === '/plan');
  if (t.restLeft == null && !showFocus) return null;
  return (
    <div className="dock">
      {t.restLeft != null && (
        <div className="timer-pill" role="timer" aria-label="Rest timer">
          <span className="small">Rest</span>
          <span className="time grow">{fmtClock(t.restLeft)}</span>
          <button onClick={() => t.addRest(15)}>+15s</button>
          <button onClick={t.stopRest}>Skip</button>
        </div>
      )}
      {showFocus && (
        <div className="timer-pill">
          <span className="small clip">{t.focus!.mode === 'break' ? 'Break' : t.focus!.label || 'Focus'}</span>
          <span className="time grow">{fmtClock(t.focusLeft)}</span>
          <Link to="/plan?tab=focus" style={{ fontSize: 13, fontWeight: 600, padding: '6px 9px' }}>Open</Link>
        </div>
      )}
    </div>
  );
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** Signed in: gets this device's copy ready, then keeps it in step with the database. */
function Account({ uid }: { uid: string }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const remote = useMemo(() => firestoreRemote(uid), [uid]);

  useEffect(() => {
    let live = true;
    (async () => {
      await prepareAccount(uid);
      // A returning device opens at once and syncs behind the scenes. A device with no copy must
      // wait: showing setup before the data arrives could overwrite the real profile.
      if (await hasLocalProfile()) {
        if (live) setPhase('ready');
        return;
      }
      try {
        await syncNow(remote);
        if (live) setPhase('ready');
      } catch {
        if (live) setPhase('failed');
      }
    })();
    return () => { live = false; };
  }, [uid, remote, attempt]);

  useEffect(() => (phase === 'ready' ? startSync(remote) : undefined), [phase, remote]);

  if (phase === 'failed') {
    return (
      <main className="onboard">
        <h1>Couldn't reach your data</h1>
        <p className="muted">Check your connection and try again. Your data is safe in the database.</p>
        <button className="btn primary block" onClick={() => { setPhase('loading'); setAttempt(attempt + 1); }}>Try again</button>
      </main>
    );
  }
  if (phase === 'loading') {
    return <main className="onboard"><img className="brand-mark" src="icons/icon.svg" alt="" /><p className="muted" role="status">Loading your data…</p></main>;
  }
  return <Shell />;
}

function Gate() {
  const user = useUser();
  // Local UI testing only: `vite --mode uitest`. import.meta.env.DEV removes this from real builds.
  if (import.meta.env.DEV && import.meta.env.VITE_SKIP_AUTH === '1') return <Shell />;
  if (!isConfigured) return <main className="onboard"><h1>Daylyt isn't connected to its database yet.</h1></main>;
  if (user === undefined) return null;
  if (!user) return <SignIn />;
  // The key restarts everything if a different account signs in.
  return <Account key={user.uid} uid={user.uid} />;
}

function Shell() {
  const settings = useSettings();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Give IndexedDB a beat so a returning user never sees onboarding flash.
    const id = setTimeout(() => setReady(true), 250);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => { if (settings) applyTheme(settings.theme); }, [settings?.theme]); // eslint-disable-line

  if (!settings) {
    return ready ? <Onboarding /> : null;
  }
  if (!settings.onboarded) return <Onboarding />;

  return (
    <div className="frame">
      <Nav />
      <main className="main">
        <ScrollTop />
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/train" element={<Train />} />
            <Route path="/train/session/:id" element={<Session />} />
            <Route path="/train/library" element={<Library />} />
            <Route path="/train/exercise/:id" element={<ExerciseDetail />} />
            <Route path="/train/routine/:id" element={<RoutineEdit />} />
            <Route path="/eat" element={<Eat />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/track/:metric" element={<Track />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Today />} />
          </Routes>
        </Suspense>
      </main>
      <TimerDock />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <TimerProvider>
          <DateProvider>
            <Gate />
          </DateProvider>
        </TimerProvider>
      </ToastProvider>
    </HashRouter>
  );
}
