// Liquidity-Adjusted VaR per FRTB (Fundamental Review of the Trading Book).
// ES is computed at base 10-day horizon, then scaled across 5 liquidity horizons
// (10, 20, 40, 60, 120 days) using sqrt-of-time scaling, and aggregated via the
// FRTB formula:  ES = sqrt( sum_j ( ES_j * sqrt(LH_j/10) )^2 )
//
// Reference: Basel Committee MAR33.12-33.13.

import { MarketData, PortfolioConfig, LiquidityAdjustedVar, LiquidityHorizon, AssetClass } from "./types";
import { runVar } from "./methods";

const HORIZONS: LiquidityHorizon[] = [10, 20, 40, 60, 120];

/** FRTB horizon weights per asset class (how long to liquidate the risk factor). */
const ASSET_CLASS_HORIZON: Record<AssetClass, LiquidityHorizon> = {
  equity: 10,
  fx: 20,
  commodity: 20,
  rate: 40,
  crypto: 60,
};

export function computeLiquidityAdjustedVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.975
): LiquidityAdjustedVar {
  // Base ES at 1-day horizon (FRTB uses 97.5% ES), then scale to 10-day base.
  const baseRes = runVar(market, portfolio, "historical", confidence, 10);
  const baseEs10 = baseRes.es;

  const horizons = HORIZONS.map((h) => {
    // sqrt-of-time scaling from 10-day base
    const es = baseEs10 * Math.sqrt(h / 10);
    const ratio = es / baseEs10;
    // Capital contribution: each horizon's ES scaled by a horizon weight and
    // multiplied by the regulatory multiplier (3.0 green zone).
    const weight = Math.sqrt(h / 10);
    const capital = es * 3.0 * weight;
    return { horizon: h, es, ratio, capital };
  });

  // FRTB aggregation: ES = sqrt( sum_j (ES_j * w_j)^2 ) where w_j captures the
  // per-risk-factor liquidity horizon mixing. We approximate by combining the
  // horizon ES values weighted by the portfolio's asset-class composition.
  const assetClassWeights = new Map<AssetClass, number>();
  for (const p of portfolio.positions) {
    const asset = market.assets.find((a) => a.symbol === p.symbol);
    if (asset) {
      const mv = p.quantity * market.prices[market.prices.length - 1][market.assets.indexOf(asset)];
      assetClassWeights.set(asset.assetClass, (assetClassWeights.get(asset.assetClass) || 0) + mv);
    }
  }
  const totalMv = Array.from(assetClassWeights.values()).reduce((a, b) => a + b, 0) || 1;

  // Weighted ES per asset class using its FRTB liquidity horizon.
  let aggSquared = 0;
  for (const [ac, mv] of assetClassWeights) {
    const w = mv / totalMv;
    const lh = ASSET_CLASS_HORIZON[ac];
    const esAc = baseEs10 * Math.sqrt(lh / 10);
    aggSquared += Math.pow(w * esAc, 2);
  }
  const aggregatedEs = Math.sqrt(aggSquared);
  const regulatoryCapital = aggregatedEs * 3.0;

  return {
    confidence,
    baseEs: baseEs10,
    horizons,
    aggregatedEs,
    regulatoryCapital,
  };
}
