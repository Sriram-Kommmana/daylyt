import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { save } from './db';
import { today } from './date';
import type { FocusLog } from './types';

// Timers store an end timestamp rather than counting ticks, so they stay accurate when the
// phone throttles the page and survive a reload or a navigation.

const KEY = 'daylyt-timers';

interface FocusState {
  mode: 'focus' | 'break';
  /** Running: when it ends. Paused: undefined. */
  endsAt?: number;
  remaining: number;
  total: number;
  label: string;
}

interface Stored {
  rest?: { endsAt: number; total: number };
  focus?: FocusState;
}

const load = (): Stored => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
};
const store = (s: Stored) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ } };

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.2, 0.4].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
    navigator.vibrate?.([120, 60, 120]);
  } catch { /* audio unavailable */ }
}

function notify(title: string, body: string) {
  try {
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body, icon: 'icons/icon-192.png' });
  } catch { /* some mobile browsers only allow notifications from a service worker */ }
}

interface TimersApi {
  restLeft: number | null;
  restTotal: number;
  startRest: (sec: number) => void;
  addRest: (sec: number) => void;
  stopRest: () => void;
  focus: FocusState | null;
  focusLeft: number;
  startFocus: (minutes: number, label: string, mode?: 'focus' | 'break') => void;
  pauseFocus: () => void;
  resumeFocus: () => void;
  endFocus: (saveIt: boolean) => void;
}

const Ctx = createContext<TimersApi>(null as unknown as TimersApi);
export const useTimers = () => useContext(Ctx);

export function TimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);
  const [now, setNow] = useState(Date.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback((next: Stored) => {
    stateRef.current = next;
    store(next);
    setState(next);
  }, []);

  const logFocus = useCallback((f: FocusState, seconds: number) => {
    const minutes = Math.round(seconds / 60);
    if (f.mode === 'focus' && minutes >= 1) void save<FocusLog>('focus', { date: today(), minutes, label: f.label, at: Date.now() });
  }, []);

  const running = !!state.rest || !!state.focus?.endsAt;
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const s = stateRef.current;
      if (s.rest && s.rest.endsAt <= t) {
        chime();
        notify('Rest is over', 'Time for your next set.');
        update({ ...s, rest: undefined });
      }
      const f = stateRef.current.focus;
      if (f?.endsAt && f.endsAt <= t) {
        chime();
        notify(f.mode === 'focus' ? 'Focus session complete' : 'Break is over', f.mode === 'focus' ? 'Nice work. Take a break.' : 'Ready for another round?');
        logFocus(f, f.total);
        update({ ...stateRef.current, focus: undefined });
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [running, update, logFocus]);

  const api = useMemo<TimersApi>(() => {
    const f = state.focus ?? null;
    return {
      restLeft: state.rest ? Math.max(0, (state.rest.endsAt - now) / 1000) : null,
      restTotal: state.rest?.total ?? 0,
      startRest: (sec) => { setNow(Date.now()); update({ ...stateRef.current, rest: { endsAt: Date.now() + sec * 1000, total: sec } }); },
      addRest: (sec) => {
        const r = stateRef.current.rest;
        if (r) update({ ...stateRef.current, rest: { endsAt: r.endsAt + sec * 1000, total: r.total + sec } });
      },
      stopRest: () => update({ ...stateRef.current, rest: undefined }),
      focus: f,
      focusLeft: f ? (f.endsAt ? Math.max(0, (f.endsAt - now) / 1000) : f.remaining) : 0,
      startFocus: (minutes, label, mode = 'focus') => {
        setNow(Date.now());
        update({ ...stateRef.current, focus: { mode, label, total: minutes * 60, remaining: minutes * 60, endsAt: Date.now() + minutes * 60_000 } });
      },
      pauseFocus: () => {
        const cur = stateRef.current.focus;
        if (cur?.endsAt) update({ ...stateRef.current, focus: { ...cur, endsAt: undefined, remaining: Math.max(0, (cur.endsAt - Date.now()) / 1000) } });
      },
      resumeFocus: () => {
        const cur = stateRef.current.focus;
        if (cur && !cur.endsAt) { setNow(Date.now()); update({ ...stateRef.current, focus: { ...cur, endsAt: Date.now() + cur.remaining * 1000 } }); }
      },
      endFocus: (saveIt) => {
        const cur = stateRef.current.focus;
        if (cur && saveIt) {
          const left = cur.endsAt ? (cur.endsAt - Date.now()) / 1000 : cur.remaining;
          logFocus(cur, cur.total - left);
        }
        update({ ...stateRef.current, focus: undefined });
      },
    };
  }, [state, now, update, logFocus]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
