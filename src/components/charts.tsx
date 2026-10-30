import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { compact } from '../lib/calc';
import { addDays, fmtDay, weekday } from '../lib/date';

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return ([1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((step) => n <= step) ?? 10) * mag;
};

const PAD = { top: 14, right: 6, bottom: 22, left: 34 };

const tickEvery = (count: number, width: number) => Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 52))));

const shortDay = (iso: string, range: number) =>
  range <= 7 ? fmtDay(iso, { weekday: 'short' }) : fmtDay(iso, { day: 'numeric', month: 'short' });

export interface Bar {
  date: string;
  /** Stacked values drawn bottom-up; a single-series chart has one. */
  values: number[];
  /** Set for aggregates, e.g. a weekly bar. */
  label?: string;
}

export interface Series {
  name: string;
  color: string;
}

/** Column chart with an optional goal line. One y-axis, thin marks, hairline grid. */
export function BarChart({ bars, series, goal, goalLabel, height = 170, fmt = (v) => compact(v), ariaLabel }: {
  bars: Bar[]; series: Series[]; goal?: number; goalLabel?: string; height?: number; fmt?: (v: number) => string; ariaLabel: string;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const totals = bars.map((b) => b.values.reduce((a, c) => a + c, 0));
  const max = niceMax(Math.max(goal ?? 0, ...totals, 0) * 1.02);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const band = bars.length ? plotW / bars.length : 0;
  const barW = Math.max(2, Math.min(24, band - 2));
  const every = tickEvery(bars.length, plotW);
  const ticks = [0, max / 2, max];

  return (
    <div className="chart" ref={ref} style={{ height }} role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            let acc = 0;
            const lastIdx = b.values.reduce((last, v, k) => (v > 0 ? k : last), -1);
            return (
              <g key={b.date}>
                {b.values.map((v, k) => {
                  if (v <= 0) return null;
                  const y1 = y(acc + v);
                  const h = Math.max(1, y(acc) - y1 - (k < lastIdx ? 2 : 0));
                  const yTop = k < lastIdx ? y1 + 2 : y1;
                  acc += v;
                  const r = k === lastIdx ? Math.min(4, barW / 2, h) : 0;
                  return (
                    <path key={k} fill={series[k]?.color ?? series[0].color} opacity={hover === null || hover === i ? 1 : 0.55}
                      d={`M${x} ${yTop + h}V${yTop + r}${r ? `Q${x} ${yTop} ${x + r} ${yTop}` : ''}H${x + barW - r}${r ? `Q${x + barW} ${yTop} ${x + barW} ${yTop + r}` : ''}V${yTop + h}Z`} />
                  );
                })}
                {i % every === 0 && (
                  <text x={x + barW / 2} y={height - 6} textAnchor="middle">{b.label ?? shortDay(b.date, bars.length)}</text>
                )}
                {/* Hit target spans the whole band, far easier to land on than a thin bar. */}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent"
                  tabIndex={-1} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            );
          })}
          {goal != null && goal > 0 && (
            <>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(goal)} y2={y(goal)} stroke="var(--ink-2)" strokeWidth={1} />
              <text x={width - PAD.right} y={y(goal) - 4} textAnchor="end" style={{ fill: 'var(--ink-2)' }}>{goalLabel ?? `Goal ${fmt(goal)}`}</text>
            </>
          )}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <div className="chart-tip" style={{ left: clampTip(PAD.left + band * hover + band / 2, width), top: Math.max(46, y(totals[hover]) - 4) }}>
          <div>{bars[hover].label ?? fmtDay(bars[hover].date)}</div>
          {series.length > 1
            ? series.map((s, k) => <div key={s.name}>{s.name}: <b>{fmt(bars[hover].values[k] ?? 0)}</b></div>)
            : <b>{fmt(totals[hover])}</b>}
        </div>
      )}
    </div>
  );
}

const clampTip = (x: number, width: number) => Math.max(60, Math.min(width - 60, x));

export interface LinePoint {
  date: string;
  value: number | null;
  trend?: number | null;
}

/** Line for values that move slowly, like body weight. Gaps stay gaps rather than being invented. */
export function LineChart({ points, color, height = 170, fmt = (v) => String(v), ariaLabel, trendLabel, zeroBase }: {
  points: LinePoint[]; color: string; height?: number; fmt?: (v: number) => string; ariaLabel: string; trendLabel?: string; zeroBase?: boolean;
}) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.flatMap((p) => [p.value, p.trend]).filter((v): v is number => v != null);
  if (!vals.length) return <div ref={ref} className="empty small">Nothing logged in this period.</div>;
  let lo = zeroBase ? 0 : Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo = zeroBase ? 0 : lo - 1; }
  const pad = zeroBase ? 0 : (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  const path = (get: (p: LinePoint) => number | null | undefined, connect: boolean) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = get(p);
      if (v == null) { if (!connect) pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i)} ${y(v)}`;
      pen = true;
    });
    return d;
  };
  const every = tickEvery(points.length, plotW);
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const lastIdx = points.reduce((last, p, i) => (p.value != null ? i : last), -1);
  const single = points.filter((p) => p.value != null).length;

  return (
    <div className="chart" ref={ref} style={{ height }} role="img" aria-label={ariaLabel}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - box.left - PAD.left) / (plotW || 1)) * (points.length - 1));
        setHover(Math.max(0, Math.min(points.length - 1, i)));
      }}>
      {width > 0 && (
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{hi - lo < 10 ? t.toFixed(1) : compact(t)}</text>
            </g>
          ))}
          {points.map((p, i) => i % every === 0 && <text key={p.date} x={x(i)} y={height - 6} textAnchor="middle">{shortDay(p.date, points.length)}</text>)}
          {trendLabel && <path d={path((p) => p.trend, true)} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
          <path d={path((p) => p.value, true)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {single <= 14 && points.map((p, i) => p.value != null && <circle key={p.date} cx={x(i)} cy={y(p.value)} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />)}
          {lastIdx >= 0 && <circle cx={x(lastIdx)} cy={y(points[lastIdx].value!)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--axis)" />}
          {hover !== null && points[hover].value != null && <circle cx={x(hover)} cy={y(points[hover].value!)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />}
        </svg>
      )}
      {hover !== null && (
        <div className="chart-tip" style={{ left: clampTip(x(hover), width), top: 40 }}>
          <div>{fmtDay(points[hover].date)}</div>
          <b>{points[hover].value != null ? fmt(points[hover].value!) : 'No entry'}</b>
          {trendLabel && points[hover].trend != null && <div>{trendLabel}: {fmt(points[hover].trend!)}</div>}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((s) => <span key={s.name}><i style={{ '--c': s.color } as CSSProperties} />{s.name}</span>)}
    </div>
  );
}

/** The accessible twin of every chart: the same numbers as a plain table. */
export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="table-toggle">
      <summary>Show as table</summary>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

/** A year (or any range) as a calendar of weeks, coloured by one value from 0 to 100. */
export function Heatmap({ end, days, value, weekStart, label }: { end: string; days: number; value: (date: string) => number | null; weekStart: 0 | 1; label: (date: string, v: number | null) => string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth; }, [days]);
  let start = addDays(end, -(days - 1));
  start = addDays(start, -((weekday(start) - weekStart + 7) % 7));
  const weeks: string[][] = [];
  for (let d = start; d <= end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const level = (v: number | null) => {
    if (v == null || v <= 0) return 'var(--heat-0)';
    if (v < 40) return 'var(--heat-1)';
    if (v < 65) return 'var(--heat-2)';
    if (v < 85) return 'var(--heat-3)';
    return 'var(--heat-4)';
  };
  return (
    <div className="heatmap" ref={scrollRef}>
      {weeks.map((w) => (
        <div className="wk" key={w[0]}>
          {w.map((d) => {
            if (d > end) return <span key={d} className="cell blank" />;
            const v = value(d);
            return <span key={d} className="cell" title={label(d, v)} style={{ background: level(v) }} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function HeatLegend({ children }: { children?: ReactNode }) {
  return (
    <div className="row between small faint">
      <span>{children}</span>
      <span className="row" style={{ gap: 3 }}>
        Less
        {['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4'].map((c) => <i key={c} style={{ width: 11, height: 11, borderRadius: 3, background: `var(${c})` }} />)}
        More
      </span>
    </div>
  );
}
