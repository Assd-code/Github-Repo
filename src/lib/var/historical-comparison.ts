// Historical VaR comparison: where does today's VaR sit within the 250-day
// rolling VaR distribution? This contextualizes the current risk estimate —
// is VaR unusually low (complacency), normal, elevated, or in crisis territory?

import { MarketData, PortfolioConfig, HistoricalVarComparison, Methodology } from "./types";
import { runVar } from "./methods";
import { portfolioWeights } from "./market-data";
import { quantile, mean, std, histogram as buildHistogram } from "./rng";

export function computeHistoricalVarComparison(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology,
  confidence: number
): HistoricalVarComparison {
  // The trend module already computes the rolling VaR series; we reuse that
  // logic but only extract the VaR values (no P&L, no overlay) for speed.
  const returns = market.returns.slice(1);
  const totalDays = returns.length;
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;
  const window = 250;
  const startIdx = Math.max(window, totalDays - 150);

  const rollingVars: number[] = [];
  for (let t = startIdx; t < totalDays; t++) {
    const subReturns = returns.slice(t - window, t);
    const subMean = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const r of subReturns) s += r[i];
      subMean[i] = s / subReturns.length;
    }
    const subCov = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let a = 0; a < n; a++) {
      for (let b = a; b < n; b++) {
        let s = 0;
        for (const r of subReturns) s += (r[a] - subMean[a]) * (r[b] - subMean[b]);
        const c = s / Math.max(1, subReturns.length - 1);
        subCov[a][b] = c;
        subCov[b][a] = c;
      }
    }
    const subVol = subMean.map((_, i) => Math.sqrt(subCov[i][i]));
    const subMarket = {
      assets: market.assets,
      prices: market.prices.slice(t - window, t + 1),
      returns: [new Array(n).fill(0), ...subReturns],
      dates: market.dates.slice(t - window, t),
      cov: subCov,
      mean: subMean,
      vol: subVol,
    };
    const res = runVar(subMarket, portfolio, methodology, confidence, 1, {
      mcPaths: 1000,
      seed: 500 + t,
    });
    rollingVars.push(res.var);
  }

  // Current VaR = the last estimate.
  const currentVar = rollingVars[rollingVars.length - 1];

  // Statistics over the series.
  const stats = {
    mean: mean(rollingVars),
    median: quantile(rollingVars, 0.5),
    p5: quantile(rollingVars, 0.05),
    p25: quantile(rollingVars, 0.25),
    p75: quantile(rollingVars, 0.75),
    p95: quantile(rollingVars, 0.95),
    min: Math.min(...rollingVars),
    max: Math.max(...rollingVars),
    std: std(rollingVars),
  };

  // Percentile of current VaR.
  const sorted = [...rollingVars].sort((a, b) => a - b);
  const rank = sorted.filter((v) => v <= currentVar).length;
  const currentPercentile = (rank / sorted.length) * 100;

  // Regime classification.
  let regime: "low" | "normal" | "elevated" | "high";
  if (currentPercentile < 25) regime = "low";
  else if (currentPercentile < 75) regime = "normal";
  else if (currentPercentile < 90) regime = "elevated";
  else regime = "high";

  // Histogram for charting — mark the bin containing the current VaR.
  const hist = buildHistogram(rollingVars, 20);
  const binWidth = hist.length > 1 ? hist[1].x - hist[0].x : 1;
  const histogram = hist.map((b) => ({
    x: Math.round(b.x),
    count: b.count,
    isCurrent: currentVar >= b.x - binWidth / 2 && currentVar < b.x + binWidth / 2,
  }));

  return {
    methodology,
    confidence,
    currentVar: Math.round(currentVar),
    stats: {
      mean: Math.round(stats.mean),
      median: Math.round(stats.median),
      p5: Math.round(stats.p5),
      p25: Math.round(stats.p25),
      p75: Math.round(stats.p75),
      p95: Math.round(stats.p95),
      min: Math.round(stats.min),
      max: Math.round(stats.max),
      std: Math.round(stats.std),
    },
    currentPercentile,
    regime,
    histogram,
  };
}
