/**
 * FinScope — Financial Intelligence Dashboard Shell & Orchestrator (`src/finscope/finscope-app.ts`)
 */

import type { AskQueryResult, DatasetBundle } from '../../contracts/index.js';
import { registerBespokeChapters } from '../chapters/bespoke/index.js';
import { ReceiptsDrawer } from '../explore/receipts-drawer.js';
import { StoryPlayer } from '../player/index.js';
import {
  createInitialMarketAssets,
  getDefaultHoldingsMap,
  loadSavedHoldings,
  loadSavedWatchlist,
  saveHoldings,
  saveWatchlist,
  stepSimulatedMarketPrices,
  type AssetCategory,
  type MarketAsset,
  type TimePeriod,
} from './market-data.js';
import { renderAskPanelView } from './views/ask-panel.js';
import {
  renderExplorerView,
  type ExplorerCategoryFilter,
  type ExplorerScopeFilter,
  type ExplorerSortKey,
} from './views/explorer-view.js';
import { createIngestModal, type IngestModalController } from './views/ingest-modal.js';
import { renderLedgerView, type LedgerViewState } from './views/ledger-view.js';
import { renderOverviewView } from './views/overview-view.js';

export type FinScopeTab = 'overview' | 'explorer' | 'ledger' | 'ask' | 'story';

declare global {
  interface Window {
    __FINSCOPE__?: FinScopeApp;
  }
}

export class FinScopeApp {
  private readonly rootEl: HTMLElement;
  private readonly initialBundle: DatasetBundle;
  private activeBundle: DatasetBundle;

  private readonly assets: MarketAsset[];
  private holdingsMap: Record<string, number>;
  private watchlist: string[];

  private activeTab: FinScopeTab = 'overview';
  private period: TimePeriod = '1Y';
  private compareBenchmark = false;
  private simRunning = true;
  private simTickCount = 0;
  private simTimer: ReturnType<typeof setInterval> | null = null;

  // Explorer state
  private selectedSymbol = 'NVDA';
  private compareSymbol = '';
  private categoryFilter: ExplorerCategoryFilter = 'all';
  private scopeFilter: ExplorerScopeFilter = 'all';
  private sortKey: ExplorerSortKey = 'marketCap';
  private explorerSearch = '';

  // Ledger state
  private ledgerState: LedgerViewState = {
    searchQuery: '',
    categoryFilter: '',
    directionFilter: 'all',
    sortKey: 'date_desc',
    visibleLimit: 35,
  };

  // Ask state
  private lastAskQuestion = '';
  private lastAskResult: AskQueryResult | null = null;

  // DOM & Sub-controllers
  private mainEl!: HTMLElement;
  private receiptsDrawer!: ReceiptsDrawer;
  private ingestModal!: IngestModalController;
  private storyPlayer: StoryPlayer | null = null;
  private storyHostEl: HTMLElement | null = null;

  constructor(rootEl: HTMLElement, initialBundle: DatasetBundle) {
    this.rootEl = rootEl;
    this.initialBundle = initialBundle;
    this.activeBundle = initialBundle;

    this.assets = createInitialMarketAssets();
    this.holdingsMap = loadSavedHoldings(this.assets);
    this.watchlist = loadSavedWatchlist();

    if (typeof document !== 'undefined') {
      document.body.classList.add('finscope-mode');
      document.body.classList.remove('film');
    }

    this.buildShell();
    this.receiptsDrawer = new ReceiptsDrawer(this.rootEl, this.activeBundle.transactions);
    if (this.activeBundle.plan.business_meta?.currency_symbol) {
      this.receiptsDrawer.currencySymbol = this.activeBundle.plan.business_meta.currency_symbol;
    }

    this.ingestModal = createIngestModal(this.rootEl, {
      onDatasetLoaded: (bundle) => this.handleDatasetLoaded(bundle),
      onResetSamplePersonal: () => this.handleDatasetLoaded(this.initialBundle),
    });

    this.renderActiveView();
    this.startSimLoop();

    if (typeof window !== 'undefined') {
      window.__FINSCOPE__ = this;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.receiptsDrawer.close();
          this.ingestModal.close();
        }
      });
    }

    this.rootEl.dataset.ready = 'true';
    this.rootEl.dataset.app = 'finscope';
    this.rootEl.dataset.transactions = String(this.activeBundle.transactions.length);
  }

  private buildShell(): void {
    const navItems: Array<{ id: FinScopeTab; label: string }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'explorer', label: 'Asset Explorer' },
      { id: 'ledger', label: 'Ledger' },
      { id: 'ask', label: 'Ask AI' },
      { id: 'story', label: 'Story Mode' },
    ];

    this.rootEl.innerHTML = `
      <div class="fs-shell">
        <header class="fs-topbar" data-testid="finscope-topbar">
          <a class="fs-brand" id="fs-brand-link" href="#overview">FinScope</a>
          <nav class="fs-nav" aria-label="Primary navigation">
            ${navItems
              .map(
                (n) =>
                  `<button type="button" class="fs-nav-link ${n.id === this.activeTab ? 'is-active' : ''}" data-nav-tab="${n.id}" data-testid="nav-tab-${n.id}">${n.label}</button>`
              )
              .join('')}
          </nav>
          <div class="fs-topbar-actions">
            <button type="button" class="fs-btn fs-btn-primary fs-btn-sm" id="fs-topbar-import-btn" data-testid="topbar-import-btn">Import Data</button>
          </div>
        </header>

        <nav class="fs-mobile-tabs" aria-label="Mobile navigation">
          ${navItems
            .map(
              (n) =>
                `<button type="button" class="fs-seg-tab ${n.id === this.activeTab ? 'is-active' : ''}" data-nav-tab="${n.id}">${n.label}</button>`
            )
            .join('')}
        </nav>

        <main class="fs-main" id="fs-main"></main>
      </div>
    `;

    this.mainEl = this.rootEl.querySelector<HTMLElement>('#fs-main')!;

    this.rootEl.querySelector('#fs-brand-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.navigateTab('overview');
    });

    this.rootEl.querySelectorAll<HTMLButtonElement>('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.navTab as FinScopeTab;
        this.navigateTab(tab);
      });
    });

    this.rootEl.querySelector('#fs-topbar-import-btn')?.addEventListener('click', () => {
      this.ingestModal.open();
    });
  }

  public navigateTab(tab: FinScopeTab): void {
    if (this.activeTab === 'story' && tab !== 'story' && this.storyPlayer) {
      this.storyPlayer.timeline.pause();
    }
    this.activeTab = tab;
    this.rootEl.querySelectorAll<HTMLButtonElement>('[data-nav-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.navTab === tab);
    });
    this.renderActiveView();
  }

  private handleDatasetLoaded(bundle: DatasetBundle): void {
    this.activeBundle = bundle;
    this.lastAskResult = null;
    this.ledgerState = {
      searchQuery: '',
      categoryFilter: '',
      directionFilter: 'all',
      sortKey: 'date_desc',
      visibleLimit: 35,
    };
    this.receiptsDrawer.setTransactions(
      bundle.transactions,
      bundle.plan.business_meta?.currency_symbol ?? 'US$'
    );
    this.rootEl.dataset.transactions = String(bundle.transactions.length);

    if (this.storyPlayer) {
      this.storyPlayer.loadDataset(bundle, false);
    }
    if (this.activeTab !== 'ledger' && this.activeTab !== 'story') {
      this.navigateTab('ledger');
    } else {
      this.renderActiveView();
    }
  }

  private toggleWatchlist(symbol: string): void {
    const idx = this.watchlist.indexOf(symbol);
    if (idx >= 0) {
      this.watchlist.splice(idx, 1);
    } else {
      this.watchlist.unshift(symbol);
    }
    saveWatchlist(this.watchlist);
    this.renderActiveView();
  }

  private updateHolding(symbol: string, shares: number): void {
    if (shares <= 0) {
      delete this.holdingsMap[symbol];
    } else {
      this.holdingsMap[symbol] = shares;
    }
    saveHoldings(this.holdingsMap);
    this.renderActiveView();
  }

  private startSimLoop(): void {
    if (this.simTimer) clearInterval(this.simTimer);
    this.simTimer = setInterval(() => {
      if (!this.simRunning) return;
      // Avoid interrupting user typing in search or numeric inputs
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'select' || activeTag === 'textarea') {
        return;
      }
      if (this.activeTab !== 'overview' && this.activeTab !== 'explorer') {
        return;
      }
      this.simTickCount += 1;
      stepSimulatedMarketPrices(this.assets, this.simTickCount);
      this.renderActiveView();
    }, 5000);
  }

  private renderActiveView(): void {
    // Capture search input focus/caret if active inside mainEl
    const focused = document.activeElement as HTMLInputElement | null;
    const focusedId = focused && this.mainEl.contains(focused) ? focused.id : '';
    const selStart = focused && typeof focused.selectionStart === 'number' ? focused.selectionStart : null;

    if (this.activeTab === 'overview') {
      renderOverviewView(this.mainEl, {
        assets: this.assets,
        holdingsMap: this.holdingsMap,
        watchlist: this.watchlist,
        period: this.period,
        compareBenchmark: this.compareBenchmark,
        simRunning: this.simRunning,
        bundle: this.activeBundle,
        onSelectPeriod: (p) => {
          this.period = p;
          this.renderActiveView();
        },
        onToggleBenchmark: () => {
          this.compareBenchmark = !this.compareBenchmark;
          this.renderActiveView();
        },
        onToggleSim: () => {
          this.simRunning = !this.simRunning;
          this.renderActiveView();
        },
        onResetPortfolio: () => {
          this.holdingsMap = getDefaultHoldingsMap(this.assets);
          saveHoldings(this.holdingsMap);
          this.renderActiveView();
        },
        onSelectAsset: (sym) => {
          this.selectedSymbol = sym;
          this.navigateTab('explorer');
        },
        onSelectCategory: (cat: AssetCategory) => {
          this.categoryFilter = cat;
          const firstInCat = this.assets.find((a) => a.category === cat);
          if (firstInCat) this.selectedSymbol = firstInCat.symbol;
          this.navigateTab('explorer');
        },
        onToggleWatchlist: (sym) => this.toggleWatchlist(sym),
        onNavigateTab: (tab) => this.navigateTab(tab),
        onOpenImport: () => this.ingestModal.open(),
      });
    } else if (this.activeTab === 'explorer') {
      renderExplorerView(this.mainEl, {
        assets: this.assets,
        holdingsMap: this.holdingsMap,
        watchlist: this.watchlist,
        selectedSymbol: this.selectedSymbol,
        compareSymbol: this.compareSymbol,
        categoryFilter: this.categoryFilter,
        scopeFilter: this.scopeFilter,
        sortKey: this.sortKey,
        searchQuery: this.explorerSearch,
        period: this.period,
        onSelectCategory: (cat) => {
          this.categoryFilter = cat;
          this.renderActiveView();
        },
        onSelectScope: (scope) => {
          this.scopeFilter = scope;
          this.renderActiveView();
        },
        onChangeSort: (sort) => {
          this.sortKey = sort;
          this.renderActiveView();
        },
        onChangeSearch: (q) => {
          this.explorerSearch = q;
          this.renderActiveView();
        },
        onSelectAsset: (sym) => {
          this.selectedSymbol = sym;
          if (this.compareSymbol === sym) this.compareSymbol = '';
          this.renderActiveView();
        },
        onSelectCompare: (sym) => {
          this.compareSymbol = sym;
          this.renderActiveView();
        },
        onSelectPeriod: (p) => {
          this.period = p;
          this.renderActiveView();
        },
        onToggleWatchlist: (sym) => this.toggleWatchlist(sym),
        onUpdateHolding: (sym, shares) => this.updateHolding(sym, shares),
      });
    } else if (this.activeTab === 'ledger') {
      renderLedgerView(this.mainEl, {
        bundle: this.activeBundle,
        state: this.ledgerState,
        onUpdateState: (patch) => {
          this.ledgerState = { ...this.ledgerState, ...patch };
          this.renderActiveView();
        },
        onOpenReceipts: (title, ids) => this.receiptsDrawer.open(title, ids),
        onOpenImport: () => this.ingestModal.open(),
        onOpenAsk: (q) => {
          if (q) this.lastAskQuestion = q;
          this.navigateTab('ask');
        },
        onOpenStory: () => this.navigateTab('story'),
      });
    } else if (this.activeTab === 'ask') {
      renderAskPanelView(this.mainEl, {
        bundle: this.activeBundle,
        initialQuestion: this.lastAskQuestion || undefined,
        lastResult: this.lastAskResult,
        onResultChange: (q, res) => {
          this.lastAskQuestion = q;
          this.lastAskResult = res;
        },
        onOpenReceipts: (title, ids) => this.receiptsDrawer.open(title, ids),
      });
    } else if (this.activeTab === 'story') {
      this.renderStoryMode();
    }

    // Restore focus if search input was active
    if (focusedId) {
      const nextInput = this.mainEl.querySelector<HTMLInputElement>(`#${focusedId}`);
      if (nextInput) {
        nextInput.focus();
        if (selStart !== null) {
          try {
            nextInput.setSelectionRange(selStart, selStart);
          } catch {
            // Ignore selection errors for non-text inputs
          }
        }
      }
    }
  }

  private renderStoryMode(): void {
    this.mainEl.innerHTML = `
      <div class="fs-page fs-story-shell" data-testid="finscope-story">
        <div class="fs-story-bar">
          <div>
            <h2 class="fs-card-title">Executive Story Mode</h2>
            <p class="fs-card-meta">Animated 120 BPM ledger film, 53×7 interactive grid, and shareable PNG cards</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="fs-btn fs-btn-ghost fs-btn-sm" id="fs-story-explore-btn">Open 53×7 Grid Explore</button>
            <button type="button" class="fs-btn fs-btn-primary fs-btn-sm" id="fs-story-exit-btn">← Return to Dashboard</button>
          </div>
        </div>
        <div class="fs-story-mount" id="fs-story-mount"></div>
      </div>
    `;

    this.storyHostEl = this.mainEl.querySelector<HTMLElement>('#fs-story-mount')!;
    this.storyPlayer = new StoryPlayer(this.storyHostEl, this.activeBundle);
    registerBespokeChapters(this.storyPlayer);

    // Ensure FinScope body scrolling remains intact even after StoryPlayer injects its base style
    document.body.classList.add('finscope-mode');
    this.storyPlayer.byoMode = false;
    this.storyPlayer.startStory();

    this.mainEl.querySelector('#fs-story-exit-btn')?.addEventListener('click', () => {
      this.navigateTab('overview');
    });
    this.mainEl.querySelector('#fs-story-explore-btn')?.addEventListener('click', () => {
      this.storyPlayer?.openExplore();
    });
  }
}
