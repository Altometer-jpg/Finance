/**
 * FinScope Simulated Market & Portfolio Data Engine (`src/finscope/market-data.ts`)
 *
 * Provides deterministic, mathematically coherent simulated market data across
 * Stocks, Crypto, ETFs, and Commodities, plus localStorage-persisted Watchlist
 * and simulated Portfolio Holdings. Clearly labeled as Simulated Demo Data.
 */

export type AssetCategory = 'stocks' | 'crypto' | 'etfs' | 'commodities';
export type TimePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

export const TIME_PERIODS: readonly TimePeriod[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

export const ASSET_CATEGORY_META: Record<
  AssetCategory,
  { label: string; color: string; shortLabel: string }
> = {
  stocks: { label: 'Stocks', color: '#10B981', shortLabel: 'Equities' },
  etfs: { label: 'ETFs', color: '#38BDF8', shortLabel: 'Index ETFs' },
  crypto: { label: 'Crypto', color: '#A78BFA', shortLabel: 'Digital Assets' },
  commodities: { label: 'Commodities', color: '#F59E0B', shortLabel: 'Commodities' },
};

export interface PricePoint {
  label: string;
  price: number;
}

export interface MarketAsset {
  symbol: string;
  name: string;
  category: AssetCategory;
  sector: string;
  exchange: string;
  basePrice: number;
  price: number;
  prevClose: number;
  change24h: number;
  changePct24h: number;
  marketCap: string;
  marketCapNumericB: number;
  volume24h: string;
  high52w: number;
  low52w: number;
  metricLabel: string;
  metricValue: string;
  description: string;
  defaultShares: number;
  avgCost: number;
  seriesByPeriod: Record<TimePeriod, PricePoint[]>;
}

export interface PortfolioAllocationSlice {
  category: AssetCategory;
  label: string;
  color: string;
  valueUsd: number;
  costBasisUsd: number;
  weightPct: number;
  assetCount: number;
}

export interface EnrichedHolding {
  asset: MarketAsset;
  shares: number;
  marketValue: number;
  costBasis: number;
  profitLossUsd: number;
  profitLossPct: number;
  dailyChangeUsd: number;
  periodReturnPct: number;
  weightPct: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalProfitLoss: number;
  totalProfitLossPct: number;
  dailyChangeUsd: number;
  dailyChangePct: number;
  periodChangeUsd: number;
  periodChangePct: number;
  holdings: EnrichedHolding[];
  allocations: PortfolioAllocationSlice[];
  topPerformers: Array<{ asset: MarketAsset; returnPct: number; changeUsd: number }>;
  underperformers: Array<{ asset: MarketAsset; returnPct: number; changeUsd: number }>;
  portfolioSeries: PricePoint[];
  benchmarkSeries: PricePoint[];
}

interface RawAssetSeed {
  symbol: string;
  name: string;
  category: AssetCategory;
  sector: string;
  exchange: string;
  price: number;
  dailyPct: number;
  annualReturnPct: number;
  allReturnPct: number;
  volatility: number;
  marketCap: string;
  marketCapNumericB: number;
  volume24h: string;
  metricLabel: string;
  metricValue: string;
  description: string;
  defaultShares: number;
  avgCost: number;
  seed: number;
}

const RAW_ASSET_SEEDS: readonly RawAssetSeed[] = [
  // Stocks (7)
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'stocks',
    sector: 'Semiconductors',
    exchange: 'NASDAQ',
    price: 142.65,
    dailyPct: 3.18,
    annualReturnPct: 74.2,
    allReturnPct: 412.5,
    volatility: 0.026,
    marketCap: '$3.49T',
    marketCapNumericB: 3490,
    volume24h: '$41.2B',
    metricLabel: 'P/E Ratio',
    metricValue: '48.4x',
    description: 'Accelerated computing, data center GPU architectures, and enterprise AI infrastructure.',
    defaultShares: 310,
    avgCost: 96.4,
    seed: 101,
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    category: 'stocks',
    sector: 'Cloud & Software',
    exchange: 'NASDAQ',
    price: 448.9,
    dailyPct: 1.12,
    annualReturnPct: 21.8,
    allReturnPct: 96.4,
    volatility: 0.015,
    marketCap: '$3.34T',
    marketCapNumericB: 3340,
    volume24h: '$14.8B',
    metricLabel: 'P/E Ratio',
    metricValue: '34.1x',
    description: 'Enterprise cloud platform (Azure), productivity suites, and commercial software.',
    defaultShares: 82,
    avgCost: 372.5,
    seed: 102,
  },
  {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    category: 'stocks',
    sector: 'Consumer Hardware',
    exchange: 'NASDAQ',
    price: 231.4,
    dailyPct: 0.74,
    annualReturnPct: 18.6,
    allReturnPct: 72.1,
    volatility: 0.014,
    marketCap: '$3.51T',
    marketCapNumericB: 3510,
    volume24h: '$11.9B',
    metricLabel: 'P/E Ratio',
    metricValue: '33.2x',
    description: 'Consumer ecosystems, silicon engineering, and recurring services revenue.',
    defaultShares: 120,
    avgCost: 194.2,
    seed: 103,
  },
  {
    symbol: 'AMZN',
    name: 'Amazon.com Inc.',
    category: 'stocks',
    sector: 'Cloud & Commerce',
    exchange: 'NASDAQ',
    price: 214.35,
    dailyPct: 1.85,
    annualReturnPct: 32.4,
    allReturnPct: 88.3,
    volatility: 0.019,
    marketCap: '$2.25T',
    marketCapNumericB: 2250,
    volume24h: '$10.4B',
    metricLabel: 'P/E Ratio',
    metricValue: '41.7x',
    description: 'AWS cloud infrastructure, logistics fulfillment, and digital advertising.',
    defaultShares: 105,
    avgCost: 171.8,
    seed: 104,
  },
  {
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    category: 'stocks',
    sector: 'Search & Cloud',
    exchange: 'NASDAQ',
    price: 184.7,
    dailyPct: -0.62,
    annualReturnPct: 24.5,
    allReturnPct: 79.0,
    volatility: 0.017,
    marketCap: '$2.27T',
    marketCapNumericB: 2270,
    volume24h: '$8.6B',
    metricLabel: 'P/E Ratio',
    metricValue: '23.8x',
    description: 'Search, YouTube digital media, autonomous systems, and Google Cloud.',
    defaultShares: 0,
    avgCost: 158.0,
    seed: 105,
  },
  {
    symbol: 'JPM',
    name: 'JPMorgan Chase & Co.',
    category: 'stocks',
    sector: 'Banking & Markets',
    exchange: 'NYSE',
    price: 246.1,
    dailyPct: 0.45,
    annualReturnPct: 29.3,
    allReturnPct: 84.5,
    volatility: 0.014,
    marketCap: '$692B',
    marketCapNumericB: 692,
    volume24h: '$3.2B',
    metricLabel: 'Div Yield',
    metricValue: '2.18%',
    description: 'Global investment banking, commercial treasury services, and asset management.',
    defaultShares: 70,
    avgCost: 196.4,
    seed: 106,
  },
  {
    symbol: 'TSLA',
    name: 'Tesla, Inc.',
    category: 'stocks',
    sector: 'EV & Energy',
    exchange: 'NASDAQ',
    price: 318.25,
    dailyPct: -2.41,
    annualReturnPct: 16.4,
    allReturnPct: 48.2,
    volatility: 0.036,
    marketCap: '$1.01T',
    marketCapNumericB: 1010,
    volume24h: '$26.7B',
    metricLabel: 'P/E Ratio',
    metricValue: '79.2x',
    description: 'Electric vehicles, utility-scale grid storage, and autonomous fleet software.',
    defaultShares: 35,
    avgCost: 342.0,
    seed: 107,
  },

  // Crypto (5)
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'crypto',
    sector: 'Layer 1 Network',
    exchange: 'SPOT',
    price: 94280.0,
    dailyPct: 2.64,
    annualReturnPct: 68.4,
    allReturnPct: 242.0,
    volatility: 0.032,
    marketCap: '$1.86T',
    marketCapNumericB: 1860,
    volume24h: '$44.8B',
    metricLabel: 'Dominance',
    metricValue: '56.4%',
    description: 'Decentralized proof-of-work settlement network and institutional digital reserve asset.',
    defaultShares: 0.42,
    avgCost: 68400.0,
    seed: 201,
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    category: 'crypto',
    sector: 'Smart Contracts',
    exchange: 'SPOT',
    price: 3412.5,
    dailyPct: 1.48,
    annualReturnPct: 28.9,
    allReturnPct: 118.4,
    volatility: 0.035,
    marketCap: '$411B',
    marketCapNumericB: 411,
    volume24h: '$21.4B',
    metricLabel: 'Staked Supply',
    metricValue: '28.2%',
    description: 'Programmable proof-of-stake settlement layer powering DeFi and L2 rollups.',
    defaultShares: 4.5,
    avgCost: 2780.0,
    seed: 202,
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    category: 'crypto',
    sector: 'High-Throughput L1',
    exchange: 'SPOT',
    price: 214.8,
    dailyPct: 4.12,
    annualReturnPct: 92.6,
    allReturnPct: 380.2,
    volatility: 0.044,
    marketCap: '$101B',
    marketCapNumericB: 101,
    volume24h: '$6.9B',
    metricLabel: 'TPS Avg',
    metricValue: '3,420',
    description: 'Monolithic high-throughput blockchain optimized for low-latency orderbooks and consumer apps.',
    defaultShares: 0,
    avgCost: 165.0,
    seed: 203,
  },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    category: 'crypto',
    sector: 'Subnet L1',
    exchange: 'SPOT',
    price: 36.4,
    dailyPct: -1.86,
    annualReturnPct: -8.4,
    allReturnPct: 24.5,
    volatility: 0.045,
    marketCap: '$14.9B',
    marketCapNumericB: 14.9,
    volume24h: '$680M',
    metricLabel: 'Finality',
    metricValue: '< 1.0s',
    description: 'Multi-chain smart contract platform supporting institutional subnets and tokenized assets.',
    defaultShares: 160,
    avgCost: 42.1,
    seed: 204,
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    category: 'crypto',
    sector: 'Oracle Infrastructure',
    exchange: 'SPOT',
    price: 19.85,
    dailyPct: 0.92,
    annualReturnPct: 31.2,
    allReturnPct: 94.0,
    volatility: 0.038,
    marketCap: '$12.4B',
    marketCapNumericB: 12.4,
    volume24h: '$590M',
    metricLabel: 'TVS Secured',
    metricValue: '$28.4B',
    description: 'Decentralized data oracle network and Cross-Chain Interoperability Protocol (CCIP).',
    defaultShares: 0,
    avgCost: 15.6,
    seed: 205,
  },

  // ETFs (4)
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    category: 'etfs',
    sector: 'US Large Cap',
    exchange: 'NYSE ARCA',
    price: 598.4,
    dailyPct: 0.68,
    annualReturnPct: 23.4,
    allReturnPct: 54.8,
    volatility: 0.009,
    marketCap: '$618B',
    marketCapNumericB: 618,
    volume24h: '$29.4B',
    metricLabel: 'Expense Ratio',
    metricValue: '0.09%',
    description: 'Benchmark exchange-traded fund tracking the S&P 500 large-cap US equity index.',
    defaultShares: 68,
    avgCost: 502.0,
    seed: 301,
  },
  {
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    category: 'etfs',
    sector: 'Nasdaq-100 Growth',
    exchange: 'NASDAQ',
    price: 514.2,
    dailyPct: 1.04,
    annualReturnPct: 28.7,
    allReturnPct: 76.2,
    volatility: 0.013,
    marketCap: '$312B',
    marketCapNumericB: 312,
    volume24h: '$18.7B',
    metricLabel: 'Expense Ratio',
    metricValue: '0.20%',
    description: 'Tracks the 100 largest non-financial companies listed on the Nasdaq Stock Market.',
    defaultShares: 52,
    avgCost: 428.5,
    seed: 302,
  },
  {
    symbol: 'VTI',
    name: 'Vanguard Total Stock Market ETF',
    category: 'etfs',
    sector: 'US Total Market',
    exchange: 'NYSE ARCA',
    price: 294.75,
    dailyPct: 0.59,
    annualReturnPct: 22.1,
    allReturnPct: 51.3,
    volatility: 0.009,
    marketCap: '$458B',
    marketCapNumericB: 458,
    volume24h: '$1.3B',
    metricLabel: 'Expense Ratio',
    metricValue: '0.03%',
    description: 'Broad-market exposure spanning large-, mid-, and small-cap US equities.',
    defaultShares: 0,
    avgCost: 256.0,
    seed: 303,
  },
  {
    symbol: 'TLT',
    name: 'iShares 20+ Year Treasury Bond ETF',
    category: 'etfs',
    sector: 'Long Duration Bonds',
    exchange: 'NASDAQ',
    price: 91.6,
    dailyPct: -0.94,
    annualReturnPct: -6.2,
    allReturnPct: -14.8,
    volatility: 0.011,
    marketCap: '$58B',
    marketCapNumericB: 58,
    volume24h: '$3.9B',
    metricLabel: '30D SEC Yield',
    metricValue: '4.48%',
    description: 'Exposure to long-dated US Treasury bonds with remaining maturities over 20 years.',
    defaultShares: 120,
    avgCost: 96.8,
    seed: 304,
  },

  // Commodities (4)
  {
    symbol: 'GLD',
    name: 'SPDR Gold Shares (XAU)',
    category: 'commodities',
    sector: 'Precious Metals',
    exchange: 'NYSE ARCA',
    price: 252.3,
    dailyPct: 0.88,
    annualReturnPct: 29.4,
    allReturnPct: 62.7,
    volatility: 0.009,
    marketCap: '$76B',
    marketCapNumericB: 76,
    volume24h: '$1.9B',
    metricLabel: 'Spot Equiv',
    metricValue: '$2,732/oz',
    description: 'Physically backed gold bullion trust tracking spot London Gold PM Fix prices.',
    defaultShares: 92,
    avgCost: 208.5,
    seed: 401,
  },
  {
    symbol: 'SLV',
    name: 'iShares Silver Trust (XAG)',
    category: 'commodities',
    sector: 'Precious Metals',
    exchange: 'NYSE ARCA',
    price: 29.45,
    dailyPct: 1.32,
    annualReturnPct: 26.8,
    allReturnPct: 48.9,
    volatility: 0.018,
    marketCap: '$15.2B',
    marketCapNumericB: 15.2,
    volume24h: '$610M',
    metricLabel: 'Spot Equiv',
    metricValue: '$32.18/oz',
    description: 'Physical silver bullion exposure reflecting industrial solar and monetary demand.',
    defaultShares: 210,
    avgCost: 25.4,
    seed: 402,
  },
  {
    symbol: 'USO',
    name: 'WTI Crude Oil Fund',
    category: 'commodities',
    sector: 'Energy Futures',
    exchange: 'NYSE ARCA',
    price: 73.15,
    dailyPct: -1.45,
    annualReturnPct: -5.8,
    allReturnPct: 9.4,
    volatility: 0.022,
    marketCap: '$1.4B',
    marketCapNumericB: 1.4,
    volume24h: '$340M',
    metricLabel: 'WTI Front',
    metricValue: '$70.40/bbl',
    description: 'Tracks front-month West Texas Intermediate light sweet crude oil futures.',
    defaultShares: 0,
    avgCost: 77.2,
    seed: 403,
  },
  {
    symbol: 'COPX',
    name: 'Global Copper Miners & HG',
    category: 'commodities',
    sector: 'Industrial Metals',
    exchange: 'NYSE ARCA',
    price: 43.8,
    dailyPct: -0.41,
    annualReturnPct: 14.2,
    allReturnPct: 38.6,
    volatility: 0.019,
    marketCap: '$2.8B',
    marketCapNumericB: 2.8,
    volume24h: '$125M',
    metricLabel: 'HG Copper',
    metricValue: '$4.28/lb',
    description: 'Exposure to global copper mining equities tied to grid electrification demand.',
    defaultShares: 0,
    avgCost: 39.5,
    seed: 404,
  },
];

function createPrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function roundPrice(val: number): number {
  if (val >= 1000) return Math.round(val * 100) / 100;
  if (val >= 10) return Math.round(val * 100) / 100;
  return Math.round(val * 1000) / 1000;
}

function buildPeriodLabels(period: TimePeriod, count: number): string[] {
  const labels: string[] = [];
  if (period === '1D') {
    for (let i = 0; i < count; i++) {
      const totalMins = 9 * 60 + 30 + Math.round((i / (count - 1)) * 390);
      const hh = Math.floor(totalMins / 60);
      const mm = totalMins % 60;
      labels.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    }
    return labels;
  }

  const now = new Date('2026-11-26T16:00:00Z');
  const totalDays =
    period === '1W'
      ? 7
      : period === '1M'
        ? 30
        : period === '3M'
          ? 90
          : period === '6M'
            ? 180
            : period === '1Y'
              ? 365
              : 1095;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.round(((count - 1 - i) / (count - 1)) * totalDays);
    const dt = new Date(now.getTime() - daysAgo * 86400_000);
    if (period === 'ALL' || period === '1Y') {
      labels.push(`${monthNames[dt.getUTCMonth()]} ${dt.getUTCDate()} '${String(dt.getUTCFullYear()).slice(2)}`);
    } else {
      labels.push(`${monthNames[dt.getUTCMonth()]} ${dt.getUTCDate()}`);
    }
  }
  return labels;
}

function generateSeriesForAsset(seedItem: RawAssetSeed): Record<TimePeriod, PricePoint[]> {
  const periodCounts: Record<TimePeriod, number> = {
    '1D': 27,
    '1W': 28,
    '1M': 30,
    '3M': 40,
    '6M': 48,
    '1Y': 52,
    ALL: 60,
  };

  const targetReturns: Record<TimePeriod, number> = {
    '1D': seedItem.dailyPct / 100,
    '1W': (seedItem.dailyPct * 2.1 + (seedItem.annualReturnPct / 52)) / 100,
    '1M': (seedItem.annualReturnPct / 11) / 100,
    '3M': (seedItem.annualReturnPct / 3.8) / 100,
    '6M': (seedItem.annualReturnPct / 1.9) / 100,
    '1Y': seedItem.annualReturnPct / 100,
    ALL: seedItem.allReturnPct / 100,
  };

  const result = {} as Record<TimePeriod, PricePoint[]>;
  const periods: TimePeriod[] = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

  periods.forEach((period, pIdx) => {
    const count = periodCounts[period];
    const labels = buildPeriodLabels(period, count);
    const ret = targetReturns[period];
    const startPrice = seedItem.price / Math.max(0.2, 1 + ret);
    const rand = createPrng(seedItem.seed * 31 + pIdx * 977);
    const volScale =
      period === '1D'
        ? 0.25
        : period === '1W'
          ? 0.48
          : period === '1M'
            ? 0.72
            : period === '3M'
              ? 0.95
              : period === '6M'
                ? 1.15
                : period === '1Y'
                  ? 1.35
                  : 1.75;

    const rawPath: number[] = [0];
    for (let i = 1; i < count; i++) {
      const wave =
        Math.sin((i / count) * Math.PI * (2.5 + (seedItem.seed % 3))) *
        seedItem.volatility *
        volScale *
        0.55;
      const noise = (rand() - 0.49) * seedItem.volatility * volScale;
      rawPath.push(rawPath[i - 1]! + wave * 0.25 + noise);
    }

    const endNoise = rawPath[count - 1] ?? 0;
    const points: PricePoint[] = [];
    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      const detrendedNoise = (rawPath[i]! - progress * endNoise) * startPrice;
      const trendPrice = startPrice + (seedItem.price - startPrice) * progress;
      const p = i === count - 1 ? seedItem.price : Math.max(startPrice * 0.35, trendPrice + detrendedNoise);
      points.push({
        label: labels[i]!,
        price: roundPrice(p),
      });
    }
    result[period] = points;
  });

  return result;
}

export function createInitialMarketAssets(): MarketAsset[] {
  return RAW_ASSET_SEEDS.map((s) => {
    const seriesByPeriod = generateSeriesForAsset(s);
    const prevClose = roundPrice(s.price / (1 + s.dailyPct / 100));
    const change24h = roundPrice(s.price - prevClose);
    const allPrices = seriesByPeriod['1Y'].map((p) => p.price);
    const high52w = roundPrice(Math.max(...allPrices, s.price * 1.03));
    const low52w = roundPrice(Math.min(...allPrices, s.price * 0.94));

    return {
      symbol: s.symbol,
      name: s.name,
      category: s.category,
      sector: s.sector,
      exchange: s.exchange,
      basePrice: s.price,
      price: s.price,
      prevClose,
      change24h,
      changePct24h: s.dailyPct,
      marketCap: s.marketCap,
      marketCapNumericB: s.marketCapNumericB,
      volume24h: s.volume24h,
      high52w,
      low52w,
      metricLabel: s.metricLabel,
      metricValue: s.metricValue,
      description: s.description,
      defaultShares: s.defaultShares,
      avgCost: s.avgCost,
      seriesByPeriod,
    };
  });
}

export function stepSimulatedMarketPrices(assets: MarketAsset[], tickCount: number): void {
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]!;
    const wave = Math.sin(tickCount * 0.7 + i * 1.37) * 0.0014 + Math.cos(tickCount * 0.31 + i) * 0.0009;
    const nextPrice = roundPrice(Math.max(asset.basePrice * 0.85, asset.basePrice * (1 + wave)));
    asset.price = nextPrice;
    asset.change24h = roundPrice(nextPrice - asset.prevClose);
    asset.changePct24h = Math.round(((nextPrice - asset.prevClose) / asset.prevClose) * 10000) / 100;

    // Update final tick in each period series so charts stay synced with current price
    for (const period of TIME_PERIODS) {
      const pts = asset.seriesByPeriod[period];
      if (pts && pts.length > 0) {
        pts[pts.length - 1] = { label: pts[pts.length - 1]!.label, price: nextPrice };
      }
    }
  }
}

export function getAssetPeriodReturnPct(asset: MarketAsset, period: TimePeriod): number {
  const pts = asset.seriesByPeriod[period];
  if (!pts || pts.length < 2) return asset.changePct24h;
  const first = pts[0]!.price;
  const last = pts[pts.length - 1]!.price;
  if (first <= 0) return 0;
  return Math.round(((last - first) / first) * 10000) / 100;
}

const WATCHLIST_STORAGE_KEY = 'finscope_watchlist_v1';
const HOLDINGS_STORAGE_KEY = 'finscope_holdings_v1';
export const DEFAULT_WATCHLIST_SYMBOLS: readonly string[] = ['NVDA', 'BTC', 'SPY', 'GLD', 'AAPL', 'ETH'];

export function loadSavedWatchlist(): string[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return [...DEFAULT_WATCHLIST_SYMBOLS];
}

export function saveWatchlist(symbols: readonly string[]): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([...symbols]));
    }
  } catch {
    // Ignore storage errors
  }
}

export function getDefaultHoldingsMap(assets: readonly MarketAsset[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of assets) {
    if (a.defaultShares > 0) {
      map[a.symbol] = a.defaultShares;
    }
  }
  return map;
}

export function loadSavedHoldings(assets: readonly MarketAsset[]): Record<string, number> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
              clean[k] = v;
            }
          }
          return clean;
        }
      }
    }
  } catch {
    // Ignore storage errors
  }
  return getDefaultHoldingsMap(assets);
}

export function saveHoldings(holdings: Record<string, number>): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(holdings));
    }
  } catch {
    // Ignore storage errors
  }
}

export function computePortfolioSummary(
  assets: readonly MarketAsset[],
  holdingsMap: Record<string, number>,
  period: TimePeriod
): PortfolioSummary {
  const rawHoldings: EnrichedHolding[] = [];
  let totalValue = 0;
  let totalCostBasis = 0;
  let dailyChangeUsd = 0;

  for (const asset of assets) {
    const shares = holdingsMap[asset.symbol] ?? 0;
    if (shares <= 0) continue;

    const marketValue = shares * asset.price;
    const costBasis = shares * asset.avgCost;
    const profitLossUsd = marketValue - costBasis;
    const profitLossPct = costBasis > 0 ? (profitLossUsd / costBasis) * 100 : 0;
    const dayChgUsd = shares * (asset.price - asset.prevClose);
    const periodReturnPct = getAssetPeriodReturnPct(asset, period);

    totalValue += marketValue;
    totalCostBasis += costBasis;
    dailyChangeUsd += dayChgUsd;

    rawHoldings.push({
      asset,
      shares,
      marketValue,
      costBasis,
      profitLossUsd,
      profitLossPct,
      dailyChangeUsd: dayChgUsd,
      periodReturnPct,
      weightPct: 0,
    });
  }

  for (const h of rawHoldings) {
    h.weightPct = totalValue > 0 ? (h.marketValue / totalValue) * 100 : 0;
  }
  rawHoldings.sort((a, b) => b.marketValue - a.marketValue);

  const totalProfitLoss = totalValue - totalCostBasis;
  const totalProfitLossPct = totalCostBasis > 0 ? (totalProfitLoss / totalCostBasis) * 100 : 0;
  const prevTotalValue = totalValue - dailyChangeUsd;
  const dailyChangePct = prevTotalValue > 0 ? (dailyChangeUsd / prevTotalValue) * 100 : 0;

  // Allocation by category
  const catOrder: AssetCategory[] = ['stocks', 'etfs', 'crypto', 'commodities'];
  const allocations: PortfolioAllocationSlice[] = catOrder.map((cat) => {
    const catHoldings = rawHoldings.filter((h) => h.asset.category === cat);
    const valueUsd = catHoldings.reduce((acc, h) => acc + h.marketValue, 0);
    const costBasisUsd = catHoldings.reduce((acc, h) => acc + h.costBasis, 0);
    const meta = ASSET_CATEGORY_META[cat];
    return {
      category: cat,
      label: meta.label,
      color: meta.color,
      valueUsd,
      costBasisUsd,
      weightPct: totalValue > 0 ? (valueUsd / totalValue) * 100 : 0,
      assetCount: catHoldings.length,
    };
  });

  // Portfolio historical curve aggregated over held shares
  const spyAsset = assets.find((a) => a.symbol === 'SPY') ?? assets[0]!;
  const templateSeries = spyAsset.seriesByPeriod[period];
  const portfolioSeries: PricePoint[] = templateSeries.map((pt, idx) => {
    let val = 0;
    for (const h of rawHoldings) {
      const assetSeries = h.asset.seriesByPeriod[period];
      const pointPrice = assetSeries[idx]?.price ?? h.asset.price;
      val += h.shares * pointPrice;
    }
    return {
      label: pt.label,
      price: Math.round(val * 100) / 100,
    };
  });

  const periodStartVal = portfolioSeries[0]?.price ?? totalValue;
  const periodEndVal = portfolioSeries[portfolioSeries.length - 1]?.price ?? totalValue;
  const periodChangeUsd = periodEndVal - periodStartVal;
  const periodChangePct = periodStartVal > 0 ? (periodChangeUsd / periodStartVal) * 100 : 0;

  // Benchmark series scaled to portfolio starting capital for apples-to-apples chart comparison
  const spyStart = templateSeries[0]?.price ?? 1;
  const benchmarkSeries: PricePoint[] = templateSeries.map((pt) => ({
    label: pt.label,
    price: Math.round((periodStartVal * (pt.price / Math.max(0.01, spyStart))) * 100) / 100,
  }));

  // Performers ranking across the market universe (or portfolio)
  const ranked = assets
    .map((asset) => {
      const returnPct = getAssetPeriodReturnPct(asset, period);
      const pts = asset.seriesByPeriod[period];
      const startP = pts[0]?.price ?? asset.prevClose;
      return {
        asset,
        returnPct,
        changeUsd: asset.price - startP,
      };
    })
    .sort((a, b) => b.returnPct - a.returnPct);

  const topPerformers = ranked.slice(0, 4);
  const underperformers = [...ranked].reverse().slice(0, 4);

  return {
    totalValue,
    totalCostBasis,
    totalProfitLoss,
    totalProfitLossPct,
    dailyChangeUsd,
    dailyChangePct,
    periodChangeUsd,
    periodChangePct,
    holdings: rawHoldings,
    allocations,
    topPerformers,
    underperformers,
    portfolioSeries,
    benchmarkSeries,
  };
}

export function formatUsd(value: number, showSign = false, decimals = 2): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (value < 0) return `-$${formatted}`;
  if (showSign && value > 0) return `+$${formatted}`;
  return `$${formatted}`;
}

export function formatPct(value: number, showSign = true): string {
  const abs = Math.abs(value).toFixed(2);
  if (value < 0) return `-${abs}%`;
  if (showSign && value > 0) return `+${abs}%`;
  return `${abs}%`;
}
