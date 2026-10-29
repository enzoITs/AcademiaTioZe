'use client';
import { useState } from 'react';

// Gráfico de linhas por mês de jogo: um ou dois jogadores, um eixo só.
const W = 330;
const H = 190;
const PAD = { l: 64, r: 46, t: 12, b: 26 };

/** Passo redondo do eixo (1, 2, 2,5, 5… × 10ⁿ), nunca menor que 1. */
function niceStep(raw) {
  if (raw <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= raw - 1e-9);
}

/**
 * series: [{ name, color, dashed?, points: [{ month, label, value }] }]
 * format: número → texto
 */
export default function CompareChart({ title, series, format }) {
  const [hover, setHover] = useState(null);
  const months = [...new Set(series.flatMap((s) => s.points.map((p) => p.month)))].sort((a, b) => a - b);
  if (!months.length) {
    return (
      <figure className="chart">
        <figcaption className="chart-title">{title}</figcaption>
        <p className="small subtle chart-empty">Ainda sem mês fechado para mostrar.</p>
      </figure>
    );
  }
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const vmin = Math.min(0, ...values);
  const vmax = Math.max(1, ...values);
  const tickStep = niceStep((vmax - vmin) / 4);
  const lo = Math.floor(vmin / tickStep) * tickStep;
  const hi = Math.max(lo + tickStep, Math.ceil(vmax / tickStep) * tickStep);
  const x = (m) => (months.length === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((m - months[0]) / (months[months.length - 1] - months[0])) * (W - PAD.l - PAD.r));
  const y = (v) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = Array.from({ length: Math.round((hi - lo) / tickStep) + 1 }, (_, i) => lo + i * tickStep);
  const step = months.length > 1 ? (W - PAD.l - PAD.r) / (months.length - 1) : W - PAD.l - PAD.r;
  const labelEvery = Math.ceil(months.length / 5);
  const last = months.length - 1;
  // Rótulos do eixo dos meses espaçados, sem encostar no último.
  const showMonth = (i) => i === last || (i % labelEvery === 0 && last - i >= labelEvery);
  const hoverMonth = hover == null ? null : months[hover];

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      {series.length > 1 ? (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.name}><span className={`legend-swatch ${s.dashed ? 'dashed' : ''}`} style={{ '--c': s.color }} />{s.name}</li>
          ))}
        </ul>
      ) : null}
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="chart-axis">{format(t, true)}</text>
            </g>
          ))}
          {months.map((m, i) => (showMonth(i) ? (
            <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="chart-axis">Mês {m + 1}</text>
          ) : null))}
          {hoverMonth != null ? <line x1={x(hoverMonth)} x2={x(hoverMonth)} y1={PAD.t} y2={H - PAD.b} className="chart-cross" /> : null}
          {series.map((s) => {
            const pts = s.points.slice().sort((a, b) => a.month - b.month);
            const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
            const last = pts[pts.length - 1];
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p) => (
                  <circle key={p.month} cx={x(p.month)} cy={y(p.value)} r={p.month === hoverMonth ? 5 : 4} fill={s.color} stroke="var(--paper)" strokeWidth="2" />
                ))}
                {last ? <text x={x(last.month) + 8} y={y(last.value) + 4} className="chart-direct">{s.name}</text> : null}
              </g>
            );
          })}
          {months.map((m, i) => (
            <rect key={m} x={x(m) - step / 2} y={PAD.t} width={step} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hoverMonth != null ? (
          <div className="chart-tip" style={{ left: `${(x(hoverMonth) / W) * 100}%` }}>
            <strong>Mês {hoverMonth + 1}</strong>
            {series.map((s) => {
              const p = s.points.find((q) => q.month === hoverMonth);
              return (
                <span key={s.name}><i className="legend-swatch" style={{ '--c': s.color }} />{s.name}: {p ? format(p.value) : '—'}</span>
              );
            })}
          </div>
        ) : null}
      </div>
      <details className="chart-table">
        <summary>Ver em tabela</summary>
        <table>
          <thead><tr><th>Mês</th>{series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m}>
                <td>Mês {m + 1}</td>
                {series.map((s) => {
                  const p = s.points.find((q) => q.month === m);
                  return <td key={s.name}>{p ? format(p.value) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
