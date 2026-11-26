/**
 * FinScope Overview Dashboard (`src/finscope/views/overview-view.ts`)
 */

import type { DatasetBundle } from '../../../contracts/index.js';
import {
  renderAllocationDonutChart,
  renderPerformanceLineChart,
  renderSparklineSvg,
} from '../charts.js';
import {
  ASSET_CATEGORY_META,
  TIME_PERIODS,
  computePortfolioSummary,
  formatPct,
  formatUsd,
  getAssetPeriodReturnPct,
  type AssetCategory,
  type MarketAsset,
  type TimePeriod,
} from '../market-data.js';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OverviewViewProps {
  assets: readonly MarketAsset[];
  holdingsMap: Record<string, number>;
  watchlist: readonly string[];
  period: TimePeriod;
  compareBenchmark: boolean;
  simRunning: boolean;
  bundle: DatasetBundle;
  onSelectPeriod: (period: TimePeriod) => void;
  onToggleBenchmark: () => void;
  onToggleSim: () => void;
  onResetPortfolio: () => void;
  onSelectAsset: (symbol: string) => void;
  onSelectCategory: (category: AssetCategory) => void;
  onToggleWatchlist: (symbol: string) => void;
  onNavigateTab: (tab: 'overview' | 'explorer' | 'ledger' | 'ask' | 'story') => void;
  onOpenImport: () => void;
}

export function renderOverviewView(container: HTMLElement, props: OverviewViewProps): void {
  const summary = computePortfolioSummary(props.assets, props.holdingsMap, props.period);

  // Compute active ledger net cashflow cleanly from transactions
  let ledgerInflowMinor = 0;
  let ledgerOutflowMinor = 0;
  for (const t of props.bundle.transactions) {
    if (t.is_transfer) continue;
    if (t.direction === 'in' && !t.is_refund) ledgerInflowMinor += t.amount_minor;
    if (t.direction === 'out' && !t.is_refund) ledgerOutflowMinor += t.amount_minor;
  }
  const ledgerNetUsd = (ledgerInflowMinor - ledgerOutflowMinor) / 100;
  const ledgerCurrency = props.bundle.plan.business_meta?.currency_symbol ?? '$';
  const ledgerLabel = props.bundle.plan.business_meta
    ? `${props.bundle.plan.business_meta.entity_name} · ${props.bundle.plan.business_meta.fiscal_period_label}`
    : `${props.bundle.plan.person_name} · ${props.bundle.plan.year}`;

  const watchlistAssets = props.watchlist
    .map((sym) => props.assets.find((a) => a.symbol === sym))
    .filter((a): a is MarketAsset => Boolean(a));

  const isPeriodPos = summary.periodChangeUsd >= 0;
  const isTotalPos = summary.totalProfitLoss >= 0;
  const isDayPos = summary.dailyChangeUsd >= 0;

  container.innerHTML = `
    <div class="fs-page" data-testid="finscope-overview">
      <!-- Context & Data Provenance Strip -->
      <div class="fs-context-bar">
        <div class="fs-context-meta">
          <span class="fs-context-strong">Portfolio Intelligence</span>
          <span aria-hidden="true">·</span>
          <span>Simulated Demo Market Feed</span>
          <span aria-hidden="true">·</span>
          <span>Active Ledger: ${escapeHtml(ledgerLabel)} (${props.bundle.transactions.length.toLocaleString('en-US')} lines)</span>
        </div>
        <div class="fs-context-actions">
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-sim-toggle-btn" data-testid="sim-toggle-btn">
            ${props.simRunning ? 'Pause Market Sim' : 'Resume Market Sim'}
          </button>
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-reset-portfolio-btn">
            Reset Demo Holdings
          </button>
        </div>
      </div>

      <!-- 4 KPI Cards -->
      <section class="fs-kpi-grid" aria-label="Portfolio summary metrics">
        <article class="fs-card fs-kpi-card" data-testid="kpi-portfolio-value">
          <div class="fs-kpi-label">Total Portfolio Value</div>
          <div class="fs-kpi-value tabular-nums">${escapeHtml(formatUsd(summary.totalValue, false, 2))}</div>
          <div class="fs-kpi-sub tabular-nums ${isPeriodPos ? 'is-pos' : 'is-neg'}">
            ${escapeHtml(formatUsd(summary.periodChangeUsd, true, 2))} (${escapeHtml(formatPct(summary.periodChangePct))}) · ${props.period}
          </div>
        </article>

        <article class="fs-card fs-kpi-card" data-testid="kpi-total-pl">
          <div class="fs-kpi-label">Total Profit / Loss</div>
          <div class="fs-kpi-value tabular-nums ${isTotalPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatUsd(summary.totalProfitLoss, true, 2))}</div>
          <div class="fs-kpi-sub tabular-nums">
            <span class="${isTotalPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(summary.totalProfitLossPct))}</span>
            <span> · Cost basis ${escapeHtml(formatUsd(summary.totalCostBasis, false, 0))}</span>
          </div>
        </article>

        <article class="fs-card fs-kpi-card" data-testid="kpi-daily-change">
          <div class="fs-kpi-label">Daily Change (24h)</div>
          <div class="fs-kpi-value tabular-nums ${isDayPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(summary.dailyChangePct))}</div>
          <div class="fs-kpi-sub tabular-nums">
            <span class="${isDayPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatUsd(summary.dailyChangeUsd, true, 2))}</span>
            <span> · ${summary.holdings.length} active positions</span>
          </div>
        </article>

        <article class="fs-card fs-kpi-card fs-kpi-interactive" id="fs-kpi-ledger-card" data-testid="kpi-ledger-cashflow" role="button" tabindex="0">
          <div class="fs-kpi-label">Ledger Net Cashflow</div>
          <div class="fs-kpi-value tabular-nums ${ledgerNetUsd >= 0 ? 'is-pos' : 'is-neg'}">
            ${ledgerNetUsd >= 0 ? '+' : '-'}${escapeHtml(ledgerCurrency === 'US$' ? '$' : ledgerCurrency)}${escapeHtml(Math.abs(ledgerNetUsd).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }))}
          </div>
          <div class="fs-kpi-sub">
            ${escapeHtml(ledgerLabel)} · View Ledger →
          </div>
        </article>
      </section>

      <!-- Main Charts Grid: Performance Chart + Asset Allocation Donut -->
      <section class="fs-main-charts-grid">
        <div class="fs-card fs-chart-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Portfolio Performance</h2>
              <div class="fs-card-meta tabular-nums" id="fs-perf-hover-readout">
                ${escapeHtml(formatUsd(summary.totalValue, false, 2))} ·
                <span class="${isPeriodPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(summary.periodChangePct))} (${props.period})</span>
                · Simulated Demo Feed
              </div>
            </div>
            <div class="fs-chart-controls">
              <button type="button" class="fs-btn fs-btn-sm ${props.compareBenchmark ? 'is-active' : ''}" id="fs-benchmark-toggle" data-testid="benchmark-toggle-btn">
                vs S&amp;P 500
              </button>
              <div class="fs-period-bar" role="group" aria-label="Select time period">
                ${TIME_PERIODS.map(
                  (p) =>
                    `<button type="button" class="fs-period-btn ${p === props.period ? 'is-active' : ''}" data-period="${p}" data-testid="overview-period-${p}">${p}</button>`
                ).join('')}
              </div>
            </div>
          </div>
          <div id="fs-overview-line-chart" class="fs-chart-body"></div>
        </div>

        <div class="fs-card fs-allocation-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Asset Allocation</h2>
              <div class="fs-card-meta">Click any sleeve to filter Asset Explorer</div>
            </div>
          </div>
          <div id="fs-overview-donut-chart" class="fs-donut-body"></div>
        </div>
      </section>

      <!-- Bottom Grid: Top/Underperformers & Saved Watchlist -->
      <section class="fs-bottom-grid">
        <div class="fs-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Top Performers &amp; Underperformers</h2>
              <div class="fs-card-meta">Ranked by ${props.period} simulated return · Click any asset to inspect</div>
            </div>
            <button type="button" class="fs-link-btn" id="fs-jump-explorer-btn">Explore all 20 →</button>
          </div>
          <div class="fs-movers-split">
            <div class="fs-movers-col">
              <div class="fs-subhead is-pos">Top Gainers (${props.period})</div>
              <div class="fs-mover-list">
                ${summary.topPerformers
                  .map(
                    (item) => `
                  <button type="button" class="fs-mover-row" data-asset-sym="${item.asset.symbol}" data-testid="top-performer-${item.asset.symbol}">
                    <div class="fs-mover-id">
                      <span class="fs-ticker">${escapeHtml(item.asset.symbol)}</span>
                      <span class="fs-name-muted">${escapeHtml(item.asset.name)}</span>
                    </div>
                    <div class="fs-mover-spark">${renderSparklineSvg(item.asset.seriesByPeriod['1W'], item.returnPct >= 0, 64, 22)}</div>
                    <div class="fs-mover-nums tabular-nums">
                      <span>${escapeHtml(formatUsd(item.asset.price))}</span>
                      <span class="${item.returnPct >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(item.returnPct))}</span>
                    </div>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div class="fs-movers-col">
              <div class="fs-subhead is-neg">Underperformers (${props.period})</div>
              <div class="fs-mover-list">
                ${summary.underperformers
                  .map(
                    (item) => `
                  <button type="button" class="fs-mover-row" data-asset-sym="${item.asset.symbol}" data-testid="underperformer-${item.asset.symbol}">
                    <div class="fs-mover-id">
                      <span class="fs-ticker">${escapeHtml(item.asset.symbol)}</span>
                      <span class="fs-name-muted">${escapeHtml(item.asset.name)}</span>
                    </div>
                    <div class="fs-mover-spark">${renderSparklineSvg(item.asset.seriesByPeriod['1W'], item.returnPct >= 0, 64, 22)}</div>
                    <div class="fs-mover-nums tabular-nums">
                      <span>${escapeHtml(formatUsd(item.asset.price))}</span>
                      <span class="${item.returnPct >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(item.returnPct))}</span>
                    </div>
                  </button>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>

        <div class="fs-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Watchlist</h2>
              <div class="fs-card-meta">${watchlistAssets.length} tracked · Saved locally in browser</div>
            </div>
            <button type="button" class="fs-link-btn" id="fs-watchlist-add-btn">+ Manage Assets</button>
          </div>
          ${
            watchlistAssets.length === 0
              ? `<div class="fs-empty-state">
                  <p>Your watchlist is empty. Star assets in the Asset Explorer to track prices and daily changes here.</p>
                  <button type="button" class="fs-btn fs-btn-primary" id="fs-empty-watchlist-cta">Browse Assets</button>
                 </div>`
              : `<div class="fs-table-scroll">
                  <table class="fs-table fs-table-compact">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th class="is-right">Price</th>
                        <th class="is-right">24h</th>
                        <th class="is-right">7D</th>
                        <th class="is-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${watchlistAssets
                        .map((asset) => {
                          const catMeta = ASSET_CATEGORY_META[asset.category];
                          const isPos = asset.changePct24h >= 0;
                          const periodRet = getAssetPeriodReturnPct(asset, props.period);
                          return `
                            <tr class="fs-table-row-clickable" data-asset-sym="${asset.symbol}" data-testid="watchlist-row-${asset.symbol}">
                              <td>
                                <div class="fs-cell-asset">
                                  <span class="fs-ticker">${escapeHtml(asset.symbol)}</span>
                                  <span class="fs-name-muted">${escapeHtml(asset.name)} · ${escapeHtml(catMeta.label)}</span>
                                </div>
                              </td>
                              <td class="is-right tabular-nums">${escapeHtml(formatUsd(asset.price))}</td>
                              <td class="is-right tabular-nums ${isPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(asset.changePct24h))}</td>
                              <td class="is-right">${renderSparklineSvg(asset.seriesByPeriod['1W'], periodRet >= 0, 58, 20)}</td>
                              <td class="is-right">
                                <button type="button" class="fs-icon-btn" data-remove-watch="${asset.symbol}" title="Remove ${escapeHtml(asset.symbol)} from watchlist" aria-label="Remove ${escapeHtml(asset.symbol)} from watchlist">×</button>
                              </td>
                            </tr>
                          `;
                        })
                        .join('')}
                    </tbody>
                  </table>
                 </div>`
          }
        </div>
      </section>

      <!-- Core Ledger & Story Quick-Access Strip -->
      <section class="fs-card fs-ledger-bridge">
        <div class="fs-bridge-text">
          <h3 class="fs-card-title">Ledger &amp; Executive Story Engine</h3>
          <p class="fs-card-meta">Active dataset: ${escapeHtml(ledgerLabel)} · ${props.bundle.transactions.length.toLocaleString('en-US')} transactions ready for calendar heatmaps, AI querying, or animated story playback.</p>
        </div>
        <div class="fs-bridge-actions">
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-bridge-ledger-btn">Ledger Explorer</button>
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-bridge-ask-btn">Ask AI</button>
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-bridge-story-btn">Launch Story Mode</button>
          <button type="button" class="fs-btn fs-btn-primary" id="fs-bridge-import-btn">Import CSV / Excel / Drive</button>
        </div>
      </section>
    </div>
  `;

  // Render charts
  const lineHost = container.querySelector<HTMLElement>('#fs-overview-line-chart');
  if (lineHost) {
    renderPerformanceLineChart(lineHost, {
      primaryLabel: 'Portfolio',
      series: summary.portfolioSeries,
      comparisonLabel: props.compareBenchmark ? 'S&P 500 (SPY)' : undefined,
      comparisonSeries: props.compareBenchmark ? summary.benchmarkSeries : undefined,
      normalizedPct: props.compareBenchmark,
      height: 276,
    });
  }

  const donutHost = container.querySelector<HTMLElement>('#fs-overview-donut-chart');
  if (donutHost) {
    renderAllocationDonutChart(donutHost, {
      slices: summary.allocations,
      totalValue: summary.totalValue,
      onSelectCategory: (cat) => props.onSelectCategory(cat),
    });
  }

  // Event bindings
  container.querySelectorAll<HTMLButtonElement>('[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.period as TimePeriod;
      props.onSelectPeriod(p);
    });
  });

  container.querySelector('#fs-benchmark-toggle')?.addEventListener('click', () => {
    props.onToggleBenchmark();
  });
  container.querySelector('#fs-sim-toggle-btn')?.addEventListener('click', () => {
    props.onToggleSim();
  });
  container.querySelector('#fs-reset-portfolio-btn')?.addEventListener('click', () => {
    props.onResetPortfolio();
  });
  container.querySelector('#fs-kpi-ledger-card')?.addEventListener('click', () => {
    props.onNavigateTab('ledger');
  });
  container.querySelector('#fs-jump-explorer-btn')?.addEventListener('click', () => {
    props.onNavigateTab('explorer');
  });
  container.querySelector('#fs-watchlist-add-btn')?.addEventListener('click', () => {
    props.onNavigateTab('explorer');
  });
  container.querySelector('#fs-empty-watchlist-cta')?.addEventListener('click', () => {
    props.onNavigateTab('explorer');
  });
  container.querySelector('#fs-bridge-ledger-btn')?.addEventListener('click', () => {
    props.onNavigateTab('ledger');
  });
  container.querySelector('#fs-bridge-ask-btn')?.addEventListener('click', () => {
    props.onNavigateTab('ask');
  });
  container.querySelector('#fs-bridge-story-btn')?.addEventListener('click', () => {
    props.onNavigateTab('story');
  });
  container.querySelector('#fs-bridge-import-btn')?.addEventListener('click', () => {
    props.onOpenImport();
  });

  container.querySelectorAll<HTMLElement>('[data-asset-sym]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-remove-watch]')) return;
      const sym = el.dataset.assetSym;
      if (sym) props.onSelectAsset(sym);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-remove-watch]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = btn.dataset.removeWatch;
      if (sym) props.onToggleWatchlist(sym);
    });
  });
}
