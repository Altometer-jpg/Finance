/**
 * FinScope Ask AI Natural-Language Financial Query Panel (`src/finscope/views/ask-panel.ts`)
 *
 * Wraps the deterministic NL query engine (`answerQuestionDeterministically`) +
 * live `/api/ask` Gemini DSL backend upgrade + structured query builder inside
 * FinScope's dark charcoal terminal aesthetic.
 */

import {
  formatMoneyMinor,
  type AskQueryResult,
  type Category,
  type DatasetBundle,
  type QueryMeasure,
} from '../../../contracts/index.js';
import {
  answerQuestionDeterministically,
  buildQueryFromSelection,
  executeAskQuery,
  MONTH_NAMES_SHORT,
} from '../../ask/index.js';

function escapeHtml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const DEFAULT_ASK_PROMPTS = [
  'How much did I spend on coffee in December?',
  'How many times did I visit Blue Bottle Coffee?',
  'How much did I spend on eating out on weekends?',
  'What was my biggest single purchase?',
  'How much did I spend on groceries?',
  'How much did I spend after 9pm?',
];

export interface AskPanelProps {
  bundle: DatasetBundle;
  initialQuestion?: string;
  lastResult: AskQueryResult | null;
  onResultChange: (q: string, res: AskQueryResult) => void;
  onOpenReceipts: (title: string, txnIds: string[]) => void;
}

export function renderAskPanelView(container: HTMLElement, props: AskPanelProps): void {
  const txns = props.bundle.transactions;
  const sampleQuestions =
    props.bundle.plan.sample_questions && props.bundle.plan.sample_questions.length > 0
      ? props.bundle.plan.sample_questions
      : DEFAULT_ASK_PROMPTS;

  const activeQuestion = props.initialQuestion ?? sampleQuestions[0] ?? DEFAULT_ASK_PROMPTS[0]!;
  const currentResult =
    props.lastResult ?? answerQuestionDeterministically(activeQuestion, txns);

  const uniqueCategories = Array.from(new Set(txns.map((t) => t.category))).sort();
  const topMerchants = Array.from(
    txns.reduce((map, t) => {
      map.set(t.merchant, (map.get(t.merchant) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([m]) => m);

  container.innerHTML = `
    <div class="fs-page" data-testid="finscope-ask">
      <div class="fs-context-bar">
        <div class="fs-context-meta">
          <span class="fs-context-strong">Ask AI Financial Query Studio</span>
          <span aria-hidden="true">·</span>
          <span>Deterministic DSL Executor + Server Gemini Upgrade</span>
          <span aria-hidden="true">·</span>
          <span>Querying ${txns.length.toLocaleString('en-US')} active ledger lines</span>
        </div>
      </div>

      <!-- Query Input Card -->
      <section class="fs-card">
        <form id="fs-ask-form" class="fs-ask-form">
          <input
            type="text"
            id="fs-ask-input"
            data-testid="finscope-ask-input"
            class="fs-input fs-ask-input"
            autocomplete="off"
            placeholder="Ask a financial question (e.g. How much did I spend on coffee in December?)…"
            value="${escapeHtml(currentResult.question || activeQuestion)}"
          />
          <button type="submit" class="fs-btn fs-btn-primary" data-testid="finscope-ask-submit">Run Query ↵</button>
        </form>

        <div class="fs-ask-chips">
          ${sampleQuestions
            .map(
              (q) =>
                `<button type="button" class="fs-chip-btn" data-ask-preset="${escapeHtml(q)}">${escapeHtml(q)}</button>`
            )
            .join('')}
        </div>

        <!-- Structured Query Builder -->
        <details class="fs-builder-details">
          <summary class="fs-builder-summary">Structured Query Builder (No-Typing Filter Mode)</summary>
          <div class="fs-builder-grid">
            <div>
              <label class="fs-compare-label" for="fs-b-cat">Category</label>
              <select id="fs-b-cat" class="fs-select fs-select-sm">
                <option value="">All Categories</option>
                ${uniqueCategories.map((c) => `<option value="${c}">${escapeHtml(c)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="fs-compare-label" for="fs-b-merch">Counterparty</label>
              <select id="fs-b-merch" class="fs-select fs-select-sm">
                <option value="">All Counterparties</option>
                ${topMerchants.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="fs-compare-label" for="fs-b-month">Month</label>
              <select id="fs-b-month" class="fs-select fs-select-sm">
                <option value="">Full Year</option>
                ${MONTH_NAMES_SHORT.map((mn, i) => `<option value="${i + 1}">${mn}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="fs-compare-label" for="fs-b-measure">Measure</label>
              <select id="fs-b-measure" class="fs-select fs-select-sm">
                <option value="sum">Total Spend / Amount</option>
                <option value="count">Transaction Count</option>
                <option value="average">Average Amount</option>
                <option value="max">Single Largest</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;">
              <button type="button" id="fs-b-run-btn" class="fs-btn fs-btn-primary fs-btn-sm">Execute Filter</button>
            </div>
          </div>
        </details>
      </section>

      <!-- Answer + Traceable Receipts Split -->
      <section class="fs-ask-results-grid" id="fs-ask-results">
        ${renderAskResultInnerHtml(currentResult, props.bundle)}
      </section>
    </div>
  `;

  const resultsHost = container.querySelector<HTMLElement>('#fs-ask-results')!;
  const inputEl = container.querySelector<HTMLInputElement>('#fs-ask-input')!;

  const bindResultEvents = (res: AskQueryResult): void => {
    resultsHost.querySelector('#fs-ask-drawer-btn')?.addEventListener('click', () => {
      props.onOpenReceipts(res.interpretation || res.question, [...res.matching_txn_ids]);
    });
    resultsHost.querySelector('#fs-ask-alt-btn')?.addEventListener('click', (e) => {
      const alt = (e.currentTarget as HTMLButtonElement).dataset.altQuestion ?? '';
      if (alt) {
        inputEl.value = alt;
        void runQuery(alt);
      }
    });
  };

  const applyResult = (q: string, res: AskQueryResult): void => {
    props.onResultChange(q, res);
    resultsHost.innerHTML = renderAskResultInnerHtml(res, props.bundle);
    bindResultEvents(res);
  };

  const runQuery = async (question: string): Promise<void> => {
    const cleanQ = question.trim();
    if (!cleanQ) return;
    const immediate = answerQuestionDeterministically(cleanQ, txns);
    applyResult(cleanQ, immediate);

    // Non-blocking Gemini server upgrade if available
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: cleanQ, transactions: txns }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const data = (await resp.json()) as AskQueryResult;
        if (
          data &&
          typeof data.answerable === 'boolean' &&
          data.source === 'model' &&
          (data.formatted_answer !== immediate.formatted_answer ||
            data.interpretation !== immediate.interpretation)
        ) {
          applyResult(cleanQ, data);
        }
      }
    } catch {
      // Deterministic engine already answered instantaneously
    }
  };

  bindResultEvents(currentResult);

  container.querySelector('#fs-ask-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    void runQuery(inputEl.value);
  });

  container.querySelectorAll<HTMLButtonElement>('[data-ask-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.askPreset ?? '';
      inputEl.value = q;
      void runQuery(q);
    });
  });

  container.querySelector('#fs-b-run-btn')?.addEventListener('click', () => {
    const cat = (container.querySelector<HTMLSelectElement>('#fs-b-cat')?.value ?? '') as Category | '';
    const merch = container.querySelector<HTMLSelectElement>('#fs-b-merch')?.value ?? '';
    const monthVal = container.querySelector<HTMLSelectElement>('#fs-b-month')?.value ?? '';
    const measure = (container.querySelector<HTMLSelectElement>('#fs-b-measure')?.value ?? 'sum') as QueryMeasure;
    const built = buildQueryFromSelection({
      category: cat,
      merchant: merch,
      month: monthVal ? Number.parseInt(monthVal, 10) : null,
      weekdayMode: 'all',
      measure,
      group_by: 'none',
    });
    const res = executeAskQuery(built.query, txns, { question: built.question, source: 'builder' });
    inputEl.value = built.question;
    applyResult(built.question, res);
  });
}

function renderAskResultInnerHtml(res: AskQueryResult, bundle: DatasetBundle): string {
  const sym = bundle.plan.business_meta?.currency_symbol ?? '$';
  const displaySym = sym === 'US$' ? '$' : sym;
  const matchedDates = new Set(res.matching_dates);

  return `
    <div class="fs-card fs-ask-answer-card">
      <div class="fs-card-header">
        <div>
          <div class="fs-kpi-label">${res.answerable ? 'Computed Answer' : 'Query Limitation'}</div>
          <div class="fs-ask-big-val tabular-nums ${res.answerable ? 'is-pos' : ''}" data-testid="finscope-ask-answer">
            ${escapeHtml(res.formatted_answer)}${res.unit_label && res.answerable ? ` <span class="fs-ask-unit">${escapeHtml(res.unit_label)}</span>` : ''}
          </div>
        </div>
        <span class="fs-name-muted">${res.source === 'model' ? 'Gemini DSL' : res.source === 'builder' ? 'Builder' : 'Deterministic Engine'}</span>
      </div>

      <p class="fs-ask-interp">${escapeHtml(res.answerable ? res.interpretation : res.reason_if_not || res.interpretation)}</p>

      ${
        !res.answerable && res.suggested_question
          ? `<div style="margin-top:12px;">
               <button type="button" class="fs-btn fs-btn-primary fs-btn-sm" id="fs-ask-alt-btn" data-alt-question="${escapeHtml(res.suggested_question)}">
                 Try: ${escapeHtml(res.suggested_question)} →
               </button>
             </div>`
          : `<div class="fs-ask-meta-row tabular-nums">
               <span>${res.matching_txn_ids.length} matching transactions</span>
               <span aria-hidden="true">·</span>
               <span>${res.matching_dates.length} active days</span>
             </div>`
      }

      ${
        res.matching_dates.length > 0
          ? `<div class="fs-ask-minigrid-wrap">
               <div class="fs-kpi-label" style="margin-bottom:8px;">Matching Dates Across Calendar Year</div>
               <div class="fs-heatmap-grid fs-heatmap-mini">
                 ${bundle.days
                   .map((d) => {
                     const hit = matchedDates.has(d.date);
                     return `<span class="fs-hm-mini-cell" style="grid-column:${d.week_index + 1};grid-row:${d.weekday + 1};background:${hit ? '#10B981' : '#181D25'};"></span>`;
                   })
                   .join('')}
               </div>
             </div>`
          : ''
      }
    </div>

    <div class="fs-card fs-ask-receipts-card">
      <div class="fs-card-header">
        <div>
          <h3 class="fs-card-title">Traceable Receipts (${res.receipts.length})</h3>
          <div class="fs-card-meta">Verified underlying ledger entries</div>
        </div>
        ${
          res.matching_txn_ids.length > 0
            ? `<button type="button" class="fs-btn fs-btn-ghost fs-btn-sm" id="fs-ask-drawer-btn">Open Drawer →</button>`
            : ''
        }
      </div>

      ${
        res.receipts.length === 0
          ? `<div class="fs-empty-state"><p>No matching transaction rows for this query.</p></div>`
          : `<div class="fs-ask-receipt-list">
              ${res.receipts
                .slice(0, 14)
                .map(
                  (r) => `
                <div class="fs-ask-receipt-row">
                  <div>
                    <div class="fs-ticker">${escapeHtml(r.merchant)}</div>
                    <div class="fs-name-muted">${escapeHtml(r.date)} · ${escapeHtml(r.category)}</div>
                  </div>
                  <div class="tabular-nums">${escapeHtml(formatMoneyMinor(r.amount_minor, { showCents: true, prefix: displaySym }))}</div>
                </div>
              `
                )
                .join('')}
             </div>`
      }
    </div>
  `;
}
