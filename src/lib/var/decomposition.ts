// Risk decomposition: marginal, component, incremental VaR.
// Marginal VaR uses the analytic derivative of parametric VaR w.r.t. weight.
// Component VaR = w_i * marginalVar (sums to total VaR).
// Incremental VaR = VaR(with asset) - VaR(without asset), computed via
// historical simulation for robustness.
// Standalone VaR = VaR of the asset held alone at its market value.
// Component ES = Euler allocation of historical ES: each position's average
// P&L in the portfolio's tail scenarios (sums exactly to historical ES).

import { MarketData, PortfolioConfig, DecompositionResult, Methodology } from "./types";
import { normInv, matVec, quantile } from "./rng";
import { portfolioWeights } from "./market-data";
import { runVar } from "./methods";

export function decompose(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology = "historical",
  confidence: number = 0.99,
  horizon: number = 1
): DecompositionResult {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const n = market.assets.length;
  const muDaily = market.mean;
  const cov = market.cov;

  // ---- Parametric portfolio VaR (analytic) ----
  let muP = 0;
  for (let i = 0; i < n; i++) muP += weights[i] * muDaily[i];
  const covW = matVec(cov, weights); // Sigma w
  let varP2 = 0;
  for (let i = 0; i < n; i++) varP2 += weights[i] * covW[i];
  const sigP = Math.sqrt(Math.max(varP2, 1e-18));
  const z = normInv(confidence);
  const muH = muP * horizon;
  const sigH = sigP * Math.sqrt(horizon);
  // Parametric total VaR (component VaRs sum to this).
  const totalVar = Math.max(0, z * sigH - muH) * portfolio.totalValue;

  // Marginal VaR_i = d(VaR)/d(w_i) = V * (z * (Sigma w)_i / sigma_p * sqrt(T) - mu_i*T)
  // (positive for risky assets, negative for diversifiers/hedges).
  const perAsset: DecompositionResult["perAsset"] = [];
  for (let i = 0; i < n; i++) {
    const position = portfolio.positions.find((p) => p.symbol === market.assets[i].symbol);
    if (!position || marketValues[i] === 0) continue;

    const marginalVar =
      (z * (covW[i] / (sigP || 1e-12)) * Math.sqrt(horizon) - muDaily[i] * horizon) *
      portfolio.totalValue;
    const componentVar = weights[i] * marginalVar;

    // Standalone VaR: asset held alone at its market value.
    const standaloneSig = Math.sqrt(Math.max(cov[i][i], 1e-18)) * Math.sqrt(horizon);
    const standaloneMu = muDaily[i] * horizon;
    const standaloneVar = Math.max(0, z * standaloneSig - standaloneMu) * marketValues[i];

    perAsset.push({
      symbol: market.assets[i].symbol,
      name: market.assets[i].name,
      weight: weights[i],
      marginalVar,
      componentVar,
      componentShare: totalVar > 0 ? componentVar / totalVar : 0,
      incrementalVar: 0, // filled below
      standaloneVar,
    });
  }

  // ---- Incremental VaR via historical simulation ----
  // For each asset i: VaR(full portfolio) - VaR(portfolio without asset i,
  // scaled back to the full book size). Positive => the asset adds risk;
  // negative => the asset hedges / diversifies.
  const baseHist = runVar(market, portfolio, methodology, confidence, horizon);
  const baseVar = baseHist.var;
  for (const row of perAsset) {
    const reducedPositions = portfolio.positions.filter((p) => p.symbol !== row.symbol);
    const assetIdx = market.assets.findIndex((a) => a.symbol === row.symbol);
    const reducedTotal = portfolio.totalValue - marketValues[assetIdx];
    if (reducedPositions.length > 0 && reducedTotal > 0) {
      const reducedPortfolio = { positions: reducedPositions, totalValue: reducedTotal };
      const reducedRes = runVar(market, reducedPortfolio, methodology, confidence, horizon);
      const scaledReducedVar = (reducedRes.var || 0) * (portfolio.totalValue / reducedTotal);
      row.incrementalVar = Number.isFinite(scaledReducedVar) ? baseVar - scaledReducedVar : 0;
    }
  }

  // ---- Component ES via historical simulation ----
  const { componentEs, totalEs } = historicalComponentEs(market, weights, confidence, horizon);
  for (const row of perAsset) {
    const assetIdx = market.assets.findIndex((a) => a.symbol === row.symbol);
    row.componentEs = componentEs[assetIdx] * portfolio.totalValue;
  }

  return {
    methodology,
    totalVar,
    perAsset,
    totalEs: totalEs * portfolio.totalValue,
  };
}

/**
 * Euler allocation of historical-simulation ES. Builds the (overlapping)
 * horizon return per asset, finds the scenarios at or beyond the portfolio's
 * VaR quantile, and averages each asset's weighted loss over them.
 * Returns fractions of portfolio value.
 */
export function historicalComponentEs(
  market: MarketData,
  weights: number[],
  confidence: number,
  horizon: number
): { componentEs: number[]; totalEs: number } {
  const returns = market.returns.slice(1);
  const n = market.assets.length;
  const scenarios: number[][] = [];
  for (let t = 0; t + horizon <= returns.length; t++) {
    const row = new Array(n).fill(0);
    for (let h = 0; h < horizon; h++) {
      for (let i = 0; i < n; i++) row[i] += weights[i] * returns[t + h][i];
    }
    scenarios.push(row);
  }
  const portfolioPnl = scenarios.map((row) => row.reduce((a, b) => a + b, 0));
  const cutoff = quantile(portfolioPnl, 1 - confidence);
  const tail = scenarios.filter((_, k) => portfolioPnl[k] <= cutoff);
  const componentEs = new Array(n).fill(0);
  if (tail.length === 0) return { componentEs, totalEs: 0 };
  for (const row of tail) {
    for (let i = 0; i < n; i++) componentEs[i] -= row[i] / tail.length;
  }
  return { componentEs, totalEs: componentEs.reduce((a, b) => a + b, 0) };
}
