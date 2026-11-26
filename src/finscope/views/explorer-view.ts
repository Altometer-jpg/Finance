/**
 * FinScope Asset Explorer & Comparison Studio (`src/finscope/views/explorer-view.ts`)
 */

import { renderPerformanceLineChart, renderSparklineSvg } from '../charts.js';
import {
  ASSET_CATEGORY_META,
  TIME_PERIODS,
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

export type ExplorerCategoryFilter = 'all' | AssetCategory;
export type ExplorerScopeFilter = 'all' | 'portfolio' | 'watchlist';
export type ExplorerSortKey = 'marketCap' | 'price' | 'change24h' | 'periodReturn';

export interface ExplorerViewProps {
  assets: readonly MarketAsset[];
  holdingsMap: Record<string, number>;
  watchlist: readonly string[];
  selectedSymbol: string;
  compareSymbol: string;
  categoryFilter: ExplorerCategoryFilter;
  scopeFilter: ExplorerScopeFilter;
  sortKey: ExplorerSortKey;
  searchQuery: string;
  period: TimePeriod;
  onSelectCategory: (cat: ExplorerCategoryFilter) => void;
  onSelectScope: (scope: ExplorerScopeFilter) => void;
  onChangeSort: (sort: ExplorerSortKey) => void;
  onChangeSearch: (q: string) => void;
  onSelectAsset: (symbol: string) => void;
  onSelectCompare: (symbol: string) => void;
  onSelectPeriod: (period: TimePeriod) => void;
  onToggleWatchlist: (symbol: string) => void;
  onUpdateHolding: (symbol: string, shares: number) => void;
}

export function renderExplorerView(container: HTMLElement, props: ExplorerViewProps): void {
  const q = props.searchQuery.trim().toLowerCase();
  const watchlistSet = new Set(props.watchlist);

  const filteredAssets = props.assets
    .filter((a) => {
      if (props.categoryFilter !== 'all' && a.category !== props.categoryFilter) return false;
      if (props.scopeFilter === 'portfolio' && (props.holdingsMap[a.symbol] ?? 0) <= 0) return false;
      if (props.scopeFilter === 'watchlist' && !watchlistSet.has(a.symbol)) return false;
      if (q) {
        return (
          a.symbol.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.sector.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (props.sortKey === 'price') return b.price - a.price;
      if (props.sortKey === 'change24h') return b.changePct24h - a.changePct24h;
      if (props.sortKey === 'periodReturn') {
        return getAssetPeriodReturnPct(b, props.period) - getAssetPeriodReturnPct(a, props.period);
      }
      return b.marketCapNumericB - a.marketCapNumericB;
    });

  const selectedAsset =
    props.assets.find((a) => a.symbol === props.selectedSymbol) ??
    filteredAssets[0] ??
    props.assets[0]!;
  const compareAsset =
    props.compareSymbol && props.compareSymbol !== selectedAsset.symbol
      ? props.assets.find((a) => a.symbol === props.compareSymbol) ?? null
      : null;

  const selectedPeriodRet = getAssetPeriodReturnPct(selectedAsset, props.period);
  const comparePeriodRet = compareAsset ? getAssetPeriodReturnPct(compareAsset, props.period) : 0;
  const heldShares = props.holdingsMap[selectedAsset.symbol] ?? 0;
  const heldMarketVal = heldShares * selectedAsset.price;
  const heldCost = heldShares * selectedAsset.avgCost;
  const heldPl = heldMarketVal - heldCost;
  const heldPlPct = heldCost > 0 ? (heldPl / heldCost) * 100 : 0;
  const isWatchlisted = watchlistSet.has(selectedAsset.symbol);

  const categories: Array<{ id: ExplorerCategoryFilter; label: string }> = [
    { id: 'all', label: 'All Assets' },
    { id: 'stocks', label: 'Stocks' },
    { id: 'crypto', label: 'Crypto' },
    { id: 'etfs', label: 'ETFs' },
    { id: 'commodities', label: 'Commodities' },
  ];

  container.innerHTML = `
    <div class="fs-page" data-testid="finscope-explorer">
      <!-- Explorer Controls Header -->
      <div class="fs-explorer-toolbar">
        <div class="fs-seg-tabs" role="tablist" aria-label="Asset categories">
          ${categories
            .map(
              (c) => `
            <button type="button" role="tab" aria-selected="${c.id === props.categoryFilter}" class="fs-seg-tab ${c.id === props.categoryFilter ? 'is-active' : ''}" data-exp-cat="${c.id}" data-testid="explorer-cat-${c.id}">
              ${escapeHtml(c.label)}
            </button>
          `
            )
            .join('')}
        </div>

        <div class="fs-explorer-filters">
          <div class="fs-search-wrap">
            <input
              type="search"
              id="fs-explorer-search"
              data-testid="explorer-search-input"
              class="fs-input"
              placeholder="Search ticker, name, or sector…"
              value="${escapeHtml(props.searchQuery)}"
            />
          </div>
          <div class="fs-seg-tabs">
            <button type="button" class="fs-seg-tab ${props.scopeFilter === 'all' ? 'is-active' : ''}" data-exp-scope="all">All</button>
            <button type="button" class="fs-seg-tab ${props.scopeFilter === 'portfolio' ? 'is-active' : ''}" data-exp-scope="portfolio">In Portfolio</button>
            <button type="button" class="fs-seg-tab ${props.scopeFilter === 'watchlist' ? 'is-active' : ''}" data-exp-scope="watchlist">Watchlist</button>
          </div>
          <select id="fs-explorer-sort" class="fs-select" aria-label="Sort assets">
            <option value="marketCap" ${props.sortKey === 'marketCap' ? 'selected' : ''}>Sort: Market Cap</option>
            <option value="change24h" ${props.sortKey === 'change24h' ? 'selected' : ''}>Sort: 24h %</option>
            <option value="periodReturn" ${props.sortKey === 'periodReturn' ? 'selected' : ''}>Sort: ${props.period} Return</option>
            <option value="price" ${props.sortKey === 'price' ? 'selected' : ''}>Sort: Price</option>
          </select>
        </div>
      </div>

      <!-- Master-Detail Layout -->
      <div class="fs-explorer-split">
        <!-- Left: Searchable Asset Table -->
        <div class="fs-card fs-explorer-table-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Market Universe</h2>
              <div class="fs-card-meta">${filteredAssets.length} instrument${filteredAssets.length === 1 ? '' : 's'} · Simulated Demo Feed</div>
            </div>
          </div>
          ${
            filteredAssets.length === 0
              ? `<div class="fs-empty-state">
                  <p>No assets match "${escapeHtml(props.searchQuery)}" in this filter.</p>
                  <button type="button" class="fs-btn fs-btn-ghost" id="fs-clear-explorer-filters">Reset Filters</button>
                 </div>`
              : `<div class="fs-table-scroll">
                  <table class="fs-table" data-testid="explorer-assets-table">
                    <thead>
                      <tr>
                        <th style="width:36px"></th>
                        <th>Instrument</th>
                        <th class="is-right">Price</th>
                        <th class="is-right">24h</th>
                        <th class="is-right">${props.period}</th>
                        <th class="is-right fs-hide-sm">Trend</th>
                        <th class="is-right fs-hide-md">Holding</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filteredAssets
                        .map((asset) => {
                          const isSelected = asset.symbol === selectedAsset.symbol;
                          const isStarred = watchlistSet.has(asset.symbol);
                          const dayPos = asset.changePct24h >= 0;
                          const periodRet = getAssetPeriodReturnPct(asset, props.period);
                          const periodPos = periodRet >= 0;
                          const shares = props.holdingsMap[asset.symbol] ?? 0;
                          const catMeta = ASSET_CATEGORY_META[asset.category];
                          return `
                            <tr class="fs-table-row-clickable ${isSelected ? 'is-selected' : ''}" data-exp-sym="${asset.symbol}" data-testid="explorer-row-${asset.symbol}">
                              <td>
                                <button
                                  type="button"
                                  class="fs-star-btn ${isStarred ? 'is-starred' : ''}"
                                  data-watch-toggle="${asset.symbol}"
                                  data-testid="watch-toggle-${asset.symbol}"
                                  aria-label="${isStarred ? 'Remove from watchlist' : 'Add to watchlist'}"
                                  title="${isStarred ? 'Remove from Watchlist' : 'Add to Watchlist'}"
                                >${isStarred ? '★' : '☆'}</button>
                              </td>
                              <td>
                                <div class="fs-cell-asset">
                                  <span class="fs-ticker">${escapeHtml(asset.symbol)}</span>
                                  <span class="fs-name-muted">${escapeHtml(asset.name)} · ${escapeHtml(catMeta.label)}</span>
                                </div>
                              </td>
                              <td class="is-right tabular-nums">${escapeHtml(formatUsd(asset.price))}</td>
                              <td class="is-right tabular-nums ${dayPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(asset.changePct24h))}</td>
                              <td class="is-right tabular-nums ${periodPos ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(periodRet))}</td>
                              <td class="is-right fs-hide-sm">${renderSparklineSvg(asset.seriesByPeriod[props.period], periodPos, 66, 22)}</td>
                              <td class="is-right tabular-nums fs-hide-md">
                                ${shares > 0 ? escapeHtml(formatUsd(shares * asset.price, false, 0)) : '<span class="fs-muted-dash">—</span>'}
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

        <!-- Right: Asset Detail & Performance Comparison Inspector -->
        <aside class="fs-card fs-explorer-detail-card" data-testid="asset-detail-panel">
          <div class="fs-detail-header">
            <div>
              <div class="fs-detail-meta">
                <span>${escapeHtml(selectedAsset.exchange)}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(ASSET_CATEGORY_META[selectedAsset.category].label)}</span>
                <span aria-hidden="true">·</span>
                <span>${escapeHtml(selectedAsset.sector)}</span>
                <span aria-hidden="true">·</span>
                <span>Simulated Demo Data</span>
              </div>
              <h2 class="fs-detail-title">${escapeHtml(selectedAsset.symbol)} — ${escapeHtml(selectedAsset.name)}</h2>
            </div>
            <button
              type="button"
              class="fs-btn ${isWatchlisted ? 'fs-btn-active' : 'fs-btn-primary'}"
              id="fs-detail-watchlist-btn"
              data-testid="detail-watchlist-btn"
            >
              ${isWatchlisted ? '★ In Watchlist' : '☆ Add to Watchlist'}
            </button>
          </div>

          <div class="fs-detail-price-row">
            <div class="fs-detail-price tabular-nums" data-testid="detail-price">${escapeHtml(formatUsd(selectedAsset.price))}</div>
            <div class="fs-detail-changes tabular-nums">
              <span class="${selectedAsset.changePct24h >= 0 ? 'is-pos' : 'is-neg'}">
                ${escapeHtml(formatUsd(selectedAsset.change24h, true))} (${escapeHtml(formatPct(selectedAsset.changePct24h))}) 24h
              </span>
              <span aria-hidden="true">·</span>
              <span class="${selectedPeriodRet >= 0 ? 'is-pos' : 'is-neg'}">
                ${escapeHtml(formatPct(selectedPeriodRet))} (${props.period})
              </span>
            </div>
          </div>

          <!-- Chart Controls: Time Period + Compare Asset -->
          <div class="fs-detail-chart-bar">
            <div class="fs-period-bar" role="group" aria-label="Asset chart period">
              ${TIME_PERIODS.map(
                (p) =>
                  `<button type="button" class="fs-period-btn ${p === props.period ? 'is-active' : ''}" data-exp-period="${p}" data-testid="explorer-period-${p}">${p}</button>`
              ).join('')}
            </div>

            <div class="fs-compare-wrap">
              <label for="fs-compare-select" class="fs-compare-label">Compare:</label>
              <select id="fs-compare-select" data-testid="compare-asset-select" class="fs-select fs-select-sm">
                <option value="">None (Price)</option>
                ${props.assets
                  .filter((a) => a.symbol !== selectedAsset.symbol)
                  .map(
                    (a) =>
                      `<option value="${a.symbol}" ${props.compareSymbol === a.symbol ? 'selected' : ''}>${escapeHtml(a.symbol)} (${escapeHtml(a.name)})</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>

          ${
            compareAsset
              ? `<div class="fs-compare-summary tabular-nums">
                   <span>Normalized ${props.period} Return:</span>
                   <strong class="${selectedPeriodRet >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(selectedAsset.symbol)} ${escapeHtml(formatPct(selectedPeriodRet))}</strong>
                   <span>vs</span>
                   <strong style="color:#94A3B8">${escapeHtml(compareAsset.symbol)} ${escapeHtml(formatPct(comparePeriodRet))}</strong>
                   <span>· Spread ${(selectedPeriodRet - comparePeriodRet) >= 0 ? '+' : ''}${(selectedPeriodRet - comparePeriodRet).toFixed(2)} pts</span>
                 </div>`
              : ''
          }

          <div id="fs-explorer-detail-chart" class="fs-detail-chart-host"></div>

          <p class="fs-detail-desc">${escapeHtml(selectedAsset.description)}</p>

          <!-- Key Metrics Grid -->
          <div class="fs-detail-metrics">
            <div class="fs-metric-cell">
              <span class="fs-metric-k">Market Cap</span>
              <span class="fs-metric-v tabular-nums">${escapeHtml(selectedAsset.marketCap)}</span>
            </div>
            <div class="fs-metric-cell">
              <span class="fs-metric-k">24h Volume</span>
              <span class="fs-metric-v tabular-nums">${escapeHtml(selectedAsset.volume24h)}</span>
            </div>
            <div class="fs-metric-cell">
              <span class="fs-metric-k">52W High</span>
              <span class="fs-metric-v tabular-nums">${escapeHtml(formatUsd(selectedAsset.high52w))}</span>
            </div>
            <div class="fs-metric-cell">
              <span class="fs-metric-k">52W Low</span>
              <span class="fs-metric-v tabular-nums">${escapeHtml(formatUsd(selectedAsset.low52w))}</span>
            </div>
            <div class="fs-metric-cell">
              <span class="fs-metric-k">${escapeHtml(selectedAsset.metricLabel)}</span>
              <span class="fs-metric-v tabular-nums">${escapeHtml(selectedAsset.metricValue)}</span>
            </div>
            <div class="fs-metric-cell">
              <span class="fs-metric-k">${props.period} Return</span>
              <span class="fs-metric-v tabular-nums ${selectedPeriodRet >= 0 ? 'is-pos' : 'is-neg'}">${escapeHtml(formatPct(selectedPeriodRet))}</span>
            </div>
          </div>

          <!-- Simulated Position Editor -->
          <div class="fs-position-box">
            <div class="fs-position-head">
              <div>
                <div class="fs-kpi-label">Simulated Portfolio Position</div>
                <div class="fs-position-val tabular-nums">
                  ${
                    heldShares > 0
                      ? `${escapeHtml(formatUsd(heldMarketVal))} <span class="${heldPl >= 0 ? 'is-pos' : 'is-neg'}">(${escapeHtml(formatUsd(heldPl, true))} / ${escapeHtml(formatPct(heldPlPct))})</span>`
                      : 'Not currently held'
                  }
                </div>
              </div>
            </div>
            <form class="fs-position-form" id="fs-position-form">
              <label for="fs-shares-input" class="fs-compare-label">Units / Shares:</label>
              <input
                type="number"
                id="fs-shares-input"
                data-testid="shares-input"
                class="fs-input fs-input-sm tabular-nums"
                step="any"
                min="0"
                value="${heldShares}"
              />
              <button type="submit" class="fs-btn fs-btn-primary fs-btn-sm" data-testid="update-position-btn">Update Position</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  `;

  // Render detail chart
  const detailChartEl = container.querySelector<HTMLElement>('#fs-explorer-detail-chart');
  if (detailChartEl) {
    renderPerformanceLineChart(detailChartEl, {
      primaryLabel: selectedAsset.symbol,
      series: selectedAsset.seriesByPeriod[props.period],
      comparisonLabel: compareAsset?.symbol,
      comparisonSeries: compareAsset ? compareAsset.seriesByPeriod[props.period] : undefined,
      normalizedPct: Boolean(compareAsset),
      height: 248,
    });
  }

  // Bindings
  container.querySelectorAll<HTMLButtonElement>('[data-exp-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      props.onSelectCategory(btn.dataset.expCat as ExplorerCategoryFilter);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-exp-scope]').forEach((btn) => {
    btn.addEventListener('click', () => {
      props.onSelectScope(btn.dataset.expScope as ExplorerScopeFilter);
    });
  });

  const searchInput = container.querySelector<HTMLInputElement>('#fs-explorer-search');
  searchInput?.addEventListener('input', () => {
    props.onChangeSearch(searchInput.value);
  });

  const sortSelect = container.querySelector<HTMLSelectElement>('#fs-explorer-sort');
  sortSelect?.addEventListener('change', () => {
    props.onChangeSort(sortSelect.value as ExplorerSortKey);
  });

  container.querySelector('#fs-clear-explorer-filters')?.addEventListener('click', () => {
    props.onSelectCategory('all');
    props.onSelectScope('all');
    props.onChangeSearch('');
  });

  container.querySelectorAll<HTMLElement>('[data-exp-sym]').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-watch-toggle]')) return;
      const sym = row.dataset.expSym;
      if (sym) props.onSelectAsset(sym);
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-watch-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sym = btn.dataset.watchToggle;
      if (sym) props.onToggleWatchlist(sym);
    });
  });

  container.querySelector('#fs-detail-watchlist-btn')?.addEventListener('click', () => {
    props.onToggleWatchlist(selectedAsset.symbol);
  });

  container.querySelectorAll<HTMLButtonElement>('[data-exp-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      props.onSelectPeriod(btn.dataset.expPeriod as TimePeriod);
    });
  });

  const compareSelect = container.querySelector<HTMLSelectElement>('#fs-compare-select');
  compareSelect?.addEventListener('change', () => {
    props.onSelectCompare(compareSelect.value);
  });

  const posForm = container.querySelector<HTMLFormElement>('#fs-position-form');
  posForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = posForm.querySelector<HTMLInputElement>('#fs-shares-input');
    const val = Number.parseFloat(input?.value ?? '0');
    if (Number.isFinite(val) && val >= 0) {
      props.onUpdateHolding(selectedAsset.symbol, val);
    }
  });
}
