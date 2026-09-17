import { esc } from '../format.js';

// Minimal, dependency-free replacements for the recharts bar/line charts
// used on a couple of dashboards. Not a general charting library -- just
// enough to render this app's small aggregate datasets. The SVG viewBox is
// a fixed 600 units wide with preserveAspectRatio="none" and the element
// styled to 100% width / fixed height, so it stretches horizontally to
// fill its container the way recharts' ResponsiveContainer did, without
// distorting vertical scale.

const GRID_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function gridLines(padding, innerW, innerH, width) {
  return GRID_FRACTIONS.map((f) => {
    const y = padding.top + innerH * (1 - f);
    return `<line x1="${padding.left}" x2="${width - padding.right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#f1f5f9" stroke-width="1" />`;
  }).join('');
}

function legendHtml(series) {
  if (series.length < 2) return '';
  return `<div class="flex items-center gap-4 text-xs text-slate-500 mb-2">${series
    .map((s) => `<span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-sm" style="background:${s.color}"></span>${esc(s.label)}</span>`)
    .join('')}</div>`;
}

export function barChart(data, { xKey, series, height = 240, formatValue }) {
  const width = 600;
  const padding = { top: 10, right: 10, bottom: 40, left: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const n = Math.max(data.length, 1);
  const groupWidth = innerW / n;
  const maxVal = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const barGap = 4;
  const barWidth = Math.max(3, (groupWidth - barGap * (series.length + 1)) / series.length);

  const bars = data
    .map((d, i) =>
      series
        .map((s, si) => {
          const val = d[s.key] || 0;
          const h = maxVal > 0 ? (val / maxVal) * innerH : 0;
          const x = padding.left + i * groupWidth + barGap + si * (barWidth + barGap);
          const y = padding.top + innerH - h;
          const label = formatValue ? formatValue(val) : val;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${s.color}"><title>${esc(d[xKey])}: ${esc(String(label))}</title></rect>`;
        })
        .join('')
    )
    .join('');

  const xLabels = data
    .map((d, i) => {
      const x = padding.left + i * groupWidth + groupWidth / 2;
      return `<text x="${x.toFixed(1)}" y="${height - 8}" font-size="9" fill="#94a3b8" text-anchor="middle">${esc(String(d[xKey]).slice(0, 10))}</text>`;
    })
    .join('');

  return `${legendHtml(series)}<svg viewBox="0 0 ${width} ${height}" class="w-full" style="height:${height}px" preserveAspectRatio="none">${gridLines(
    padding,
    innerW,
    innerH,
    width
  )}${bars}${xLabels}</svg>`;
}

export function lineChart(data, { xKey, series, height = 240 }) {
  const width = 600;
  const padding = { top: 10, right: 10, bottom: 30, left: 10 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const n = data.length;
  const maxVal = Math.max(1, ...data.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  function pointsFor(key) {
    return data
      .map((d, i) => {
        const x = padding.left + i * stepX;
        const val = d[key] || 0;
        const y = padding.top + innerH - (maxVal > 0 ? (val / maxVal) * innerH : 0);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }

  const lines = series.map((s) => `<polyline points="${pointsFor(s.key)}" fill="none" stroke="${s.color}" stroke-width="2" />`).join('');

  const xLabels = data
    .map((d, i) => {
      const x = padding.left + i * stepX;
      return `<text x="${x.toFixed(1)}" y="${height - 8}" font-size="9" fill="#94a3b8" text-anchor="middle">${esc(String(d[xKey]).slice(0, 10))}</text>`;
    })
    .join('');

  return `${legendHtml(series)}<svg viewBox="0 0 ${width} ${height}" class="w-full" style="height:${height}px" preserveAspectRatio="none">${gridLines(
    padding,
    innerW,
    innerH,
    width
  )}${lines}${xLabels}</svg>`;
}
