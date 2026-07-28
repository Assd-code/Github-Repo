// P&L Attribution (PLA) test per FRTB MAR30.
//
// Compares:
//   - Risk-Theoretical P&L (RTPL): P&L explained by the risk model's risk factors
//     (here: the portfolio's exposure to the daily return of each asset).
//   - Hypothetical P&L (HPL): P&L from full front-office revaluation under all
//     market moves (here: the actual portfolio P&L including higher-order effects).
//
// In our linear-portfolio approximation, RTPL = HPL for linear instruments, so
// we inject a small non-linear "pricing residual" (gamma/convexity term) to make
// the PLA test meaningful:  HPL ≈ RTPL + 0.5 * gamma * (deltaS)^2 * qty.
// This mimics the optionality/convexity that real desks carry.

import { MarketData, PortfolioConfig, PnlAttribution } from "./types";
import { portfolioWeights } from "./market-data";
import { mean, downsample } from "./rng";

export function computePnlAttribution(
  market: MarketData,
  portfolio: PortfolioConfig,
  window: number = 60
): PnlAttribution {
  const returns = market.returns.slice(1);
  const dates = market.dates.slice(1);
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const n = market.assets.length;
  const lastPrices = market.prices[market.prices.length - 1];

  // Gamma proxy: assume each position has a small convexity (gamma) of
  // ~2% of delta per asset. This produces a realistic PLA residual.
  const GAMMA_PROXY = 0.02;

  const startIdx = Math.max(1, returns.length - window);
  const rawPoints: PnlAttribution["points"] = [];

  for (let t = startIdx; t < returns.length; t++) {
    // RTPL: linear risk-factor P&L = sum(w_i * r_i) * V
    let rtpl = 0;
    for (let i = 0; i < n; i++) rtpl += weights[i] * returns[t][i];
    rtpl *= portfolio.totalValue;

    // HPL: RTPL + convexity residual = 0.5 * gamma_i * (deltaS_i)^2 * qty_i
    // where deltaS_i = r_i * S_i. The gamma term is always positive for long
    // convexity (adds gains in both up and down moves).
    let convexity = 0;
    for (let i = 0; i < n; i++) {
      const deltaS = returns[t][i] * lastPrices[i];
      const qty = marketValues[i] / lastPrices[i];
      convexity += 0.5 * GAMMA_PROXY * deltaS * deltaS * qty * 0.01;
    }
    const hpl = rtpl + convexity;
    const residual = hpl - rtpl;

    rawPoints.push({
      date: dates[t],
      riskTheoretical: Math.round(rtpl),
      hypothetical: Math.round(hpl),
      residual: Math.round(residual),
    });
  }

  // Spearman correlation between RTPL and HPL.
  const rtplVals = rawPoints.map((p) => p.riskTheoretical);
  const hplVals = rawPoints.map((p) => p.hypothetical);
  const spearman = spearmanCorrelation(rtplVals, hplVals);

  // Mean absolute residual as % of portfolio value.
  const absResiduals = rawPoints.map((p) => Math.abs(p.residual));
  const meanAbsResidualPct = mean(absResiduals) / portfolio.totalValue;

  // FRTB PLA traffic light: green if Spearman >= 0.80 AND meanAbsResidual < 10%.
  let zone: "green" | "amber" | "red";
  let notes: string;
  if (spearman >= 0.8 && meanAbsResidualPct < 0.1) {
    zone = "green";
    notes = "PLA test passed — risk-theoretical P&L tracks hypothetical P&L closely. Desk retains Internal Model Approval.";
  } else if (spearman >= 0.7 || meanAbsResidualPct < 0.2) {
    zone = "amber";
    notes = "PLA test in warning zone — desk under enhanced monitoring. Risk factor coverage or pricing model may need refresh.";
  } else {
    zone = "red";
    notes = "PLA test failed — RTPL diverges materially from HPL. Desk loses Internal Model Approval and must use Standardized Approach.";
  }

  const points = downsample(rawPoints, 60);

  return {
    window: rawPoints.length,
    points,
    spearmanCorrelation: spearman,
    meanAbsResidualPct,
    zone,
    notes,
  };
}

/** Spearman rank correlation coefficient. */
function spearmanCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;
  const rx = rank(x);
  const ry = rank(y);
  return pearson(rx, ry);
}

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j < indexed.length - 1 && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}
