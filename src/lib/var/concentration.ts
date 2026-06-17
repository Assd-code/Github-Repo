// Concentration Risk Analysis
// Computes standard concentration metrics used by risk managers and regulators:
//   - HHI (Herfindahl-Hirschman Index): sum of squared weights. 1/n => perfectly
//     diversified, 1 => single-asset. DOJ thresholds: <1500 low, 1500-2500
//     moderate, >2500 high concentration.
//   - Effective number of positions (1/HHI): the size of an equally-weighted
//     book with the same concentration. 1 = fully concentrated.
//   - Top-N concentration ratios: cumulative weight of the top N positions.
//   - Diversification ratio: sum of standalone VaR / portfolio VaR. >1 always;
//     the bigger, the more diversification benefit.
//   - Gini coefficient of weights: 0 = perfect equality, 1 = perfect inequality.
//   - Lorenz curve points for charting.
//   - Per-asset contribution to HHI (so risk managers can see which names drive
//     the concentration).

import { MarketData, PortfolioConfig, Methodology } from "./types";
import { portfolioWeights } from "./market-data";
import { runVar } from "./methods";
import { decompose } from "./decomposition";

export interface ConcentrationMetrics {
  /** portfolio total value */
  totalValue: number;
  /** number of positions */
  positionCount: number;
  /** Herfindahl-Hirschman Index (0..1) */
  hhi: number;
  /** HHI scaled to 0..10000 (regulatory convention) */
  hhiScaled: number;
  /** effective number of positions = 1/HHI */
  effectiveN: number;
  /** DOJ concentration classification */
  classification: "low" | "moderate" | "high" | "extreme";
  /** cumulative weight of the top-1, top-3, top-5 positions */
  top1: number;
  top3: number;
  top5: number;
  /** Gini coefficient of weights (0=equal, 1=concentrated) */
  gini: number;
  /** diversification ratio = sum(standaloneVar)/portfolioVar */
  diversificationRatio: number;
  /** diversification benefit = 1 - 1/divRatio (the % risk reduction from combining) */
  diversificationBenefit: number;
  /** per-asset breakdown */
  perAsset: {
    symbol: string;
    name: string;
    assetClass: string;
    weight: number;
    marketValue: number;
    /** contribution to HHI = w_i^2 */
    hhiContribution: number;
    /** share of total HHI */
    hhiShare: number;
    /** standalone VaR */
    standaloneVar: number;
    /** component VaR */
    componentVar: number;
  }[];
  /** Lorenz curve points: cumulative share of population vs cumulative share of weight */
  lorenz: { x: number; y: number }[];
}

export function computeConcentration(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1,
  methodology: Methodology = "historical"
): ConcentrationMetrics {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );

  // Only consider positions actually held.
  const held: { idx: number; weight: number; marketValue: number }[] = [];
  for (let i = 0; i < weights.length; i++) {
    if (marketValues[i] > 0) {
      held.push({ idx: i, weight: weights[i], marketValue: marketValues[i] });
    }
  }
  held.sort((a, b) => b.weight - a.weight);

  // --- HHI ---
  const hhi = held.reduce((sum, h) => sum + h.weight * h.weight, 0);
  const hhiScaled = hhi * 10000;
  const effectiveN = 1 / Math.max(hhi, 1e-12);

  let classification: ConcentrationMetrics["classification"];
  if (hhiScaled < 1500) classification = "low";
  else if (hhiScaled < 2500) classification = "moderate";
  else if (hhiScaled < 5000) classification = "high";
  else classification = "extreme";

  // --- Top-N ---
  const top1 = held.slice(0, 1).reduce((s, h) => s + h.weight, 0);
  const top3 = held.slice(0, 3).reduce((s, h) => s + h.weight, 0);
  const top5 = held.slice(0, 5).reduce((s, h) => s + h.weight, 0);

  // --- Gini ---
  // Gini = (sum_i sum_j |x_i - x_j|) / (2 n^2 mean)
  const n = held.length;
  const meanW = held.reduce((s, h) => s + h.weight, 0) / Math.max(n, 1);
  let absSum = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      absSum += Math.abs(held[i].weight - held[j].weight);
    }
  }
  const gini = meanW > 0 ? absSum / (2 * n * n * meanW) : 0;

  // --- Diversification ratio ---
  const decomp = decompose(market, portfolio, methodology, confidence, horizon);
  const portfolioVar = decomp.totalVar;
  const standaloneSum = decomp.perAsset.reduce((s, p) => s + p.standaloneVar, 0);
  const diversificationRatio =
    portfolioVar > 0 ? standaloneSum / portfolioVar : 1;
  const diversificationBenefit = Math.max(
    0,
    1 - 1 / Math.max(diversificationRatio, 1e-9)
  );

  // --- Per-asset ---
  const perAsset = held.map((h) => {
    const asset = market.assets[h.idx];
    const decompRow = decomp.perAsset.find((p) => p.symbol === asset.symbol);
    return {
      symbol: asset.symbol,
      name: asset.name,
      assetClass: asset.assetClass,
      weight: h.weight,
      marketValue: h.marketValue,
      hhiContribution: h.weight * h.weight,
      hhiShare: hhi > 0 ? (h.weight * h.weight) / hhi : 0,
      standaloneVar: decompRow?.standaloneVar ?? 0,
      componentVar: decompRow?.componentVar ?? 0,
    };
  });

  // --- Lorenz curve ---
  // Sort ascending for the Lorenz curve (cumulative share vs cumulative population)
  const asc = [...held].sort((a, b) => a.weight - b.weight);
  const lorenz: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cumW = 0;
  for (let i = 0; i < asc.length; i++) {
    cumW += asc[i].weight;
    lorenz.push({ x: (i + 1) / n, y: cumW });
  }

  return {
    totalValue: portfolio.totalValue,
    positionCount: n,
    hhi,
    hhiScaled,
    effectiveN,
    classification,
    top1,
    top3,
    top5,
    gini,
    diversificationRatio,
    diversificationBenefit,
    perAsset,
    lorenz,
  };
}
