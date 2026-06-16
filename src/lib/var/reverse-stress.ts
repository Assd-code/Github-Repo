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

/** Find the shock intensity (0..2) that produces the target loss fraction. */
function solveForIntensity(
  market: MarketData,
  weights: number[],
  marketValues: number[],
  totalValue: number,
  targetLossFraction: number
): number {
  const lastPrices = market.prices[market.prices.length - 1];
  const n = market.assets.length;
  const lossAtIntensity = (intensity: number) => {
    let pnl = 0;
    for (let i = 0; i < n; i++) {
      const ac = market.assets[i].assetClass;
      // shock fraction of price: e.g. intensity 1.0, equity => price * (1 - 0.20) = -20%
      const shockPct = CLASS_SENSITIVITY[ac] * intensity * 0.20;
      const newPrice = lastPrices[i] * (1 + shockPct);
      pnl += (newPrice - lastPrices[i]) * (marketValues[i] / lastPrices[i]);
    }
    return pnl; // negative = loss
  };

  // Binary search: intensity 0 => 0 loss, intensity 2 => deep loss.
  let lo = 0;
  let hi = 3.0;
  const target = -targetLossFraction * totalValue;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const loss = lossAtIntensity(mid);
    if (loss > target) {
      lo = mid; // not enough loss yet, increase intensity
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

  // Derive per-asset-class shocks at the solved intensity.
  const perClassMap = new Map<AssetClass, { shock: number; pnl: number }>();
  for (let i = 0; i < n; i++) {
    const ac = market.assets[i].assetClass;
    const shockPct = CLASS_SENSITIVITY[ac] * intensity * 0.20;
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

  // Margin to ruin: intensity that wipes out the book (loss = -100%).
  const ruinIntensity = solveForIntensity(market, weights, marketValues, portfolio.totalValue, 1.0);
  const marginToRuin = (ruinIntensity - intensity) / ruinIntensity;

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
