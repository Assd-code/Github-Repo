// Reverse stress testing: instead of asking "what is the loss under scenario X?",
// we ask "what shock magnitude produces a target loss (e.g. -20% of book)?".
//
// Approach: binary search over a uniform multiplicative shock factor applied to
// all asset prices. The per-asset-class shocks use the historical crisis
// correlation structure (equities fall harder than bonds, crypto hardest, etc.)
// but scaled to a single uniform intensity parameter.

import { MarketData, PortfolioConfig, ReverseStressResult, AssetClass } from "./types";
import { portfolioWeights } from "./market-data";
import { runVar } from "./methods";

/** Per-asset-class shock multipliers at unit intensity (intensity=1 ≈ a severe crisis).
 *  These are the relative sensitivities — equities -1.0, crypto -1.5, bonds +0.3 (rally), etc. */
const CLASS_SENSITIVITY: Record<AssetClass, number> = {
  equity: -1.0,
  crypto: -1.6,
  commodity: -0.7, // gold may rally but commodities broadly sold
  fx: -0.4,
  rate: 0.4, // treasuries rally (price up) in stress
};

/** Find the shock intensity (0..maxIntensity) that produces the target loss fraction.
 *  Returns the intensity, or null if the target loss is unreachable (e.g. the bond
 *  hedge prevents the portfolio from ever reaching -100% under uniform stress). */
function solveForIntensity(
  market: MarketData,
  weights: number[],
  marketValues: number[],
  totalValue: number,
  targetLossFraction: number,
  maxIntensity: number = 10.0
): number | null {
  const lastPrices = market.prices[market.prices.length - 1];
  const n = market.assets.length;
  const lossAtIntensity = (intensity: number) => {
    let pnl = 0;
    for (let i = 0; i < n; i++) {
      const ac = market.assets[i].assetClass;
      const shockPct = CLASS_SENSITIVITY[ac] * intensity * 0.20;
      // Cap the shock so price never goes below zero (max -100% shock).
      const cappedShock = Math.max(-1, shockPct);
      const newPrice = lastPrices[i] * (1 + cappedShock);
      pnl += (newPrice - lastPrices[i]) * (marketValues[i] / lastPrices[i]);
    }
    return pnl;
  };

  const target = -targetLossFraction * totalValue;
  // Check reachability: even at maxIntensity, is the loss >= target?
  const maxLoss = lossAtIntensity(maxIntensity);
  if (maxLoss > target) {
    // The portfolio can't reach the target loss even under extreme stress
    // (e.g. strong bond hedge). Return null.
    return null;
  }

  let lo = 0;
  let hi = maxIntensity;
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const loss = lossAtIntensity(mid);
    if (loss > target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

export function computeReverseStress(
  market: MarketData,
  portfolio: PortfolioConfig,
  targetLossPct: number = 0.20
): ReverseStressResult {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const lastPrices = market.prices[market.prices.length - 1];
  const n = market.assets.length;
  const targetLoss = -targetLossPct * portfolio.totalValue;

  const intensity = solveForIntensity(
    market,
    weights,
    marketValues,
    portfolio.totalValue,
    targetLossPct
  );

  // If the target loss is unreachable even at max intensity (e.g. bond hedge
  // floors the book), use max intensity to show the worst achievable loss.
  const effectiveIntensity = intensity ?? 10.0;
  const unreachable = intensity === null;

  // Derive per-asset-class shocks at the solved intensity (capped at -100%).
  const perClassMap = new Map<AssetClass, { shock: number; pnl: number }>();
  for (let i = 0; i < n; i++) {
    const ac = market.assets[i].assetClass;
    const rawShock = CLASS_SENSITIVITY[ac] * effectiveIntensity * 0.20;
    const shockPct = Math.max(-1, rawShock); // cap: price can't go below zero
    const newPrice = lastPrices[i] * (1 + shockPct);
    const pnl = (newPrice - lastPrices[i]) * (marketValues[i] / lastPrices[i]);
    const existing = perClassMap.get(ac);
    if (existing) {
      existing.pnl += pnl;
    } else {
      perClassMap.set(ac, { shock: shockPct, pnl });
    }
  }
  const perAssetClass = Array.from(perClassMap.entries()).map(([assetClass, v]) => ({
    assetClass,
    shock: v.shock,
    pnl: v.pnl,
  }));

  // The "uniform shock factor" = the equity-class shock (most representative).
  const equityShock = perAssetClass.find((p) => p.assetClass === "equity")?.shock ?? 0;
  const shockFactor = 1 + equityShock;

  // Compare to historical extremes (Lehman ~ -32% equity, COVID ~ -34%).
  const equityLossPct = Math.abs(equityShock);
  const worseThanLehman = equityLossPct > 0.32;
  const worseThanCovid = equityLossPct > 0.34;

  // Rough probability: assume equity daily returns ~ N(0, sigma). A shock of X%
  // corresponds to a ~ X/sigma sigma event. Convert to a 1-in-N-years statement.
  const eqAsset = market.assets.find((a) => a.assetClass === "equity");
  const dailyVol = eqAsset ? eqAsset.vol / Math.sqrt(252) : 0.01;
  const sigmaEvent = equityLossPct / (dailyVol || 0.01);
  const probDaily = 1 - normalCdf(sigmaEvent);
  const oneInYears = probDaily > 0 ? (1 / probDaily / 252).toFixed(1) : "10000+";
  const probability = `~1-in-${oneInYears} years (≈ ${sigmaEvent.toFixed(1)}σ)`;

  // Margin to ruin: how much further intensity (beyond the target-loss intensity)
  // would wipe out the book (loss = -100%). If the portfolio cannot be fully wiped
  // out under uniform stress (e.g. an unbreakable bond hedge), margin = 1 (unreachable).
  const ruinIntensity = solveForIntensity(market, weights, marketValues, portfolio.totalValue, 1.0);
  const marginToRuin =
    ruinIntensity === null || unreachable
      ? 1.0 // ruin is unreachable — the book has an effective floor
      : (ruinIntensity - effectiveIntensity) / ruinIntensity;

  return {
    targetLossPct,
    targetLoss,
    shockFactor,
    perAssetClass,
    comparison: { worseThanLehman, worseThanCovid, probability },
    marginToRuin,
  };
}

// Standard normal CDF (local copy to avoid circular import).
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.39894228040143317 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
