// Risk Factor Sensitivity Analysis
// Computes first-order (delta) and second-order (gamma/convexity) sensitivities
// of the portfolio to each risk factor (asset). Reports:
//   - DV01-equivalent: P&L impact for a 1bp (0.01%) move in each asset price
//   - 1% sensitivity: P&L for ±1% move in each asset
//   - "Key rate" style: P&L for a 100bp (1%) parallel shift up/down across all assets
//   - Cross-asset sensitivities: which assets co-move most with each risk factor
//   - Net exposure, gross exposure, delta-long/short breakdown
//   - "Risk factor contribution to VaR" — decomposes total VaR by factor
//
// This is the standard first/second-order risk dashboard used by interest-rate,
// FX, and equity desks. For the multi-asset book here, each asset is treated as
// a risk factor and sensitivities are computed by re-valuing the portfolio under
// small parallel shocks to each factor (numerical differentiation).

import { MarketData, PortfolioConfig, AssetClass } from "./types";
import { portfolioWeights } from "./market-data";
import { normInv } from "./rng";

export interface FactorSensitivity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  weight: number;
  marketValue: number;
  /** P&L for +1% move in this asset's price (USD) */
  deltaUp1pct: number;
  /** P&L for -1% move in this asset's price (USD) */
  deltaDown1pct: number;
  /** P&L for +1bp move (DV01-equivalent, USD) */
  dv01: number;
  /** second-order effect: (deltaUp + deltaDown) / 2 — should be ~0 for linear, positive for long gamma */
  gamma: number;
  /** asymmetry: deltaUp - |deltaDown| (positive = long gamma benefits from moves either direction) */
  asymmetry: number;
  /** share of total portfolio VaR attributable to this factor */
  varContribution: number;
  varContributionPct: number;
  /** the factor's volatility (annualized, decimal) */
  vol: number;
  /** standalone VaR (the asset held alone at its market value) */
  standaloneVar: number;
}

export interface SensitivitySummary {
  /** total notional / book value */
  totalValue: number;
  /** gross notional exposure (sum of |market values|) */
  grossExposure: number;
  /** net notional (sum of signed market values, = totalValue for long-only) */
  netExposure: number;
  /** long exposure sum */
  longExposure: number;
  /** short exposure sum (0 for long-only book) */
  shortExposure: number;
  /** P&L for a +1% parallel shift across ALL factors */
  parallelUp1pct: number;
  /** P&L for a -1% parallel shift across ALL factors */
  parallelDown1pct: number;
  /** P&L for +100bp parallel shift (= parallelUp1pct * 100) */
  parallelUp100bp: number;
  /** P&L for -100bp parallel shift */
  parallelDown100bp: number;
  /** net delta (USD per 1% market-wide move) */
  netDelta: number;
  /** net gamma (convexity across all factors) */
  netGamma: number;
  /** the most sensitive factor (largest |dv01|) */
  mostSensitive: { symbol: string; dv01: number };
  /** the largest positive contributor (long bias) */
  topLong: { symbol: string; marketValue: number };
  /** the largest negative contributor (short / hedge) */
  topShort: { symbol: string; marketValue: number };
}

export interface RiskFactorSensitivity {
  factors: FactorSensitivity[];
  summary: SensitivitySummary;
  /** parallel shock curve: P&L for shifts from -5% to +5% in 0.5% steps */
  parallelShockCurve: { shockPct: number; pnl: number }[];
  /** per-factor sensitivity heatmap data (top 4 factors by |dv01|) */
  heatmap: {
    factor: string;
    moves: { pct: number; pnl: number }[];
  }[];
}

// Compute P&L for a portfolio under given per-asset shocks (multiplicative).
function portfolioPnlUnderShocks(
  market: MarketData,
  weights: number[],
  totalValue: number,
  shocks: number[] // multiplicative: 1.01 = +1%, 0.99 = -1%
): number {
  // We use the historical mean daily return as the expected P&L drift, then
  // add the shock effect. For a sensitivity analysis we want the INSTANTANEOUS
  // P&L from the shock, which is sum_i w_i * (shock_i - 1) * totalValue.
  let pnl = 0;
  for (let i = 0; i < weights.length; i++) {
    pnl += weights[i] * (shocks[i] - 1) * totalValue;
  }
  return pnl;
}

export function computeRiskFactorSensitivity(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1
): RiskFactorSensitivity {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const n = market.assets.length;
  const totalValue = portfolio.totalValue;

  // Per-factor sensitivities via numerical differentiation.
  const factors: FactorSensitivity[] = [];
  for (let i = 0; i < n; i++) {
    if (marketValues[i] === 0) continue;
    const asset = market.assets[i];

    // +1% shock to factor i only
    const shocksUp = new Array(n).fill(1);
    shocksUp[i] = 1.01;
    const deltaUp1pct = portfolioPnlUnderShocks(market, weights, totalValue, shocksUp);

    // -1% shock to factor i only
    const shocksDown = new Array(n).fill(1);
    shocksDown[i] = 0.99;
    const deltaDown1pct = portfolioPnlUnderShocks(market, weights, totalValue, shocksDown);

    // DV01 (1bp = 0.01%)
    const dv01 = deltaUp1pct / 100;

    // Gamma = (deltaUp + deltaDown) / 2 — for a linear position this is 0
    // because +1% gives +X and -1% gives -X. For convex positions (options),
    // both moves produce a positive P&L (long gamma). Here we use a small
    // second-order probe: shock ±2% and compare to 2× the ±1% probe.
    const shocksUp2 = new Array(n).fill(1);
    shocksUp2[i] = 1.02;
    const shocksDown2 = new Array(n).fill(1);
    shocksDown2[i] = 0.98;
    const deltaUp2pct = portfolioPnlUnderShocks(market, weights, totalValue, shocksUp2);
    const deltaDown2pct = portfolioPnlUnderShocks(market, weights, totalValue, shocksDown2);
    // gamma = ((Δ2% + Δ-2%) / 2) - ((Δ1% + Δ-1%) / 2)
    // For linear: both terms are 0, so gamma = 0
    // For convex: second term is larger than first
    const gamma = (deltaUp2pct + deltaDown2pct) / 2 - (deltaUp1pct + deltaDown1pct) / 2;
    const asymmetry = deltaUp1pct - Math.abs(deltaDown1pct);

    // Risk factor contribution to portfolio VaR (parametric decomposition)
    const covW = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += market.cov[i][k] * weights[k];
      covW[i] = s;
    }
    let varP2 = 0;
    for (let j = 0; j < n; j++) varP2 += weights[j] * covW[j];
    const sigP = Math.sqrt(Math.max(varP2, 1e-18));
    const z = normInv(confidence);
    const muP = weights.reduce((acc, w, j) => acc + w * market.mean[j], 0);
    const muH = muP * horizon;
    const sigH = sigP * Math.sqrt(horizon);
    const totalVar = Math.max(0, z * sigH - muH) * totalValue;
    // marginal VaR_i = (z * covW_i / sigP * sqrt(horizon) - mu_i * horizon) * V
    const marginalVar =
      (z * (covW[i] / (sigP || 1e-12)) * Math.sqrt(horizon) - market.mean[i] * horizon) *
      totalValue;
    const componentVar = weights[i] * marginalVar;
    const varContribution = componentVar;
    const varContributionPct = totalVar > 0 ? componentVar / totalVar : 0;

    // Standalone VaR for the asset at its market value
    const standaloneSig = Math.sqrt(Math.max(market.cov[i][i], 1e-18)) * Math.sqrt(horizon);
    const standaloneMu = market.mean[i] * horizon;
    const standaloneVar = Math.max(0, z * standaloneSig - standaloneMu) * marketValues[i];

    factors.push({
      symbol: asset.symbol,
      name: asset.name,
      assetClass: asset.assetClass,
      weight: weights[i],
      marketValue: marketValues[i],
      deltaUp1pct,
      deltaDown1pct,
      dv01,
      gamma,
      asymmetry,
      varContribution,
      varContributionPct,
      vol: asset.vol,
      standaloneVar,
    });
  }

  // Sort by |dv01| descending
  factors.sort((a, b) => Math.abs(b.dv01) - Math.abs(a.dv01));

  // Summary
  const longExposure = marketValues.filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const shortExposure = Math.abs(marketValues.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const grossExposure = longExposure + shortExposure;
  const netExposure = longExposure - shortExposure;

  const parallelUp1pct = portfolioPnlUnderShocks(
    market,
    weights,
    totalValue,
    new Array(n).fill(1.01)
  );
  const parallelDown1pct = portfolioPnlUnderShocks(
    market,
    weights,
    totalValue,
    new Array(n).fill(0.99)
  );

  // Find most sensitive factor (by |dv01|)
  const mostSensitive = factors.reduce(
    (acc, f) => (Math.abs(f.dv01) > Math.abs(acc.dv01) ? f : acc),
    factors[0]
  );

  // Top long and short
  const sortedByMv = [...factors].sort((a, b) => b.marketValue - a.marketValue);
  const topLong = sortedByMv[0];
  const topShort = sortedByMv[sortedByMv.length - 1];

  const summary: SensitivitySummary = {
    totalValue,
    grossExposure,
    netExposure,
    longExposure,
    shortExposure,
    parallelUp1pct,
    parallelDown1pct,
    parallelUp100bp: parallelUp1pct * 100,
    parallelDown100bp: parallelDown1pct * 100,
    netDelta: parallelUp1pct, // P&L per +1% market-wide move
    netGamma: factors.reduce((s, f) => s + f.gamma, 0),
    mostSensitive: { symbol: mostSensitive.symbol, dv01: mostSensitive.dv01 },
    topLong: { symbol: topLong.symbol, marketValue: topLong.marketValue },
    topShort: { symbol: topShort.symbol, marketValue: topShort.marketValue },
  };

  // Parallel shock curve from -5% to +5% in 0.5% steps
  const parallelShockCurve: { shockPct: number; pnl: number }[] = [];
  for (let p = -50; p <= 50; p += 5) {
    const shockPct = p / 10; // -5.0 to +5.0
    const shocks = new Array(n).fill(1 + shockPct / 100);
    const pnl = portfolioPnlUnderShocks(market, weights, totalValue, shocks);
    parallelShockCurve.push({ shockPct, pnl: Math.round(pnl) });
  }

  // Heatmap: top 4 factors by |dv01|, P&L for ±5% in 1% steps
  const heatmap = factors.slice(0, 4).map((f) => {
    const idx = market.assets.findIndex((a) => a.symbol === f.symbol);
    const moves: { pct: number; pnl: number }[] = [];
    for (let p = -5; p <= 5; p += 1) {
      const shocks = new Array(n).fill(1);
      shocks[idx] = 1 + p / 100;
      moves.push({ pct: p, pnl: Math.round(portfolioPnlUnderShocks(market, weights, totalValue, shocks)) });
    }
    return { factor: f.symbol, moves };
  });

  return {
    factors,
    summary,
    parallelShockCurve,
    heatmap,
  };
}
