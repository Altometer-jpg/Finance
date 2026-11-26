import http from 'node:http';
import path from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiHandler } from '../server/index.js';
import {
  TIME_PERIODS,
  computePortfolioSummary,
  createInitialMarketAssets,
  getAssetPeriodReturnPct,
  getDefaultHoldingsMap,
} from '../src/finscope/market-data.js';

const APP_ROOT = path.resolve(import.meta.dirname, '..');

describe('FinScope — Financial Intelligence Dashboard E2E & Data Tests', () => {
  describe('Market Data & Portfolio Calculation Unit Tests', () => {
    it('creates 20 simulated assets across Stocks, Crypto, ETFs, and Commodities with all 7 time periods', () => {
      const assets = createInitialMarketAssets();
      expect(assets.length).toBe(20);
      const categories = new Set(assets.map((a) => a.category));
      expect(categories).toEqual(new Set(['stocks', 'crypto', 'etfs', 'commodities']));

      for (const asset of assets) {
        for (const period of TIME_PERIODS) {
          expect(asset.seriesByPeriod[period].length).toBeGreaterThanOrEqual(20);
        }
      }
    });

    it('computes coherent portfolio summary, P/L, allocations, and rankings across time periods', () => {
      const assets = createInitialMarketAssets();
      const holdings = getDefaultHoldingsMap(assets);
      const summary = computePortfolioSummary(assets, holdings, '1Y');

      expect(summary.totalValue).toBeGreaterThan(100000);
      expect(summary.totalCostBasis).toBeGreaterThan(0);
      expect(Math.abs(summary.totalProfitLoss - (summary.totalValue - summary.totalCostBasis))).toBeLessThan(0.05);
      expect(summary.allocations.reduce((acc, a) => acc + a.weightPct, 0)).toBeCloseTo(100, 1);
      expect(summary.topPerformers.length).toBe(4);
      expect(summary.underperformers.length).toBe(4);
      expect(getAssetPeriodReturnPct(summary.topPerformers[0]!.asset, '1Y')).toBeGreaterThan(
        getAssetPeriodReturnPct(summary.underperformers[0]!.asset, '1Y')
      );
    });
  });

  describe('Browser Interactive & Responsive Verification (Playwright)', () => {
    let viteServer: ViteDevServer;
    let httpServer: http.Server;
    let baseUrl = '';
    let browser: Browser;
    let page: Page;
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];

    beforeAll(async () => {
      const handleApi = createApiHandler();
      viteServer = await createServer({
        root: APP_ROOT,
        logLevel: 'silent',
        server: { middlewareMode: true },
        appType: 'spa',
      });
      httpServer = http.createServer(async (req, res) => {
        const handled = await handleApi(req, res);
        if (!handled) {
          viteServer.middlewares(req, res);
        }
      });
      await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
      const addr = httpServer.address();
      const port = typeof addr === 'object' && addr ? addr.port : 4173;
      baseUrl = `http://127.0.0.1:${port}`;

      const fs = await import('node:fs');
      const fallbackExec =
        '/ms-playwright/chromium_headless_shell-1247/chrome-headless-shell-linux64/chrome-headless-shell';
      browser = await chromium.launch({
        headless: true,
        ...(fs.existsSync(fallbackExec) ? { executablePath: fallbackExec } : {}),
      });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      });
      page = await context.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });
      page.on('request', (req) => {
        const url = req.url();
        if (!url.startsWith(baseUrl) && !url.startsWith('data:') && !url.startsWith('blob:')) {
          externalRequests.push(url);
        }
      });

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.waitForSelector('#app[data-ready="true"][data-app="finscope"]', { timeout: 10000 });
    }, 30000);

    afterAll(async () => {
      if (browser) await browser.close();
      if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (viteServer) await viteServer.close();
    });

    it('renders Overview dashboard with KPIs, charts, allocation donut, movers, and watchlist', async () => {
      const overview = page.locator('[data-testid="finscope-overview"]');
      await expect(overview.isVisible()).resolves.toBe(true);

      const portfolioVal = await page.locator('[data-testid="kpi-portfolio-value"]').textContent();
      const totalPl = await page.locator('[data-testid="kpi-total-pl"]').textContent();
      const dailyChg = await page.locator('[data-testid="kpi-daily-change"]').textContent();
      const ledgerNet = await page.locator('[data-testid="kpi-ledger-cashflow"]').textContent();

      expect(portfolioVal).toContain('$');
      expect(totalPl).toContain('$');
      expect(dailyChg).toContain('%');
      expect(ledgerNet).toContain('$');

      // Period selector buttons (1D, 1W, 1M, 3M, 6M, 1Y, ALL)
      for (const period of ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL']) {
        await page.locator(`[data-testid="overview-period-${period}"]`).click();
        const isActive = await page
          .locator(`[data-testid="overview-period-${period}"]`)
          .evaluate((el) => el.classList.contains('is-active'));
        expect(isActive).toBe(true);
      }

      // Benchmark comparison toggle
      await page.locator('[data-testid="benchmark-toggle-btn"]').click();
      const benchActive = await page
        .locator('[data-testid="benchmark-toggle-btn"]')
        .evaluate((el) => el.classList.contains('is-active'));
      expect(benchActive).toBe(true);

      // SVG charts rendered
      const lineSvgCount = await page.locator('#fs-overview-line-chart svg').count();
      const donutSvgCount = await page.locator('#fs-overview-donut-chart svg').count();
      expect(lineSvgCount).toBe(1);
      expect(donutSvgCount).toBe(1);
    });

    it('supports Asset Explorer category tabs, search, comparison, position simulation, and localStorage watchlist', async () => {
      await page.locator('[data-testid="nav-tab-explorer"]').click();
      await page.waitForSelector('[data-testid="finscope-explorer"]');

      // Filter by Crypto
      await page.locator('[data-testid="explorer-cat-crypto"]').click();
      const btcRowVisible = await page.locator('[data-testid="explorer-row-BTC"]').isVisible();
      expect(btcRowVisible).toBe(true);

      // Search for Solana
      await page.locator('[data-testid="explorer-search-input"]').fill('Solana');
      const solVisible = await page.locator('[data-testid="explorer-row-SOL"]').isVisible();
      expect(solVisible).toBe(true);

      // Select SOL, toggle watchlist, compare vs BTC, update shares
      await page.locator('[data-testid="explorer-row-SOL"]').click();
      const detailTitle = await page.locator('[data-testid="asset-detail-panel"]').textContent();
      expect(detailTitle).toContain('SOL — Solana');

      await page.locator('[data-testid="compare-asset-select"]').selectOption('BTC');
      const compareText = await page.locator('[data-testid="asset-detail-panel"]').textContent();
      expect(compareText).toContain('Normalized');

      await page.locator('[data-testid="detail-watchlist-btn"]').click();
      const btnText = await page.locator('[data-testid="detail-watchlist-btn"]').textContent();
      expect(btnText).toContain('In Watchlist');

      // Update simulated position
      await page.locator('[data-testid="shares-input"]').fill('25');
      await page.locator('[data-testid="update-position-btn"]').click();
      const updatedPanel = await page.locator('[data-testid="asset-detail-panel"]').textContent();
      expect(updatedPanel).toContain('$');

      // Reload page and confirm Watchlist persisted in localStorage
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="finscope-overview"]');
      const solInOverviewWatchlist = await page
        .locator('[data-testid="watchlist-row-SOL"]')
        .isVisible();
      expect(solInOverviewWatchlist).toBe(true);
    });

    it('preserves Ledger & Cashflow heatmap, Receipts Drawer, Ask AI, Sample B2B Ingestion, and Story Mode', async () => {
      // Ledger view & heatmap -> ReceiptsDrawer
      await page.locator('[data-testid="nav-tab-ledger"]').click();
      await page.waitForSelector('[data-testid="finscope-ledger"]');
      await page.locator('[data-testid="ledger-heatmap-grid"] .fs-hm-cell').nth(10).click();
      const drawerVisible = await page.locator('[data-testid="receipts-drawer"]').isVisible();
      expect(drawerVisible).toBe(true);
      await page.locator('[data-testid="close-receipts-btn"]').click();

      // Ask AI view
      await page.locator('[data-testid="nav-tab-ask"]').click();
      await page.waitForSelector('[data-testid="finscope-ask"]');
      await page
        .locator('[data-testid="finscope-ask-input"]')
        .fill('How many times did I visit Blue Bottle Coffee?');
      await page.locator('[data-testid="finscope-ask-submit"]').click();
      const askAns = await page.locator('[data-testid="finscope-ask-answer"]').textContent();
      expect(askAns).toContain('72');

      // Import Data Modal -> load Nimbus Cloud SaaS FY2025 B2B sample
      await page.locator('[data-testid="topbar-import-btn"]').click();
      await page.waitForSelector('[data-testid="ingest-modal"]');
      await page.locator('[data-testid="load-nimbus-sample-btn"]').click();
      await page.waitForSelector('[data-testid="finscope-ledger"]');
      const ledgerText = await page.locator('[data-testid="finscope-ledger"]').textContent();
      expect(ledgerText).toContain('Nimbus');
      expect(ledgerText).toContain('505 verified ledger lines');

      // Story Mode view
      await page.locator('[data-testid="nav-tab-story"]').click();
      await page.waitForSelector('[data-testid="finscope-story"]');
      const stageVisible = await page.locator('[data-testid="player-stage"]').isVisible();
      expect(stageVisible).toBe(true);
    }, 15000);

    it('renders cleanly on mobile (390x844) without horizontal overflow or runtime errors', async () => {
      await page.locator('[data-testid="nav-tab-overview"]').click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForSelector('[data-testid="finscope-overview"]');

      const overflowCheck = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflowCheck.scrollWidth).toBeLessThanOrEqual(overflowCheck.innerWidth + 2);

      expect(consoleErrors).toEqual([]);
      expect(pageErrors).toEqual([]);
      expect(externalRequests).toEqual([]);
    });
  });
});
