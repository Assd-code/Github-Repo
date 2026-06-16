// Server-side market data cache. Generation is deterministic given a seed,
// but ~500-day multi-asset simulation is expensive enough to memoize.

import { MarketData } from "./types";
import { generateMarketData } from "./market-data";

const cache = new Map<string, MarketData>();

export function getMarketData(days: number = 504, seed: number = 42): MarketData {
  const key = `${days}:${seed}`;
  let m = cache.get(key);
  if (!m) {
    m = generateMarketData(undefined, days, seed);
    cache.set(key, m);
    // bound the cache
    if (cache.size > 8) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  }
  return m;
}
