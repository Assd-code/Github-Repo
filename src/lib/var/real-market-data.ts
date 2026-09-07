// Real market data fetcher via Yahoo Finance unofficial API.
//
// Yahoo Finance provides a free (unofficial) chart endpoint that returns
// historical OHLCV data for any ticker symbol (stocks, ETFs, indices, FX,
// crypto). No API key required.
//
//   GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
//       ?range=2y&interval=1d
//
// This module:
//   1. Fetches real historical prices for any list of symbols
//   2. Classifies asset class from Yahoo's instrumentType + symbol heuristics
//   3. Computes daily log returns, covariance, mean, vol
//   4. Falls back to synthetic data for any symbol that fails
//   5. In-memory cache with 15-minute TTL to avoid rate-limiting
//
// All fetches happen server-side (Node.js fetch). The result is a MarketData
// object compatible with the rest of the VaR engine.

import { AssetMeta, MarketData, AssetClass } from "./types";
import { covarianceMatrix, meanVector } from "./rng";
import { generateMarketData, DEFAULT_ASSETS, TRADING_DAYS } from "./market-data";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

// In-memory cache: symbol → { data, fetchedAt }
interface CachedSymbol {
  meta: AssetMeta;
  prices: number[]; // daily close prices, oldest first
  dates: string[]; // ISO date strings aligned with prices
  fetchedAt: number;
}
const symbolCache = new Map<string, CachedSymbol>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Heuristic: classify asset class from Yahoo instrumentType + symbol.
function classifyAsset(symbol: string, instrumentType?: string, exchange?: string): AssetClass {
  const sym = symbol.toUpperCase();
  // Crypto: Yahoo uses -USD suffix or BTC/ETH
  if (sym.endsWith("-USD") || ["BTC", "ETH", "BTCUSD", "ETHUSD"].includes(sym)) return "crypto";
  // Yahoo futures use =F; check before the =X currency convention.
  if (sym.endsWith("=F")) return "commodity";
  // Commodity ETFs / futures
  const commodityEtfs = [
    "GLD", "SLV", "GOLD", "USO", "UNG", "DBC", "DBA", "PDBC", "CPER",
    "PALL", "PLAT", "URA", "WOOD",
  ];
  if (commodityEtfs.includes(sym)) return "commodity";
  if (exchange === "CMEX" || exchange === "NYM") return "commodity";
  // Rate / bond ETFs
  const rateEtfs = [
    "TLT", "IEF", "SHY", "AGG", "BND", "TBT", "TMF", "VGIT", "GOVT",
    "TIP", "LQD", "HYG", "JNK", "EMB", "BKLN", "MUB", "^TNX", "^FVX", "^IRX",
  ];
  if (rateEtfs.includes(sym)) return "rate";
  // FX pairs: Yahoo uses =X, while legacy VaR Lab symbols may omit the suffix.
  if (sym.endsWith("=X")) return "fx";
  if (["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD"].includes(sym)) return "fx";
  // Default by instrumentType
  if (instrumentType === "CURRENCY") return "fx";
  if (instrumentType === "CRYPTOCURRENCY") return "crypto";
  if (instrumentType === "FUTURE") return "commodity";
  // Indices and equities default to equity
  return "equity";
}

// Friendly name from Yahoo meta (longName → shortName → symbol).
function pickName(meta: any, symbol: string): string {
  if (meta.longName) return meta.longName;
  if (meta.shortName) return meta.shortName;
  if (meta.symbol) return meta.symbol;
  return symbol;
}

// Estimate annual drift and vol from price series (for AssetMeta).
function estimateDriftVol(prices: number[]): { drift: number; vol: number } {
  if (prices.length < 2) return { drift: 0.05, vol: 0.2 };
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  if (logReturns.length === 0) return { drift: 0.05, vol: 0.2 };
  const meanDaily = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const varDaily = logReturns.reduce((s, r) => s + (r - meanDaily) ** 2, 0) / Math.max(logReturns.length - 1, 1);
  const stdDaily = Math.sqrt(varDaily);
  return {
    drift: meanDaily * TRADING_DAYS,
    vol: stdDaily * Math.sqrt(TRADING_DAYS),
  };
}

interface FetchResult {
  ok: boolean;
  meta?: AssetMeta;
  prices?: number[];
  dates?: string[];
  error?: string;
}

// Fetch a single symbol from Yahoo Finance.
async function fetchYahooSymbol(symbol: string, range: string = "2y"): Promise<FetchResult> {
  // Yahoo uses =X suffix for FX, -USD for crypto
  let yahooSymbol = symbol.toUpperCase();
  if (yahooSymbol.length === 6 && !yahooSymbol.includes("-") && !yahooSymbol.includes("=") &&
      (yahooSymbol.endsWith("USD") || yahooSymbol.endsWith("JPY") || yahooSymbol.endsWith("GBP"))) {
    // Looks like a FX pair — add =X
    yahooSymbol = yahooSymbol + "=X";
  }

  const url = `${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=1d&includeAdjustedClose=true`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VaRLab/1.0)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(6_000),
      // Next.js fetch — no cache to keep it simple (we have our own cache)
    });

    if (!res.ok) {
      return { ok: false, error: `Yahoo API returned ${res.status}` };
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      return { ok: false, error: "No data in Yahoo response" };
    }

    const meta = result.meta || {};
    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const adjClose = result.indicators?.adjclose?.[0]?.adjclose || quote.close;

    if (!adjClose || timestamps.length === 0) {
      return { ok: false, error: "No price data" };
    }

    // Build aligned arrays (filter out nulls)
    const prices: number[] = [];
    const dates: string[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const p = adjClose[i];
      if (p != null && Number.isFinite(p) && p > 0) {
        prices.push(p);
        const d = new Date(timestamps[i] * 1000);
        dates.push(d.toISOString().slice(0, 10));
      }
    }

    if (prices.length < 10) {
      return { ok: false, error: `Only ${prices.length} valid price points` };
    }

    const spot = prices[prices.length - 1];
    const { drift, vol } = estimateDriftVol(prices);
    const assetMeta: AssetMeta = {
      symbol: symbol.toUpperCase(),
      name: pickName(meta, symbol),
      assetClass: classifyAsset(symbol, meta.instrumentType, meta.exchangeName),
      drift,
      vol,
      spot,
    };

    return { ok: true, meta: assetMeta, prices, dates };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

// Fetch a symbol with caching.
async function fetchSymbolCached(symbol: string, range: string = "2y"): Promise<FetchResult> {
  const sym = symbol.toUpperCase();
  const cacheKey = `${sym}:${range}`;
  const cached = symbolCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ok: true,
      meta: cached.meta,
      prices: cached.prices,
      dates: cached.dates,
    };
  }
  const result = await fetchYahooSymbol(sym, range);
  if (result.ok && result.meta && result.prices && result.dates) {
    symbolCache.set(cacheKey, {
      meta: result.meta,
      prices: result.prices,
      dates: result.dates,
      fetchedAt: Date.now(),
    });
    // Bound cache size
    if (symbolCache.size > 1000) {
      const firstKey = symbolCache.keys().next().value;
      if (firstKey) symbolCache.delete(firstKey);
    }
  }
  return result;
}

export interface MarketAssetHistoryResult {
  ok: boolean;
  meta?: AssetMeta;
  prices?: number[];
  dates?: string[];
  error?: string;
}

/** Fetch one asset's real price history without applying a synthetic fallback. */
export async function getMarketAssetHistory(
  symbol: string,
  range: string = "2y",
): Promise<MarketAssetHistoryResult> {
  return fetchSymbolCached(symbol, range);
}

export interface RealDataFetchSummary {
  symbols: string[];
  fetched: { symbol: string; name: string; assetClass: string; spot: number; prices: number }[];
  failed: { symbol: string; error: string }[];
  usedFallback: boolean;
  dataSource: "real" | "mixed" | "synthetic-fallback";
}

export interface RealMarketDataResult {
  market: MarketData;
  summary: RealDataFetchSummary;
}

// Fetch real data for a list of symbols and build a MarketData object.
// - Aligns all symbols to the same date range (intersection of dates).
// - Falls back to synthetic data for any symbol that fails.
// - If ALL symbols fail, returns fully synthetic data.
export async function getRealMarketData(
  symbols: string[],
  days: number = 504
): Promise<RealMarketDataResult> {
  const results = await Promise.all(
    symbols.map((s) => fetchSymbolCached(s, "2y"))
  );

  const fetched: RealDataFetchSummary["fetched"] = [];
  const failed: RealDataFetchSummary["failed"] = [];

  for (let i = 0; i < symbols.length; i++) {
    const r = results[i];
    if (r.ok && r.meta && r.prices && r.dates) {
      fetched.push({
        symbol: r.meta.symbol,
        name: r.meta.name,
        assetClass: r.meta.assetClass,
        spot: r.meta.spot,
        prices: r.prices.length,
      });
    } else {
      failed.push({ symbol: symbols[i], error: r.error || "unknown" });
    }
  }

  // If no symbols fetched successfully, fall back to synthetic for the default universe.
  if (fetched.length === 0) {
    const synthetic = generateMarketData(DEFAULT_ASSETS, days, 42);
    return {
      market: synthetic,
      summary: {
        symbols,
        fetched: [],
        failed,
        usedFallback: true,
        dataSource: "synthetic-fallback",
      },
    };
  }

  // Build aligned price matrix from successfully fetched symbols.
  // Find the intersection of dates across all fetched symbols.
  const successfulResults = results.filter((r) => r.ok && r.meta && r.prices && r.dates) as Required<FetchResult>[];
  const assets: AssetMeta[] = successfulResults.map((r) => r.meta!);

  // Find common dates
  let commonDates = new Set(successfulResults[0].dates);
  for (let i = 1; i < successfulResults.length; i++) {
    const d = new Set(successfulResults[i].dates);
    commonDates = new Set([...commonDates].filter((x) => d.has(x)));
  }
  const sortedDates = [...commonDates].sort();

  if (sortedDates.length < 30) {
    // Not enough overlap — fall back to synthetic
    const synthetic = generateMarketData(DEFAULT_ASSETS, days, 42);
    return {
      market: synthetic,
      summary: {
        symbols,
        fetched,
        failed,
        usedFallback: true,
        dataSource: "synthetic-fallback",
      },
    };
  }

  // Build aligned price matrix
  const prices: number[][] = [];
  const returns: number[][] = [];
  const n = assets.length;

  for (let d = 0; d < sortedDates.length; d++) {
    const date = sortedDates[d];
    const row: number[] = [];
    for (let i = 0; i < n; i++) {
      const dr = successfulResults[i];
      const idx = dr.dates.indexOf(date);
      row.push(idx >= 0 ? dr.prices[idx] : NaN);
    }
    prices.push(row);
    // Return row: log return from previous day
    if (d === 0) {
      returns.push(new Array(n).fill(0));
    } else {
      const prev = prices[d - 1];
      const ret = row.map((p, i) => {
        if (p <= 0 || prev[i] <= 0 || !Number.isFinite(p) || !Number.isFinite(prev[i])) return 0;
        return Math.log(p / prev[i]);
      });
      returns.push(ret);
    }
  }

  // Fill any NaN with forward-fill (carry last valid price forward)
  for (let i = 0; i < n; i++) {
    let lastValid = NaN;
    for (let d = 0; d < prices.length; d++) {
      if (Number.isFinite(prices[d][i]) && prices[d][i] > 0) {
        lastValid = prices[d][i];
      } else if (Number.isFinite(lastValid)) {
        prices[d][i] = lastValid;
      }
    }
  }

  // Recompute returns after forward-fill
  for (let d = 1; d < prices.length; d++) {
    const prev = prices[d - 1];
    for (let i = 0; i < n; i++) {
      if (prices[d][i] > 0 && prev[i] > 0) {
        returns[d][i] = Math.log(prices[d][i] / prev[i]);
      } else {
        returns[d][i] = 0;
      }
    }
  }

  // Compute covariance/mean/vol from realized returns (drop first row)
  const realized = returns.slice(1);
  const realizedCov = covarianceMatrix(realized);
  const realizedMean = meanVector(realized);
  const realizedVol = realizedMean.map((_, i) => Math.sqrt(Math.max(realizedCov[i][i], 0)));

  const market: MarketData = {
    assets,
    prices,
    returns,
    dates: sortedDates,
    cov: realizedCov,
    mean: realizedMean,
    vol: realizedVol,
  };

  const dataSource: RealDataFetchSummary["dataSource"] =
    failed.length === 0 ? "real" : "mixed";

  return {
    market,
    summary: {
      symbols,
      fetched,
      failed,
      usedFallback: false,
      dataSource,
    },
  };
}

// Validate/search a single ticker — used by the UI "add ticker" flow.
export async function validateTicker(symbol: string): Promise<{
  valid: boolean;
  symbol: string;
  name?: string;
  assetClass?: string;
  spot?: number;
  error?: string;
}> {
  // Use a 1-month range for validation (enough to confirm the ticker exists
  // and get a recent price, but fast).
  const r = await fetchSymbolCached(symbol, "1mo");
  if (!r.ok || !r.meta) {
    return { valid: false, symbol: symbol.toUpperCase(), error: r.error };
  }
  return {
    valid: true,
    symbol: r.meta.symbol,
    name: r.meta.name,
    assetClass: r.meta.assetClass,
    spot: r.meta.spot,
  };
}

// Clear the cache (for testing or manual refresh).
export function clearRealDataCache(): void {
  symbolCache.clear();
}
