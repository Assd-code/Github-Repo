import { getMarketAssetHistory } from "./real-market-data";
import { mean, normInv, quantile, std } from "./rng";
import type { AssetClass, AssetMeta } from "./types";

export type MarketScreenerMethod = "historical" | "parametric";

export interface StandaloneRiskMetrics {
  varPct: number;
  esPct: number;
  annualizedVol: number;
  dailyChange: number;
  observations: number;
}
export interface MarketScreenerResult extends StandaloneRiskMetrics {
  rank: number;
  riskPercentile: number;
  riskBand: "extreme" | "high" | "moderate" | "lower";
  symbol: string;
  name: string;
  assetClass: AssetClass;
  spot: number;
  varAmount: number;
  esAmount: number;
  historyStart: string;
  historyEnd: string;
}

export interface MarketScreenerFailure {
  symbol: string;
  error: string;
}

export interface MarketScreenerScan {
  results: MarketScreenerResult[];
  failures: MarketScreenerFailure[];
  requested: number;
  succeeded: number;
  method: MarketScreenerMethod;
  confidence: number;
  horizon: number;
  notional: number;
  generatedAt: string;
  provider: string;
}

export interface MarketScreenerOptions {
  method: MarketScreenerMethod;
  confidence: number;
  horizon: number;
  notional: number;
}

function overlappingHorizonReturns(dailyReturns: number[], horizon: number): number[] {
  if (horizon === 1) return dailyReturns;
  const result: number[] = [];
  for (let start = 0; start + horizon <= dailyReturns.length; start++) {
    let cumulative = 0;
    for (let offset = 0; offset < horizon; offset++) {
      cumulative += dailyReturns[start + offset];
    }
    result.push(cumulative);
  }
  return result;
}

export function computeStandaloneRisk(
  prices: number[],
  options: Pick<MarketScreenerOptions, "method" | "confidence" | "horizon">,
): StandaloneRiskMetrics {
  const cleanPrices = prices.filter((price) => Number.isFinite(price) && price > 0);
  if (cleanPrices.length < Math.max(31, options.horizon + 2)) {
    throw new Error("At least 30 valid daily returns are required");
  }

  const dailyReturns: number[] = [];
  for (let index = 1; index < cleanPrices.length; index++) {
    dailyReturns.push(Math.log(cleanPrices[index] / cleanPrices[index - 1]));
  }

  const horizonReturns = overlappingHorizonReturns(dailyReturns, options.horizon);
  if (horizonReturns.length < 20) throw new Error("Not enough history for the selected horizon");

  let varPct: number;
  let esPct: number;
  if (options.method === "historical") {
    const lossCutoff = quantile(horizonReturns, 1 - options.confidence);
    const tail = horizonReturns.filter((value) => value <= lossCutoff);
    varPct = Math.max(0, -lossCutoff);
    esPct = Math.max(varPct, tail.length > 0 ? -mean(tail) : varPct);
  } else {
    const muHorizon = mean(dailyReturns) * options.horizon;
    const sigmaHorizon = std(dailyReturns) * Math.sqrt(options.horizon);
    const z = normInv(options.confidence);
    const normalDensity = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    varPct = Math.max(0, z * sigmaHorizon - muHorizon);
    esPct = Math.max(varPct, sigmaHorizon * normalDensity / (1 - options.confidence) - muHorizon);
  }

  return {
    varPct,
    esPct,
    annualizedVol: std(dailyReturns) * Math.sqrt(252),
    dailyChange: Math.exp(dailyReturns[dailyReturns.length - 1]) - 1,
    observations: horizonReturns.length,
  };
}

type UnrankedResult = Omit<MarketScreenerResult, "rank" | "riskPercentile" | "riskBand">;

export function rankMarketScreenerResults(results: UnrankedResult[]): MarketScreenerResult[] {
  const sorted = [...results].sort((left, right) =>
    right.varPct - left.varPct || right.esPct - left.esPct || left.symbol.localeCompare(right.symbol)
  );
  const denominator = Math.max(sorted.length - 1, 1);
  return sorted.map((result, index) => {
    const riskPercentile = sorted.length === 1 ? 100 : 100 * (1 - index / denominator);
    const riskBand = riskPercentile >= 90
      ? "extreme"
      : riskPercentile >= 70
        ? "high"
        : riskPercentile >= 35
          ? "moderate"
          : "lower";
    return {
      ...result,
      rank: index + 1,
      riskPercentile,
      riskBand,
    };
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await worker(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function resultFromHistory(
  meta: AssetMeta,
  prices: number[],
  dates: string[],
  options: MarketScreenerOptions,
): UnrankedResult {
  const metrics = computeStandaloneRisk(prices, options);
  return {
    ...metrics,
    symbol: meta.symbol,
    name: meta.name,
    assetClass: meta.assetClass,
    spot: prices[prices.length - 1],
    varAmount: metrics.varPct * options.notional,
    esAmount: metrics.esPct * options.notional,
    historyStart: dates[0],
    historyEnd: dates[dates.length - 1],
  };
}

export async function scanMarketUniverse(
  symbols: string[],
  options: MarketScreenerOptions,
): Promise<MarketScreenerScan> {
  const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.toUpperCase()))];
  const scans = await mapWithConcurrency(uniqueSymbols, 6, async (symbol) => {
    const history = await getMarketAssetHistory(symbol, "2y");
    if (!history.ok || !history.meta || !history.prices || !history.dates) {
      return { failure: { symbol, error: history.error || "Market data unavailable" } };
    }
    try {
      return { result: resultFromHistory(history.meta, history.prices, history.dates, options) };
    } catch (error) {
      return {
        failure: {
          symbol,
          error: error instanceof Error ? error.message : "Risk calculation failed",
        },
      };
    }
  });

  const unranked: UnrankedResult[] = [];
  const failures: MarketScreenerFailure[] = [];
  for (const scan of scans) {
    if (scan.result) unranked.push(scan.result);
    if (scan.failure) failures.push(scan.failure);
  }

  const results = rankMarketScreenerResults(unranked);
  return {
    results,
    failures,
    requested: uniqueSymbols.length,
    succeeded: results.length,
    method: options.method,
    confidence: options.confidence,
    horizon: options.horizon,
    notional: options.notional,
    generatedAt: new Date().toISOString(),
    provider: "Yahoo Finance historical chart data",
  };
}
