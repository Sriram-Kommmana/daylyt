// Dates are local-calendar strings (YYYY-MM-DD). Never parse them with `new Date(str)`:
// that reads as UTC and shifts the day for anyone west of Greenwich.

const pad = (n: number) => String(n).padStart(2, '0');

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parse = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

export const today = () => toISO(new Date());

export const addDays = (iso: string, n: number) => {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const weekday = (iso: string) => parse(iso).getDay();

export const weekStartOf = (iso: string, weekStart: 0 | 1 = 1) => {
  const diff = (weekday(iso) - weekStart + 7) % 7;
  return addDays(iso, -diff);
};

export const dateRange = (start: string, end: string) => {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};

export const daysBetween = (a: string, b: string) =>
  Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

export const fmtDay = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parse(iso).toLocaleDateString(undefined, opts);

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const relativeDay = (iso: string) => {
  const diff = daysBetween(today(), iso);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return fmtDay(iso);
};

export const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Minutes between two HH:mm clock times; a bedtime after the wake time crosses midnight. */
export const sleepMinutes = (bed: string, wake: string) => {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const diff = toMin(wake) - toMin(bed);
  return diff <= 0 ? diff + 1440 : diff;
};

export const fmtDuration = (min: number) => {
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)}h ${rest}m` : `${Math.floor(m / 60)}h`;
};

export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const body = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h ? `${h}:${body}` : body;
};
