// Server-side market data cache.
// Supports both synthetic data (deterministic, fast) and real market data
// (fetched from Yahoo Finance, cached with TTL).

import { MarketData } from "./types";
import { generateMarketData } from "./market-data";
import { getRealMarketData, RealMarketDataResult } from "./real-market-data";

// Synthetic cache: keyed by days:seed
const synthCache = new Map<string, MarketData>();

export function getMarketData(days: number = 504, seed: number = 42): MarketData {
  const key = `${days}:${seed}`;
  let m = synthCache.get(key);
  if (!m) {
    m = generateMarketData(undefined, days, seed);
    synthCache.set(key, m);
    if (synthCache.size > 8) {
      const firstKey = synthCache.keys().next().value;
      if (firstKey) synthCache.delete(firstKey);
    }
  }
  return m;
}

// Real data cache: keyed by sorted symbols + days, with TTL
const realCache = new Map<string, { result: RealMarketDataResult; fetchedAt: number }>();
const REAL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function getRealMarketDataCached(
  symbols: string[],
  days: number = 504
): Promise<RealMarketDataResult> {
  const key = symbols.slice().sort().join(",") + `:${days}`;
  const cached = realCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < REAL_CACHE_TTL_MS) {
    return cached.result;
  }
  const result = await getRealMarketData(symbols, days);
  realCache.set(key, { result, fetchedAt: Date.now() });
  if (realCache.size > 20) {
    const firstKey = realCache.keys().next().value;
    if (firstKey) realCache.delete(firstKey);
  }
  return result;
}
