import { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n';

export interface DayPoint { day: string; orders: number; gmvBaisa: number }

/**
 * By-day chart: GMV bars with an orders line, simple SVG (no chart library). Includes a data table for screen
 * readers. Fills missing days in [from, to] with zeros so gaps are visible.
 */
export function DailyChart({ data, from, to, height = 260 }: { data: DayPoint[]; from: string; to: string; height?: number }) {
  const { t, money, num, lang } = useI18n();
  const titleId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const map = new Map(data.map((d) => [d.day, d]));
    const out: DayPoint[] = [];
    const start = new Date(`${from}T00:00:00Z`).getTime();
    const end = new Date(`${to}T00:00:00Z`).getTime();
    for (let x = start; x <= end && out.length < 400; x += 86400_000) {
      const day = new Date(x).toISOString().slice(0, 10);
      out.push(map.get(day) ?? { day, orders: 0, gmvBaisa: 0 });
    }
    return out;
  }, [data, from, to]);
  const gid = useId().replace(/:/g, '');
  const W = 900, H = height, padL = 8, padR = 8, padT = 16, padB = 28;
  const maxG = Math.max(1, ...days.map((d) => d.gmvBaisa));
  const maxO = Math.max(1, ...days.map((d) => d.orders));
  const n = Math.max(1, days.length);
  const bw = (W - padL - padR) / n;
  const base = H - padB;
  const y = (v: number, max: number, scale = 1) => padT + (base - padT) * (1 - (v / max) * scale);
  const rtl = lang === 'ar';
  const xAt = (i: number) => (rtl ? W - padR - (i + 1) * bw : padL + i * bw);
  const pts = days.map((d, i) => [xAt(i) + bw / 2, y(d.gmvBaisa, maxG)] as const);
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z` : '';
  const labelEvery = Math.ceil(n / 8);
  const fmtDay = (d: string) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-OM-u-nu-arab' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
  const h = hover != null ? days[hover] : null;
  return (
    <figure className="chart" aria-labelledby={titleId}>
      <figcaption id={titleId} className="chart__legend">
        <span><i className="chart__swatch chart__swatch--bar" /> {t('chart.gmv')}</span>
        <span><i className="chart__swatch chart__swatch--line" /> {t('chart.orders')}</span>
        {h ? <span className="chart__hover">{fmtDay(h.day)} · {money(h.gmvBaisa)} · {t('chart.ordersN', { n: num(h.orders, 0) })}</span> : null}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label={t('chart.aria')} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0E7C66" stopOpacity="0.28" />
            <stop offset="1" stopColor="#0E7C66" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={padL} x2={W - padR} y1={y(maxG * f, maxG)} y2={y(maxG * f, maxG)} className="chart__grid" />)}
        {/* orders: saffron bars on the lower third */}
        {days.map((d, i) => {
          const top = y(d.orders, maxO, 0.34);
          return d.orders ? <rect key={d.day} x={xAt(i) + bw * 0.3} y={top} width={bw * 0.4} height={Math.max(0, base - top)} rx={Math.min(3, bw * 0.15)} className={`chart__bar ${hover === i ? 'chart__bar--on' : ''}`} /> : null;
        })}
        {/* GMV: green area */}
        <path d={area} fill={`url(#area-${gid})`} />
        <path d={line} className="chart__area-line" />
        {hover != null ? <line x1={pts[hover][0]} x2={pts[hover][0]} y1={padT} y2={base} className="chart__cursor" /> : null}
        {hover != null ? <circle cx={pts[hover][0]} cy={pts[hover][1]} r={5} className="chart__dot" /> : null}
        {days.map((d, i) => (
          <g key={d.day} onMouseEnter={() => setHover(i)}>
            <rect x={xAt(i)} y={padT} width={bw} height={base - padT} fill="transparent" />
            {i % labelEvery === 0 ? <text x={xAt(i) + bw / 2} y={H - 8} textAnchor="middle" className="chart__label">{fmtDay(d.day)}</text> : null}
          </g>
        ))}
      </svg>
      <table className="sr-only">
        <caption>{t('chart.aria')}</caption>
        <thead><tr><th>{t('common.date')}</th><th>{t('chart.orders')}</th><th>{t('chart.gmv')}</th></tr></thead>
        <tbody>{days.filter((d) => d.orders || d.gmvBaisa).map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td>{money(d.gmvBaisa)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars for a ranked list (top products / merchants / by type). */
export function RankBars({ rows }: { rows: { label: string; value: number; display: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="rank">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="rank__row">
          <div className="row between row-nowrap"><span className="truncate">{r.label}</span><span className="strong num nowrap">{r.display}</span></div>
          <div className="rank__track" aria-hidden="true"><div className="rank__fill" style={{ inlineSize: `${(r.value / max) * 100}%` }} /></div>
          {r.sub ? <span className="text-xs muted">{r.sub}</span> : null}
        </li>
      ))}
    </ul>
  );
}
