// What-If Portfolio Simulator
// Lets a user perturb the portfolio weights and see the projected VaR/ES
// without re-running every methodology. We use the parametric variance-covariance
// method for instant feedback (analytic) plus a historical simulation cross-check,
// so the simulator can respond in <50ms even on every slider drag.

import { MarketData, PortfolioConfig, Methodology } from "./types";
import { portfolioWeights } from "./market-data";
import { normInv } from "./rng";
import { runVar } from "./methods";

export interface WhatIfResult {
  /** the simulated weights (sum to 1) */
  weights: { symbol: string; name: string; weight: number; marketValue: number }[];
  /** total book value (unchanged from original) */
  totalValue: number;
  /** parametric VaR / ES at the new weights (analytic) */
  parametric: {
    var: number;
    es: number;
    varPct: number;
    esPct: number;
    expectedPnl: number;
    stdPnl: number;
  };
  /** historical VaR / ES at the new weights (re-simulation of historical returns) */
  historical: {
    var: number;
    es: number;
    varPct: number;
    esPct: number;
  };
  /** per-asset contribution to the new parametric VaR */
  contributions: { symbol: string; name: string; componentVar: number; componentShare: number }[];
  /** sensitivity of total VaR to a 1% increase in each weight (marginal VaR) */
  marginalVar: { symbol: string; name: string; marginalVar: number }[];
  /** difference vs the baseline portfolio */
  delta: {
    varDelta: number;
    esDelta: number;
    varDeltaPct: number;
    /** interpretation: "lower" | "higher" | "unchanged" */
    direction: "lower" | "higher" | "unchanged";
  };
}

/**
 * Run a what-if simulation. The `targetWeights` is a map from symbol -> weight (0..1).
 * Symbols not in the map retain their proportional share of the residual.
 * If `targetWeights` is empty or all zero, the existing portfolio is returned.
 */
export function runWhatIf(
  market: MarketData,
  portfolio: PortfolioConfig,
  targetWeights: Record<string, number>,
  confidence: number = 0.99,
  horizon: number = 1,
  baselineVar: number = 0,
  baselineEs: number = 0
): WhatIfResult {
  const { weights: origWeights } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const n = market.assets.length;
  const totalValue = portfolio.totalValue;

  // Build the new weight vector.
  // If the user provided weights for some symbols, those are taken as fixed;
  // the remaining symbols are scaled to absorb the residual so weights sum to 1.
  const newW = new Array(n).fill(0);
  let usedWeight = 0;
  let usedAny = false;
  for (let i = 0; i < n; i++) {
    const sym = market.assets[i].symbol;
    if (targetWeights[sym] != null && Number.isFinite(targetWeights[sym])) {
      newW[i] = Math.max(0, targetWeights[sym]);
      usedWeight += newW[i];
      usedAny = true;
    }
  }
  // Distribute the residual proportionally to the original weights of
  // the un-specified symbols (so weights sum to 1).
  const residual = Math.max(0, 1 - usedWeight);
  const unscaledUnspecified: number[] = [];
  let unscaledSum = 0;
  for (let i = 0; i < n; i++) {
    const sym = market.assets[i].symbol;
    if (targetWeights[sym] == null) {
      unscaledUnspecified.push(origWeights[i]);
      unscaledSum += origWeights[i];
    } else {
      unscaledUnspecified.push(0);
    }
  }
  if (unscaledSum > 0) {
    for (let i = 0; i < n; i++) {
      newW[i] += (unscaledUnspecified[i] / unscaledSum) * residual;
    }
  }
  // If user specified all weights but they don't sum to 1, normalize.
  const newSum = newW.reduce((a, b) => a + b, 0);
  if (newSum > 0 && Math.abs(newSum - 1) > 1e-6) {
    for (let i = 0; i < n; i++) newW[i] /= newSum;
  }
  // If no overrides, fall back to original weights.
  if (!usedAny) {
    for (let i = 0; i < n; i++) newW[i] = origWeights[i];
  }

  // --- Parametric VaR at the new weights ---
  const muDaily = market.mean;
  const cov = market.cov;
  let muP = 0;
  for (let i = 0; i < n; i++) muP += newW[i] * muDaily[i];
  const covW = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += cov[i][j] * newW[j];
    covW[i] = s;
  }
  let varP2 = 0;
  for (let i = 0; i < n; i++) varP2 += newW[i] * covW[i];
  const sigP = Math.sqrt(Math.max(varP2, 1e-18));
  const z = normInv(confidence);
  const muH = muP * horizon;
  const sigH = sigP * Math.sqrt(horizon);
  const paramVar = Math.max(0, z * sigH - muH) * totalValue;
  // ES for normal: sigma * phi(z) / (1 - confidence) - mu
  // phi(z) = exp(-z^2/2) / sqrt(2pi)
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const paramEs = Math.max(0, (sigH * phi) / (1 - confidence) - muH) * totalValue;

  // --- Historical VaR at the new weights (re-simulate historical returns) ---
  const returns = market.returns.slice(1);
  const histPnl = returns.map((row) => {
    let r = 0;
    for (let i = 0; i < n; i++) r += newW[i] * row[i];
    return r * totalValue;
  });
  const sorted = [...histPnl].sort((a, b) => a - b);
  const idx = Math.floor((1 - confidence) * sorted.length);
  const histVar = Math.max(0, -sorted[Math.max(idx, 0)]);
  const tail = sorted.slice(0, Math.max(idx, 0) + 1);
  const histEs =
    tail.length > 0
      ? Math.max(0, -tail.reduce((a, b) => a + b, 0) / tail.length)
      : histVar;

  // --- Contributions and marginal VaR ---
  const contributions: WhatIfResult["contributions"] = [];
  const marginalVar: WhatIfResult["marginalVar"] = [];
  for (let i = 0; i < n; i++) {
    if (newW[i] <= 0) continue;
    const mv =
      (z * (covW[i] / (sigP || 1e-12)) * Math.sqrt(horizon) - muDaily[i] * horizon) *
      totalValue;
    const comp = newW[i] * mv;
    contributions.push({
      symbol: market.assets[i].symbol,
      name: market.assets[i].name,
      componentVar: comp,
      componentShare: paramVar > 0 ? comp / paramVar : 0,
    });
    marginalVar.push({
      symbol: market.assets[i].symbol,
      name: market.assets[i].name,
      marginalVar: mv,
    });
  }
  contributions.sort((a, b) => b.componentVar - a.componentVar);
  marginalVar.sort((a, b) => b.marginalVar - a.marginalVar);

  // --- Delta vs baseline ---
  const varDelta = paramVar - baselineVar;
  const esDelta = paramEs - baselineEs;
  const direction: WhatIfResult["delta"]["direction"] =
    Math.abs(varDelta) < 1 ? "unchanged" : varDelta > 0 ? "higher" : "lower";

  const weightsOut = market.assets.map((a, i) => ({
    symbol: a.symbol,
    name: a.name,
    weight: newW[i],
    marketValue: newW[i] * totalValue,
  })).filter((w) => w.weight > 0.0001);

  return {
    weights: weightsOut.sort((a, b) => b.weight - a.weight),
    totalValue,
    parametric: {
      var: paramVar,
      es: paramEs,
      varPct: paramVar / totalValue,
      esPct: paramEs / totalValue,
      expectedPnl: muH * totalValue,
      stdPnl: sigH * totalValue,
    },
    historical: {
      var: histVar,
      es: histEs,
      varPct: histVar / totalValue,
      esPct: histEs / totalValue,
    },
    contributions,
    marginalVar,
    delta: {
      varDelta,
      esDelta,
      varDeltaPct: baselineVar > 0 ? varDelta / baselineVar : 0,
      direction,
    },
  };
}

/**
 * Convenience: what-if with presets.
 *   "risk-off": shift weight toward TLT (bonds) and GOLD.
 *   "risk-on": shift weight toward SPX, AAPL, BTC.
 *   "equal-weight": equal weights across all positions.
 *   "concentrate-btc": 50% into BTC, rest proportional.
 *   "concentrate-spx": 60% into SPX, rest proportional.
 */
export function whatIfPreset(
  preset: "risk-off" | "risk-on" | "equal-weight" | "concentrate-btc" | "concentrate-spx"
): Record<string, number> {
  switch (preset) {
    case "risk-off":
      return { TLT: 0.45, GOLD: 0.25, EURUSD: 0.1, SPX: 0.1, AAPL: 0.05, XOM: 0.03, BTC: 0.02 };
    case "risk-on":
      return { BTC: 0.25, AAPL: 0.25, SPX: 0.25, XOM: 0.15, GOLD: 0.05, TLT: 0.02, EURUSD: 0.03 };
    case "equal-weight":
      return { SPX: 1 / 7, AAPL: 1 / 7, XOM: 1 / 7, TLT: 1 / 7, EURUSD: 1 / 7, GOLD: 1 / 7, BTC: 1 / 7 };
    case "concentrate-btc":
      return { BTC: 0.5, SPX: 0.15, AAPL: 0.1, XOM: 0.08, TLT: 0.05, EURUSD: 0.07, GOLD: 0.05 };
    case "concentrate-spx":
      return { SPX: 0.6, AAPL: 0.12, XOM: 0.08, TLT: 0.08, EURUSD: 0.04, GOLD: 0.04, BTC: 0.04 };
  }
}
