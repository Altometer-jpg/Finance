/**
 * FinScope Interactive SVG Charts (`src/finscope/charts.ts`)
 *
 * Crisp, responsive, zero-CDN SVG charts with crosshair scrubbing,
 * floating tooltips, animated path entry, donut allocation interaction,
 * and monthly ledger cashflow bar visualization.
 */

import {
  formatPct,
  formatUsd,
  type AssetCategory,
  type PortfolioAllocationSlice,
  type PricePoint,
} from './market-data.js';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface LineChartOptions {
  primaryLabel: string;
  series: readonly PricePoint[];
  comparisonLabel?: string;
  comparisonSeries?: readonly PricePoint[];
  /** When true, plots % change from start of period so two different-priced assets compare cleanly */
  normalizedPct?: boolean;
  height?: number;
  accentColor?: string;
  comparisonColor?: string;
  onHoverPoint?: (pt: PricePoint | null, compPt: PricePoint | null) => void;
}

export function renderPerformanceLineChart(
  container: HTMLElement,
  options: LineChartOptions
): void {
  const {
    primaryLabel,
    series,
    comparisonLabel,
    comparisonSeries,
    normalizedPct = false,
    height = 290,
    comparisonColor = '#64748B',
  } = options;

  if (!series || series.length < 2) {
    container.innerHTML = `<div class="fs-empty-chart">Insufficient data for chart</div>`;
    return;
  }

  const width = 760;
  const padL = 62;
  const padR = 18;
  const padT = 18;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const firstPrimary = series[0]!.price || 1;
  const firstComp = comparisonSeries?.[0]?.price || 1;

  const primaryVals = series.map((p) =>
    normalizedPct ? ((p.price - firstPrimary) / firstPrimary) * 100 : p.price
  );
  const compVals =
    comparisonSeries && comparisonSeries.length === series.length
      ? comparisonSeries.map((p) =>
          normalizedPct ? ((p.price - firstComp) / firstComp) * 100 : p.price
        )
      : null;

  const allVals = compVals ? [...primaryVals, ...compVals] : [...primaryVals];
  let minVal = Math.min(...allVals);
  let maxVal = Math.max(...allVals);
  if (Math.abs(maxVal - minVal) < 1e-6) {
    minVal -= 1;
    maxVal += 1;
  }
  const range = maxVal - minVal;
  const yMin = minVal - range * 0.1;
  const yMax = maxVal + range * 0.12;
  const ySpan = yMax - yMin || 1;

  const isPositive = primaryVals[primaryVals.length - 1]! >= primaryVals[0]!;
  const strokeColor = options.accentColor ?? (isPositive ? '#10B981' : '#EF4444');
  const gradId = `fs-grad-${Math.random().toString(36).slice(2, 9)}`;

  const toX = (i: number): number => padL + (i / (series.length - 1)) * plotW;
  const toY = (v: number): number => padT + (1 - (v - yMin) / ySpan) * plotH;

  const primaryCoords = primaryVals.map((v, i) => ({ x: toX(i), y: toY(v), v }));
  const linePath = primaryCoords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${primaryCoords[primaryCoords.length - 1]!.x.toFixed(1)},${(padT + plotH).toFixed(1)} L${primaryCoords[0]!.x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const compCoords = compVals
    ? compVals.map((v, i) => ({ x: toX(i), y: toY(v), v }))
    : null;
  const compPath = compCoords
    ? compCoords
        .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
        .join(' ')
    : '';

  // Y axis ticks (4 ticks)
  const yTicks = [0, 0.33, 0.66, 1].map((t) => {
    const val = yMin + (1 - t) * ySpan;
    const y = padT + t * plotH;
    const label = normalizedPct
      ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
      : val >= 10000
        ? `$${Math.round(val / 1000).toLocaleString()}k`
        : val >= 100
          ? `$${Math.round(val).toLocaleString()}`
          : `$${val.toFixed(2)}`;
    return { y, label };
  });

  // X axis ticks (5 evenly spaced)
  const xTickIndices = [0, 0.25, 0.5, 0.75, 1].map((f) =>
    Math.min(series.length - 1, Math.round(f * (series.length - 1)))
  );

  const lastCoord = primaryCoords[primaryCoords.length - 1]!;

  container.innerHTML = `
    <div class="fs-chart-wrap" style="position:relative;width:100%;">
      <svg class="fs-line-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block;overflow:visible;">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.22" />
            <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        ${yTicks
          .map(
            (tk) => `
          <line x1="${padL}" y1="${tk.y.toFixed(1)}" x2="${width - padR}" y2="${tk.y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text x="${padL - 10}" y="${(tk.y + 4).toFixed(1)}" text-anchor="end" fill="#64748B" font-family="'JetBrains Mono', monospace" font-size="11">${escapeHtml(tk.label)}</text>
        `
          )
          .join('')}
        ${xTickIndices
          .map((idx) => {
            const x = toX(idx);
            const anchor = idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle';
            return `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="${anchor}" fill="#64748B" font-family="'JetBrains Mono', monospace" font-size="11">${escapeHtml(series[idx]!.label)}</text>`;
          })
          .join('')}
        ${
          normalizedPct && yMin < 0 && yMax > 0
            ? `<line x1="${padL}" y1="${toY(0).toFixed(1)}" x2="${width - padR}" y2="${toY(0).toFixed(1)}" stroke="rgba(255,255,255,0.14)" stroke-dasharray="4 4" stroke-width="1" />`
            : ''
        }
        ${!compPath ? `<path d="${areaPath}" fill="url(#${gradId})" />` : ''}
        ${
          compPath
            ? `<path d="${compPath}" fill="none" stroke="${comparisonColor}" stroke-width="1.75" stroke-dasharray="5 4" stroke-linecap="round" stroke-linejoin="round" />`
            : ''
        }
        <path class="fs-animated-line" d="${linePath}" fill="none" stroke="${strokeColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="${lastCoord.x.toFixed(1)}" cy="${lastCoord.y.toFixed(1)}" r="3.5" fill="${strokeColor}" />
        <g class="fs-crosshair" style="display:none;pointer-events:none;">
          <line class="fs-ch-line" x1="0" y1="${padT}" x2="0" y2="${padT + plotH}" stroke="rgba(226,232,240,0.28)" stroke-width="1" stroke-dasharray="3 3" />
          <circle class="fs-ch-dot" cx="0" cy="0" r="5" fill="${strokeColor}" stroke="#0B0E11" stroke-width="2" />
          ${
            compCoords
              ? `<circle class="fs-ch-dot-comp" cx="0" cy="0" r="4" fill="${comparisonColor}" stroke="#0B0E11" stroke-width="1.5" />`
              : ''
          }
        </g>
        <rect class="fs-chart-hitbox" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;" />
      </svg>
      <div class="fs-chart-tooltip" style="display:none;position:absolute;top:10px;left:0;pointer-events:none;z-index:10;"></div>
    </div>
  `;

  const svg = container.querySelector<SVGSVGElement>('.fs-line-svg');
  const hitbox = container.querySelector<SVGRectElement>('.fs-chart-hitbox');
  const crosshair = container.querySelector<SVGGElement>('.fs-crosshair');
  const chLine = container.querySelector<SVGLineElement>('.fs-ch-line');
  const chDot = container.querySelector<SVGCircleElement>('.fs-ch-dot');
  const chDotComp = container.querySelector<SVGCircleElement>('.fs-ch-dot-comp');
  const tooltip = container.querySelector<HTMLElement>('.fs-chart-tooltip');

  if (!svg || !hitbox || !crosshair || !chLine || !chDot || !tooltip) return;

  const updateAtClientX = (clientX: number): void => {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((clientX - rect.left) / rect.width) * width;
    const rel = Math.max(0, Math.min(1, (svgX - padL) / plotW));
    const idx = Math.round(rel * (series.length - 1));
    const pt = series[idx]!;
    const coord = primaryCoords[idx]!;
    const compPt = comparisonSeries?.[idx] ?? null;
    const compCoord = compCoords?.[idx] ?? null;

    crosshair.style.display = '';
    chLine.setAttribute('x1', coord.x.toFixed(1));
    chLine.setAttribute('x2', coord.x.toFixed(1));
    chDot.setAttribute('cx', coord.x.toFixed(1));
    chDot.setAttribute('cy', coord.y.toFixed(1));
    if (chDotComp && compCoord) {
      chDotComp.setAttribute('cx', compCoord.x.toFixed(1));
      chDotComp.setAttribute('cy', compCoord.y.toFixed(1));
    }

    const primaryStr = normalizedPct
      ? formatPct(coord.v)
      : formatUsd(pt.price, false, pt.price >= 100 ? 2 : 2);
    const compStr =
      compPt && compCoord
        ? normalizedPct
          ? formatPct(compCoord.v)
          : formatUsd(compPt.price, false, 2)
        : '';

    tooltip.style.display = 'block';
    tooltip.innerHTML = `
      <div class="fs-tooltip-date">${escapeHtml(pt.label)}</div>
      <div class="fs-tooltip-row">
        <span class="fs-tooltip-name" style="color:${strokeColor}">${escapeHtml(primaryLabel)}</span>
        <span class="fs-tooltip-val tabular-nums">${escapeHtml(primaryStr)}</span>
      </div>
      ${
        compPt && comparisonLabel
          ? `<div class="fs-tooltip-row">
               <span class="fs-tooltip-name" style="color:#94A3B8">${escapeHtml(comparisonLabel)}</span>
               <span class="fs-tooltip-val tabular-nums">${escapeHtml(compStr)}</span>
             </div>`
          : ''
      }
    `;

    const pxX = (coord.x / width) * rect.width;
    const tipWidth = tooltip.offsetWidth || 168;
    const clampedLeft = Math.max(8, Math.min(rect.width - tipWidth - 8, pxX > rect.width * 0.65 ? pxX - tipWidth - 14 : pxX + 14));
    tooltip.style.left = `${clampedLeft.toFixed(0)}px`;
    tooltip.style.top = `${Math.max(8, Math.min(rect.height - 70, (coord.y / height) * rect.height - 22)).toFixed(0)}px`;

    options.onHoverPoint?.(pt, compPt);
  };

  hitbox.addEventListener('pointermove', (e) => updateAtClientX(e.clientX));
  hitbox.addEventListener('pointerdown', (e) => updateAtClientX(e.clientX));
  hitbox.addEventListener('pointerleave', () => {
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
    options.onHoverPoint?.(null, null);
  });
}

export interface DonutChartOptions {
  slices: readonly PortfolioAllocationSlice[];
  totalValue: number;
  onSelectCategory?: (category: AssetCategory) => void;
}

export function renderAllocationDonutChart(
  container: HTMLElement,
  options: DonutChartOptions
): void {
  const activeSlices = options.slices.filter((s) => s.valueUsd > 0);
  if (activeSlices.length === 0 || options.totalValue <= 0) {
    container.innerHTML = `<div class="fs-empty-chart">No active holdings in portfolio. Add positions in Asset Explorer.</div>`;
    return;
  }

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 74;
  const circumference = 2 * Math.PI * radius;

  let cumulativeOffset = 0;
  const arcsHtml = activeSlices
    .map((slice) => {
      const fraction = slice.valueUsd / options.totalValue;
      const segLen = Math.max(2, fraction * circumference - 2.5);
      const dashArray = `${segLen.toFixed(2)} ${circumference.toFixed(2)}`;
      const dashOffset = (-cumulativeOffset).toFixed(2);
      cumulativeOffset += fraction * circumference;
      return `
        <circle
          class="fs-donut-arc"
          data-category="${slice.category}"
          cx="${cx}"
          cy="${cy}"
          r="${radius}"
          fill="none"
          stroke="${slice.color}"
          stroke-width="20"
          stroke-dasharray="${dashArray}"
          stroke-dashoffset="${dashOffset}"
          transform="rotate(-90 ${cx} ${cy})"
          style="cursor:pointer;transition:opacity 0.16s ease, stroke-width 0.16s ease;"
        />
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="fs-donut-layout">
      <div class="fs-donut-ring-wrap">
        <svg viewBox="0 0 ${size} ${size}" width="196" height="196" aria-label="Asset Allocation">
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#1A2029" stroke-width="20" />
          ${arcsHtml}
        </svg>
        <div class="fs-donut-center">
          <span class="fs-donut-center-label" id="fs-donut-label">Total Equity</span>
          <strong class="fs-donut-center-val tabular-nums" id="fs-donut-val">${escapeHtml(formatUsd(options.totalValue, false, 0))}</strong>
          <span class="fs-donut-center-sub tabular-nums" id="fs-donut-sub">100.0%</span>
        </div>
      </div>
      <div class="fs-donut-legend">
        ${options.slices
          .map(
            (s) => `
          <button type="button" class="fs-legend-row" data-category="${s.category}">
            <span class="fs-legend-left">
              <span class="fs-legend-swatch" style="background:${s.color}"></span>
              <span class="fs-legend-name">${escapeHtml(s.label)}</span>
            </span>
            <span class="fs-legend-right tabular-nums">
              <span class="fs-legend-pct">${s.weightPct.toFixed(1)}%</span>
              <span class="fs-legend-usd">${escapeHtml(formatUsd(s.valueUsd, false, 0))}</span>
            </span>
          </button>
        `
          )
          .join('')}
      </div>
    </div>
  `;

  const centerLabel = container.querySelector<HTMLElement>('#fs-donut-label');
  const centerVal = container.querySelector<HTMLElement>('#fs-donut-val');
  const centerSub = container.querySelector<HTMLElement>('#fs-donut-sub');
  const arcs = Array.from(container.querySelectorAll<SVGCircleElement>('.fs-donut-arc'));
  const legendRows = Array.from(container.querySelectorAll<HTMLButtonElement>('.fs-legend-row'));

  const highlightCategory = (cat: AssetCategory | null): void => {
    if (!cat) {
      arcs.forEach((a) => {
        a.style.opacity = '1';
        a.setAttribute('stroke-width', '20');
      });
      legendRows.forEach((r) => r.classList.remove('is-active'));
      if (centerLabel) centerLabel.textContent = 'Total Portfolio';
      if (centerVal) centerVal.textContent = formatUsd(options.totalValue, false, 0);
      if (centerSub) centerSub.textContent = '100.0%';
      return;
    }

    const slice = options.slices.find((s) => s.category === cat);
    arcs.forEach((a) => {
      const match = a.dataset.category === cat;
      a.style.opacity = match ? '1' : '0.35';
      a.setAttribute('stroke-width', match ? '24' : '19');
    });
    legendRows.forEach((r) => {
      r.classList.toggle('is-active', r.dataset.category === cat);
    });
    if (slice) {
      if (centerLabel) centerLabel.textContent = slice.label;
      if (centerVal) centerVal.textContent = formatUsd(slice.valueUsd, false, 0);
      if (centerSub) centerSub.textContent = `${slice.weightPct.toFixed(1)}% · ${slice.assetCount} asset${slice.assetCount === 1 ? '' : 's'}`;
    }
  };

  arcs.forEach((arc) => {
    const cat = arc.dataset.category as AssetCategory;
    arc.addEventListener('pointerenter', () => highlightCategory(cat));
    arc.addEventListener('pointerleave', () => highlightCategory(null));
    arc.addEventListener('click', () => options.onSelectCategory?.(cat));
  });

  legendRows.forEach((row) => {
    const cat = row.dataset.category as AssetCategory;
    row.addEventListener('pointerenter', () => highlightCategory(cat));
    row.addEventListener('pointerleave', () => highlightCategory(null));
    row.addEventListener('click', () => options.onSelectCategory?.(cat));
  });
}

export function renderSparklineSvg(
  points: readonly PricePoint[],
  isPositive: boolean,
  width = 88,
  height = 28
): string {
  if (!points || points.length < 2) return '';
  const vals = points.map((p) => p.price);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const color = isPositive ? '#10B981' : '#EF4444';
  const d = vals
    .map((v, idx) => {
      const x = (idx / (vals.length - 1)) * width;
      const y = 3 + (1 - (v - min) / span) * (height - 6);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" style="display:block;overflow:visible;"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

export interface MonthlyCashflowBar {
  monthLabel: string;
  inflowUsd: number;
  outflowUsd: number;
}

export function renderMonthlyCashflowChart(
  container: HTMLElement,
  months: readonly MonthlyCashflowBar[],
  currencySymbol = '$'
): void {
  if (months.length === 0) {
    container.innerHTML = `<div class="fs-empty-chart">No monthly cashflow records available.</div>`;
    return;
  }

  const width = 760;
  const height = 240;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(
    100,
    ...months.flatMap((m) => [m.inflowUsd, m.outflowUsd])
  );
  const yMax = maxVal * 1.15;

  const groupW = plotW / months.length;
  const barW = Math.max(6, Math.min(18, groupW * 0.3));

  const yTicks = [0, 0.5, 1].map((t) => {
    const val = (1 - t) * yMax;
    const y = padT + t * plotH;
    const label =
      val >= 1000 ? `${currencySymbol}${Math.round(val / 1000)}k` : `${currencySymbol}${Math.round(val)}`;
    return { y, label };
  });

  container.innerHTML = `
    <div style="position:relative;width:100%;">
      <svg class="fs-cashflow-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block;">
        ${yTicks
          .map(
            (tk) => `
          <line x1="${padL}" y1="${tk.y.toFixed(1)}" x2="${width - padR}" y2="${tk.y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
          <text x="${padL - 8}" y="${(tk.y + 4).toFixed(1)}" text-anchor="end" fill="#64748B" font-family="'JetBrains Mono', monospace" font-size="10">${escapeHtml(tk.label)}</text>
        `
          )
          .join('')}
        ${months
          .map((m, idx) => {
            const cx = padL + idx * groupW + groupW / 2;
            const inH = (m.inflowUsd / yMax) * plotH;
            const outH = (m.outflowUsd / yMax) * plotH;
            const inY = padT + plotH - inH;
            const outY = padT + plotH - outH;
            return `
              <g class="fs-cf-group" data-idx="${idx}" style="cursor:pointer;">
                <rect x="${(cx - barW - 1.5).toFixed(1)}" y="${inY.toFixed(1)}" width="${barW}" height="${Math.max(1, inH).toFixed(1)}" rx="2" fill="#10B981" opacity="0.88" />
                <rect x="${(cx + 1.5).toFixed(1)}" y="${outY.toFixed(1)}" width="${barW}" height="${Math.max(1, outH).toFixed(1)}" rx="2" fill="#EF4444" opacity="0.8" />
                <text x="${cx.toFixed(1)}" y="${height - 8}" text-anchor="middle" fill="#64748B" font-family="'JetBrains Mono', monospace" font-size="10">${escapeHtml(m.monthLabel)}</text>
              </g>
            `;
          })
          .join('')}
      </svg>
      <div class="fs-chart-tooltip" id="fs-cf-tooltip" style="display:none;position:absolute;top:8px;left:0;pointer-events:none;z-index:10;"></div>
    </div>
  `;

  const svg = container.querySelector<SVGSVGElement>('.fs-cashflow-svg');
  const tip = container.querySelector<HTMLElement>('#fs-cf-tooltip');
  if (!svg || !tip) return;

  container.querySelectorAll<SVGGElement>('.fs-cf-group').forEach((grp) => {
    const idx = Number(grp.dataset.idx);
    const m = months[idx];
    if (!m) return;
    grp.addEventListener('pointerenter', () => {
      const net = m.inflowUsd - m.outflowUsd;
      tip.style.display = 'block';
      tip.innerHTML = `
        <div class="fs-tooltip-date">${escapeHtml(m.monthLabel)}</div>
        <div class="fs-tooltip-row"><span style="color:#10B981">Inflows</span><span class="tabular-nums">${escapeHtml(currencySymbol)}${Math.round(m.inflowUsd).toLocaleString('en-US')}</span></div>
        <div class="fs-tooltip-row"><span style="color:#EF4444">Outflows</span><span class="tabular-nums">${escapeHtml(currencySymbol)}${Math.round(m.outflowUsd).toLocaleString('en-US')}</span></div>
        <div class="fs-tooltip-row"><span style="color:#94A3B8">Net</span><span class="tabular-nums">${net >= 0 ? '+' : '-'}${escapeHtml(currencySymbol)}${Math.abs(Math.round(net)).toLocaleString('en-US')}</span></div>
      `;
      const rect = svg.getBoundingClientRect();
      const px = ((idx + 0.5) / months.length) * rect.width;
      const tipW = tip.offsetWidth || 156;
      tip.style.left = `${Math.max(8, Math.min(rect.width - tipW - 8, px - tipW / 2)).toFixed(0)}px`;
    });
    grp.addEventListener('pointerleave', () => {
      tip.style.display = 'none';
    });
  });
}
