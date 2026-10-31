import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Minus, Plus, Search, X } from 'lucide-react';

export function Sheet({ title, onClose, children, footer, full }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; full?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      // showModal focuses the first control (the close button), which is rarely what you want next.
      d.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet${full ? ' full' : ''}`}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      <div className="sheet-head">
        <h2 className="clip">{title}</h2>
        <button className="icon-btn filled sm" onClick={onClose} aria-label="Close"><X size={17} /></button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="sheet-foot">{footer}</div>}
    </dialog>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="tiny faint">{hint}</span>}
    </label>
  );
}

/** Numeric input that holds its own text, so typing "1." or clearing the box doesn't fight the value. */
export function NumInput({ value, onChange, className = 'input', placeholder, step, min = 0, label, autoFocus }: {
  value: number | undefined; onChange: (v: number | undefined) => void; className?: string; placeholder?: string; step?: number; min?: number; label?: string; autoFocus?: boolean;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  const last = useRef(value);
  if (value !== last.current) {
    last.current = value;
    const parsed = text === '' ? undefined : Number(text);
    if (parsed !== value) setText(value == null ? '' : String(value));
  }
  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      aria-label={label}
      data-autofocus={autoFocus ? '' : undefined}
      value={text}
      min={min}
      step={step ?? 'any'}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value === '' ? undefined : Number(e.target.value);
        last.current = n;
        onChange(n != null && !Number.isNaN(n) ? Math.max(min, n) : undefined);
      }}
    />
  );
}

/**
 * Text that saves as you type. Saved values come back asynchronously, so an input bound straight
 * to them drops characters and jumps the cursor; this keeps its own text while it has focus.
 */
export function LiveText({ value, onChange, multiline, ...rest }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string; style?: CSSProperties; 'aria-label'?: string;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(value); }, [value]);
  const props = {
    value: text,
    onFocus: () => { focused.current = true; },
    onBlur: () => { focused.current = false; },
    onChange: (e: { target: { value: string } }) => { setText(e.target.value); onChange(e.target.value); },
    ...rest,
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

export function Stepper({ value, onChange, step = 1, min = 0, label, autoFocus }: { value: number | undefined; onChange: (v: number | undefined) => void; step?: number; min?: number; label: string; autoFocus?: boolean }) {
  const bump = (d: number) => onChange(Math.max(min, +((value ?? 0) + d).toFixed(2)));
  return (
    <div className="stepper">
      <button type="button" onClick={() => bump(-step)} aria-label={`Decrease ${label}`}><Minus size={17} /></button>
      <NumInput className="" value={value} onChange={onChange} min={min} label={label} autoFocus={autoFocus} />
      <button type="button" onClick={() => bump(step)} aria-label={`Increase ${label}`}><Plus size={17} /></button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  return (
    <div className="search">
      <Search size={17} />
      <input className="input" type="search" value={value} data-autofocus={autoFocus ? '' : undefined} placeholder={placeholder} aria-label={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function CheckBox({ on, onClick, color, label }: { on: boolean; onClick: () => void; color?: string; label: string }) {
  return (
    <button type="button" className={`check${on ? ' on' : ''}`} style={color ? ({ '--c': color } as CSSProperties) : undefined} onClick={onClick} role="checkbox" aria-checked={on} aria-label={label}>
      <Check size={16} strokeWidth={3} />
    </button>
  );
}

export function Progress({ value, color, over }: { value: number; color?: string; over?: boolean }) {
  return (
    <div className={`bar${over ? ' over' : ''}`} role="progressbar" aria-valuenow={Math.round(Math.min(1, value) * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, '--c': color } as CSSProperties} />
    </div>
  );
}

export const Empty = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <div className="empty">
    {icon}
    <div><div className="bold">{title}</div></div>
    {children}
  </div>
);

export function WeekdayPicker({ value, onChange, weekStart }: { value: number[]; onChange: (v: number[]) => void; weekStart: 0 | 1 }) {
  const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const full = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const order = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);
  return (
    <div className="weekday-picker">
      {order.map((d) => (
        <button key={d} type="button" aria-label={full[d]} aria-pressed={value.includes(d)} className={value.includes(d) ? 'on' : ''}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])}>{names[d]}</button>
      ))}
    </div>
  );
}

/** Sequential arcs around one circle: each goal of the day is its own ray of the sun. */
export function DayRing({ segments, size = 132, children }: { segments: { key: string; progress: number; color: string }[]; size?: number; children?: ReactNode }) {
  const stroke = size * 0.085;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const n = Math.max(segments.length, 1);
  const gap = n > 1 ? 14 : 0;
  const sweep = 360 / n - gap;
  const point = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
  };
  const arc = (from: number, len: number) => {
    if (len >= 359.9) return `M ${point(from)} A ${r} ${r} 0 1 1 ${point(from + 180)} A ${r} ${r} 0 1 1 ${point(from + 359.9)}`;
    return `M ${point(from)} A ${r} ${r} 0 ${len > 180 ? 1 : 0} 1 ${point(from + len)}`;
  };
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} aria-hidden="true">
        {segments.map((s, i) => {
          const start = i * (360 / n) + gap / 2;
          return (
            <g key={s.key}>
              <path d={arc(start, sweep)} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" />
              {s.progress > 0.005 && <path d={arc(start, sweep * Math.min(1, s.progress))} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round" />}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

// ---- Toast with undo ----

interface ToastApi { toast: (msg: string, undo?: () => void) => void }
const ToastCtx = createContext<ToastApi>({ toast: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ msg: string; undo?: () => void; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((msg: string, undo?: () => void) => {
    clearTimeout(timer.current);
    setState({ msg, undo, key: Date.now() });
    timer.current = setTimeout(() => setState(null), undo ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      {state && (
        <div className="toast" role="status" key={state.key}>
          <span>{state.msg}</span>
          {state.undo && <button onClick={() => { state.undo?.(); setState(null); }}>Undo</button>}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const METRIC_COLORS = {
  water: 'var(--water)', food: 'var(--food)', steps: 'var(--steps)', focus: 'var(--focus)', habits: 'var(--habits)', workout: 'var(--workout)', sleep: 'var(--sleep)',
} as const;
