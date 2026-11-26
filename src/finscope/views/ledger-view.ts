/**
 * FinScope Ledger & Cashflow Intelligence View (`src/finscope/views/ledger-view.ts`)
 *
 * Preserves and elevates the core ledger analytics:
 * - Deterministic inflows, outflows, net cashflow & transaction counts
 * - Monthly Cashflow grouped bar chart (Inflows vs Outflows)
 * - Category Breakdown with click-to-filter & Receipts Drawer drill-down
 * - Interactive 53x7 Year Cashflow Heatmap (hover day, click to open Receipts Drawer, drag range to sum)
 * - Searchable, filterable, sortable transaction table + CSV export
 */

import {
  formatMoneyMinor,
  getCategoryDisplayLabel,
  type Category,
  type DatasetBundle,
  type Day,
  type Transaction,
} from '../../../contracts/index.js';
import { renderMonthlyCashflowChart, type MonthlyCashflowBar } from '../charts.js';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface LedgerViewState {
  searchQuery: string;
  categoryFilter: string;
  directionFilter: 'all' | 'out' | 'in';
  sortKey: 'date_desc' | 'amount_desc' | 'amount_asc';
  visibleLimit: number;
}

export interface LedgerViewProps {
  bundle: DatasetBundle;
  state: LedgerViewState;
  onUpdateState: (patch: Partial<LedgerViewState>) => void;
  onOpenReceipts: (title: string, txnIds: string[]) => void;
  onOpenImport: () => void;
  onOpenAsk: (question?: string) => void;
  onOpenStory: () => void;
}

export function renderLedgerView(container: HTMLElement, props: LedgerViewProps): void {
  const { bundle, state } = props;
  const txns = bundle.transactions;
  const days = bundle.days;
  const isB2B = Boolean(bundle.plan.business_meta);
  const labels = bundle.plan.category_labels;
  const sym = bundle.plan.business_meta?.currency_symbol ?? '$';
  const displaySym = sym === 'US$' ? '$' : sym;

  let totalInMinor = 0;
  let totalOutMinor = 0;
  const monthlyMap = Array.from({ length: 12 }, (_, idx) => ({
    monthLabel: MONTH_SHORT[idx]!,
    inflowUsd: 0,
    outflowUsd: 0,
  }));

  const catTotals = new Map<Category, { outMinor: number; count: number; txnIds: string[] }>();

  for (const t of txns) {
    if (t.is_transfer) continue;
    const monthIdx = Math.max(0, Math.min(11, Number.parseInt(t.date.slice(5, 7), 10) - 1));
    if (t.direction === 'in' && !t.is_refund) {
      totalInMinor += t.amount_minor;
      monthlyMap[monthIdx]!.inflowUsd += t.amount_minor / 100;
    } else if (t.direction === 'out' && !t.is_refund) {
      totalOutMinor += t.amount_minor;
      monthlyMap[monthIdx]!.outflowUsd += t.amount_minor / 100;
      const existing = catTotals.get(t.category) ?? { outMinor: 0, count: 0, txnIds: [] };
      existing.outMinor += t.amount_minor;
      existing.count += 1;
      existing.txnIds.push(t.id);
      catTotals.set(t.category, existing);
    }
  }

  const netMinor = totalInMinor - totalOutMinor;
  const sortedCategories = Array.from(catTotals.entries())
    .map(([category, info]) => ({
      category,
      label: getCategoryDisplayLabel(category, labels, isB2B),
      outMinor: info.outMinor,
      count: info.count,
      txnIds: info.txnIds,
      pct: totalOutMinor > 0 ? (info.outMinor / totalOutMinor) * 100 : 0,
    }))
    .sort((a, b) => b.outMinor - a.outMinor);

  const entityTitle = bundle.plan.business_meta
    ? `${bundle.plan.business_meta.entity_name} · ${bundle.plan.business_meta.fiscal_period_label}`
    : `${bundle.plan.person_name} · ${bundle.plan.year}`;

  // Filter table rows
  const q = state.searchQuery.trim().toLowerCase();
  const filteredTxns = txns
    .filter((t) => {
      if (state.directionFilter !== 'all' && t.direction !== state.directionFilter) return false;
      if (state.categoryFilter && t.category !== state.categoryFilter) return false;
      if (q) {
        const catLbl = getCategoryDisplayLabel(t.category, labels, isB2B).toLowerCase();
        return (
          t.merchant.toLowerCase().includes(q) ||
          t.raw_description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          catLbl.includes(q) ||
          t.date.includes(q) ||
          t.id.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (state.sortKey === 'amount_desc') return b.amount_minor - a.amount_minor;
      if (state.sortKey === 'amount_asc') return a.amount_minor - b.amount_minor;
      return b.date.localeCompare(a.date) || b.amount_minor - a.amount_minor;
    });

  const shownTxns = filteredTxns.slice(0, state.visibleLimit);

  // Build 53x7 day heatmap max spend for scaling
  const maxDayOut = Math.max(
    100,
    ...days.map((d) => Math.max(d.all_out_minor, d.in_minor))
  );

  // Build quick txn lookup for day tooltip
  const txnById = new Map<string, Transaction>();
  for (const t of txns) txnById.set(t.id, t);

  container.innerHTML = `
    <div class="fs-page" data-testid="finscope-ledger">
      <div class="fs-context-bar">
        <div class="fs-context-meta">
          <span class="fs-context-strong">${escapeHtml(entityTitle)}</span>
          <span aria-hidden="true">·</span>
          <span>${txns.length.toLocaleString('en-US')} verified ledger lines</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(bundle.plan.business_meta?.archetype_label ?? 'Personal Cashflow Archive')}</span>
        </div>
        <div class="fs-context-actions">
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-ledger-story-btn">Play Animated Story</button>
          <button type="button" class="fs-btn fs-btn-ghost" id="fs-ledger-ask-btn">Query with Ask AI</button>
          <button type="button" class="fs-btn fs-btn-primary" id="fs-ledger-import-btn">Import New Ledger</button>
        </div>
      </div>

      <!-- 4 Ledger KPIs -->
      <section class="fs-kpi-grid">
        <article class="fs-card fs-kpi-card">
          <div class="fs-kpi-label">${escapeHtml(bundle.plan.business_meta?.inflow_label ?? 'Gross Inflows')}</div>
          <div class="fs-kpi-value tabular-nums is-pos">${escapeHtml(formatMoneyMinor(totalInMinor, { showCents: false, prefix: displaySym }))}</div>
          <div class="fs-kpi-sub">Non-transfer inflows across period</div>
        </article>
        <article class="fs-card fs-kpi-card">
          <div class="fs-kpi-label">${escapeHtml(bundle.plan.business_meta?.outflow_label ?? 'Total Outflows')}</div>
          <div class="fs-kpi-value tabular-nums">${escapeHtml(formatMoneyMinor(totalOutMinor, { showCents: false, prefix: displaySym }))}</div>
          <div class="fs-kpi-sub">${sortedCategories.length} active spending categories</div>
        </article>
        <article class="fs-card fs-kpi-card">
          <div class="fs-kpi-label">Net Cashflow</div>
          <div class="fs-kpi-value tabular-nums ${netMinor >= 0 ? 'is-pos' : 'is-neg'}">
            ${netMinor >= 0 ? '+' : '-'}${escapeHtml(formatMoneyMinor(Math.abs(netMinor), { showCents: false, prefix: displaySym }))}
          </div>
          <div class="fs-kpi-sub">${totalInMinor > 0 ? `${((netMinor / totalInMinor) * 100).toFixed(1)}% retention margin` : 'Outflow-only ledger'}</div>
        </article>
        <article class="fs-card fs-kpi-card">
          <div class="fs-kpi-label">Active Calendar Days</div>
          <div class="fs-kpi-value tabular-nums">${days.filter((d) => d.txn_ids.length > 0).length} / ${days.length}</div>
          <div class="fs-kpi-sub">Click or drag any day below for receipts</div>
        </article>
      </section>

      <!-- Monthly Cashflow Chart + Category Allocation -->
      <section class="fs-main-charts-grid">
        <div class="fs-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Monthly Cashflow (Inflows vs Outflows)</h2>
              <div class="fs-card-meta">Hover bars to inspect monthly net position</div>
            </div>
            <div class="fs-legend-inline">
              <span><i style="background:#10B981"></i>Inflows</span>
              <span><i style="background:#EF4444"></i>Outflows</span>
            </div>
          </div>
          <div id="fs-ledger-monthly-chart" style="padding-top:8px;"></div>
        </div>

        <div class="fs-card">
          <div class="fs-card-header">
            <div>
              <h2 class="fs-card-title">Category Breakdown</h2>
              <div class="fs-card-meta">Click a category to filter ledger or inspect receipts</div>
            </div>
          </div>
          <div class="fs-cat-bars">
            ${sortedCategories
              .slice(0, 8)
              .map(
                (c) => `
              <div class="fs-cat-bar-row ${state.categoryFilter === c.category ? 'is-active' : ''}" data-cat-filter="${c.category}">
                <div class="fs-cat-bar-top">
                  <button type="button" class="fs-cat-name-btn" data-cat-filter-btn="${c.category}">${escapeHtml(c.label)}</button>
                  <div class="fs-cat-bar-nums tabular-nums">
                    <span>${escapeHtml(formatMoneyMinor(c.outMinor, { showCents: false, prefix: displaySym }))}</span>
                    <span class="fs-name-muted">${c.pct.toFixed(1)}%</span>
                    <button type="button" class="fs-link-btn" data-cat-receipts="${c.category}">Receipts (${c.count})</button>
                  </div>
                </div>
                <div class="fs-cat-track">
                  <div class="fs-cat-fill" style="width:${Math.max(2, c.pct).toFixed(1)}%"></div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </section>

      <!-- Interactive 53x7 Cashflow Heatmap -->
      <section class="fs-card">
        <div class="fs-card-header">
          <div>
            <h2 class="fs-card-title">53 × 7 Cashflow Activity Matrix</h2>
            <div class="fs-card-meta" id="fs-heatmap-status">Hover any day to inspect · Click a day to open Receipts · Drag across days to sum a range</div>
          </div>
          <button type="button" class="fs-btn fs-btn-ghost fs-btn-sm" id="fs-heatmap-all-receipts">View All Receipts</button>
        </div>
        <div class="fs-heatmap-scroll">
          <div class="fs-heatmap-grid" id="fs-heatmap-grid" data-testid="ledger-heatmap-grid">
            ${days
              .map((d, idx) => {
                const intensity = d.all_out_minor > 0 ? Math.min(1, Math.sqrt(d.all_out_minor / maxDayOut)) : 0;
                const bg =
                  d.txn_ids.length === 0
                    ? '#161B22'
                    : d.in_minor > d.all_out_minor && d.in_minor > 0
                      ? '#10B981'
                      : `rgba(16, 185, 129, ${(0.18 + intensity * 0.78).toFixed(2)})`;
                return `<button type="button" class="fs-hm-cell" data-day-idx="${idx}" style="grid-column:${d.week_index + 1};grid-row:${d.weekday + 1};background:${bg};" aria-label="${escapeHtml(d.date)}: ${d.txn_ids.length} transactions"></button>`;
              })
              .join('')}
          </div>
        </div>
      </section>

      <!-- Searchable Transaction Ledger -->
      <section class="fs-card">
        <div class="fs-card-header">
          <div>
            <h2 class="fs-card-title">Transaction Ledger</h2>
            <div class="fs-card-meta">${filteredTxns.length.toLocaleString('en-US')} matching records</div>
          </div>
          <div class="fs-ledger-filters">
            <input
              type="search"
              id="fs-ledger-search"
              data-testid="ledger-search-input"
              class="fs-input fs-input-sm"
              placeholder="Filter merchant, description, ID…"
              value="${escapeHtml(state.searchQuery)}"
            />
            <select id="fs-ledger-cat" class="fs-select fs-select-sm" aria-label="Filter category">
              <option value="">All Categories</option>
              ${sortedCategories
                .map(
                  (c) =>
                    `<option value="${c.category}" ${state.categoryFilter === c.category ? 'selected' : ''}>${escapeHtml(c.label)}</option>`
                )
                .join('')}
            </select>
            <select id="fs-ledger-dir" class="fs-select fs-select-sm" aria-label="Filter direction">
              <option value="all" ${state.directionFilter === 'all' ? 'selected' : ''}>All Flows</option>
              <option value="out" ${state.directionFilter === 'out' ? 'selected' : ''}>Outflows Only</option>
              <option value="in" ${state.directionFilter === 'in' ? 'selected' : ''}>Inflows Only</option>
            </select>
            <select id="fs-ledger-sort" class="fs-select fs-select-sm" aria-label="Sort transactions">
              <option value="date_desc" ${state.sortKey === 'date_desc' ? 'selected' : ''}>Newest First</option>
              <option value="amount_desc" ${state.sortKey === 'amount_desc' ? 'selected' : ''}>Largest First</option>
              <option value="amount_asc" ${state.sortKey === 'amount_asc' ? 'selected' : ''}>Smallest First</option>
            </select>
            <button type="button" class="fs-btn fs-btn-ghost fs-btn-sm" id="fs-export-csv-btn">Export CSV</button>
          </div>
        </div>

        <div class="fs-table-scroll">
          <table class="fs-table" data-testid="ledger-transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Counterparty / Merchant</th>
                <th>Category</th>
                <th class="fs-hide-sm">Account</th>
                <th class="is-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${
                shownTxns.length === 0
                  ? `<tr><td colspan="5" class="fs-empty-cell">No transactions match current filters.</td></tr>`
                  : shownTxns
                      .map((t) => {
                        const catLbl = getCategoryDisplayLabel(t.category, labels, isB2B);
                        const isIn = t.direction === 'in';
                        const formattedAmt = formatMoneyMinor(t.amount_minor, {
                          showCents: true,
                          prefix: displaySym,
                        });
                        return `
                          <tr class="fs-table-row-clickable" data-txn-row="${escapeHtml(t.id)}">
                            <td class="tabular-nums fs-name-muted">${escapeHtml(t.date)}</td>
                            <td>
                              <div class="fs-cell-asset">
                                <span class="fs-ticker">${escapeHtml(t.merchant)}</span>
                                <span class="fs-name-muted">${escapeHtml(t.raw_description.slice(0, 68))}</span>
                              </div>
                            </td>
                            <td class="fs-name-muted">${escapeHtml(catLbl)}</td>
                            <td class="fs-name-muted fs-hide-sm">${escapeHtml(t.account ?? 'Operating')}</td>
                            <td class="is-right tabular-nums ${isIn ? 'is-pos' : ''}">
                              ${isIn ? '+' : '-'}${escapeHtml(formattedAmt)}
                            </td>
                          </tr>
                        `;
                      })
                      .join('')
              }
            </tbody>
          </table>
        </div>

        ${
          filteredTxns.length > shownTxns.length
            ? `<div class="fs-load-more-wrap">
                 <button type="button" class="fs-btn fs-btn-ghost" id="fs-ledger-more-btn">
                   Show More (${filteredTxns.length - shownTxns.length} remaining)
                 </button>
               </div>`
            : ''
        }
      </section>
    </div>
  `;

  // Render Monthly Cashflow Bar Chart
  const monthlyHost = container.querySelector<HTMLElement>('#fs-ledger-monthly-chart');
  if (monthlyHost) {
    renderMonthlyCashflowChart(monthlyHost, monthlyMap as MonthlyCashflowBar[], displaySym);
  }

  // Top action buttons
  container.querySelector('#fs-ledger-story-btn')?.addEventListener('click', () => props.onOpenStory());
  container.querySelector('#fs-ledger-ask-btn')?.addEventListener('click', () => props.onOpenAsk());
  container.querySelector('#fs-ledger-import-btn')?.addEventListener('click', () => props.onOpenImport());

  // Category filter & receipts triggers
  container.querySelectorAll<HTMLButtonElement>('[data-cat-filter-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.catFilterBtn ?? '';
      props.onUpdateState({
        categoryFilter: state.categoryFilter === cat ? '' : cat,
        visibleLimit: 35,
      });
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-cat-receipts]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = btn.dataset.catReceipts as Category;
      const entry = catTotals.get(cat);
      if (entry) {
        props.onOpenReceipts(
          `${getCategoryDisplayLabel(cat, labels, isB2B)} (${entry.count} items)`,
          entry.txnIds
        );
      }
    });
  });

  // Heatmap interaction (hover + drag range + single click)
  const heatmapGrid = container.querySelector<HTMLElement>('#fs-heatmap-grid');
  const statusEl = container.querySelector<HTMLElement>('#fs-heatmap-status');
  let dragStartIdx: number | null = null;
  let dragEndIdx: number | null = null;

  const updateHeatmapHover = (dayIdx: number): void => {
    const d: Day | undefined = days[dayIdx];
    if (!d || !statusEl) return;
    if (dragStartIdx !== null && dragEndIdx !== null && dragStartIdx !== dragEndIdx) {
      const lo = Math.min(dragStartIdx, dragEndIdx);
      const hi = Math.max(dragStartIdx, dragEndIdx);
      const spanDays = days.slice(lo, hi + 1);
      const sumOut = spanDays.reduce((acc, item) => acc + item.all_out_minor, 0);
      const count = spanDays.reduce((acc, item) => acc + item.txn_ids.length, 0);
      statusEl.innerHTML = `<strong style="color:#10B981">${escapeHtml(days[lo]!.date)} → ${escapeHtml(days[hi]!.date)}</strong> · ${spanDays.length} days · ${count} items · Outflow ${escapeHtml(formatMoneyMinor(sumOut, { showCents: false, prefix: displaySym }))}`;
      return;
    }
    const topTxn = d.txn_ids.map((id) => txnById.get(id)).find(Boolean);
    const outStr = formatMoneyMinor(d.all_out_minor, { showCents: true, prefix: displaySym });
    statusEl.innerHTML = `<strong>${escapeHtml(d.date)}</strong> · ${d.txn_ids.length} transaction${d.txn_ids.length === 1 ? '' : 's'} · Outflow ${escapeHtml(outStr)}${topTxn ? ` · Top: ${escapeHtml(topTxn.merchant)}` : ''}`;
  };

  if (heatmapGrid) {
    const cells = Array.from(heatmapGrid.querySelectorAll<HTMLButtonElement>('.fs-hm-cell'));
    const syncDragHighlight = (): void => {
      if (dragStartIdx === null || dragEndIdx === null) {
        cells.forEach((c) => c.classList.remove('is-in-range'));
        return;
      }
      const lo = Math.min(dragStartIdx, dragEndIdx);
      const hi = Math.max(dragStartIdx, dragEndIdx);
      cells.forEach((c, idx) => {
        c.classList.toggle('is-in-range', idx >= lo && idx <= hi);
      });
    };

    cells.forEach((cell) => {
      const idx = Number(cell.dataset.dayIdx);
      cell.addEventListener('pointerenter', () => {
        if (dragStartIdx !== null) {
          dragEndIdx = idx;
          syncDragHighlight();
        }
        updateHeatmapHover(idx);
      });
      cell.addEventListener('pointerdown', () => {
        dragStartIdx = idx;
        dragEndIdx = idx;
        syncDragHighlight();
      });
      cell.addEventListener('pointerup', () => {
        if (dragStartIdx === null) return;
        const lo = Math.min(dragStartIdx, dragEndIdx ?? idx);
        const hi = Math.max(dragStartIdx, dragEndIdx ?? idx);
        dragStartIdx = null;
        dragEndIdx = null;
        syncDragHighlight();
        const spanDays = days.slice(lo, hi + 1);
        const ids = spanDays.flatMap((d) => d.txn_ids);
        if (lo === hi) {
          props.onOpenReceipts(`${days[lo]!.date} (${ids.length} items)`, ids);
        } else {
          props.onOpenReceipts(`${days[lo]!.date} → ${days[hi]!.date} (${spanDays.length} days)`, ids);
        }
      });
    });

    heatmapGrid.addEventListener('pointerleave', () => {
      dragStartIdx = null;
      dragEndIdx = null;
      syncDragHighlight();
    });
  }

  container.querySelector('#fs-heatmap-all-receipts')?.addEventListener('click', () => {
    props.onOpenReceipts(
      `${entityTitle} — All Ledger Entries`,
      txns.map((t) => t.id)
    );
  });

  // Table filter bindings
  const searchEl = container.querySelector<HTMLInputElement>('#fs-ledger-search');
  searchEl?.addEventListener('input', () => {
    props.onUpdateState({ searchQuery: searchEl.value, visibleLimit: 35 });
  });
  const catEl = container.querySelector<HTMLSelectElement>('#fs-ledger-cat');
  catEl?.addEventListener('change', () => {
    props.onUpdateState({ categoryFilter: catEl.value, visibleLimit: 35 });
  });
  const dirEl = container.querySelector<HTMLSelectElement>('#fs-ledger-dir');
  dirEl?.addEventListener('change', () => {
    props.onUpdateState({
      directionFilter: dirEl.value as 'all' | 'out' | 'in',
      visibleLimit: 35,
    });
  });
  const sortEl = container.querySelector<HTMLSelectElement>('#fs-ledger-sort');
  sortEl?.addEventListener('change', () => {
    props.onUpdateState({
      sortKey: sortEl.value as 'date_desc' | 'amount_desc' | 'amount_asc',
    });
  });

  container.querySelector('#fs-ledger-more-btn')?.addEventListener('click', () => {
    props.onUpdateState({ visibleLimit: state.visibleLimit + 50 });
  });

  container.querySelectorAll<HTMLElement>('[data-txn-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const id = row.dataset.txnRow;
      if (id) props.onOpenReceipts(`Transaction ${id}`, [id]);
    });
  });

  container.querySelector('#fs-export-csv-btn')?.addEventListener('click', () => {
    const header = ['ID', 'Date', 'Merchant', 'Category', 'Direction', 'Amount', 'Account', 'Description'];
    const lines = [
      header.join(','),
      ...filteredTxns.map((t) =>
        [
          t.id,
          t.date,
          `"${t.merchant.replace(/"/g, '""')}"`,
          `"${getCategoryDisplayLabel(t.category, labels, isB2B).replace(/"/g, '""')}"`,
          t.direction,
          ((t.direction === 'out' ? -1 : 1) * (t.amount_minor / 100)).toFixed(2),
          `"${(t.account ?? '').replace(/"/g, '""')}"`,
          `"${t.raw_description.replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finscope-ledger-export.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
