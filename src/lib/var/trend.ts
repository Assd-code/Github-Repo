// VaR time-series trend: rolling-window VaR estimate over time, alongside
// realized P&L, to visualize how the model's risk estimate evolved and where
// exceptions clustered.

import { MarketData, PortfolioConfig, VarTrend, Methodology } from "./types";
import { runVar } from "./methods";
import { portfolioWeights } from "./market-data";
import { mean, std, downsample } from "./rng";

export function computeVarTrend(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology,
  confidence: number,
  window: number = 250,
  testDays: number = 250
): VarTrend {
  const returns = market.returns.slice(1);
  const dates = market.dates.slice(1);
  const totalDays = returns.length;
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;

  const startIdx = Math.max(window, totalDays - testDays);
  const rawPoints = [];

  for (let t = startIdx; t < totalDays; t++) {
    // Trailing window sub-market for VaR estimation.
    const subReturns = returns.slice(t - window, t);
    const subDates = dates.slice(t - window, t);
    const subPrices = market.prices.slice(t - window, t + 1);
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
      prices: subPrices,
      returns: [new Array(n).fill(0), ...subReturns],
      dates: subDates,
      cov: subCov,
      mean: subMean,
      vol: subVol,
    };

    const res = runVar(subMarket, portfolio, methodology, confidence, 1, {
      mcPaths: 1500,
      seed: 200 + t,
    });
    const varValue = res.var;
    const realizedR = weights.reduce((acc, w, i) => acc + w * returns[t][i], 0);
    const realizedPnl = realizedR * portfolio.totalValue;
    const isException = realizedPnl < -varValue;

    rawPoints.push({
      date: dates[t],
      var: Math.round(varValue),
      pnl: Math.round(realizedPnl),
      exception: isException,
    });
  }

  // Downsample to ~120 points for chart performance, but keep all exceptions.
  const step = Math.max(1, Math.floor(rawPoints.length / 120));
  const points = rawPoints.filter((_, i) => i % step === 0 || rawPoints[i].exception);

  const varValues = rawPoints.map((p) => p.var);
  const meanVar = mean(varValues);
  const maxVar = Math.max(...varValues);
  const minVar = Math.min(...varValues);
  const currentVar = varValues[varValues.length - 1];
  const varVol = std(varValues);
  const spikeDays = varValues.filter((v) => v > meanVar * 1.5).length;

  return {
    methodology,
    confidence,
    window: rawPoints.length,
    points,
    stats: {
      meanVar,
      maxVar,
      minVar,
      currentVar,
      varVolatility: varVol,
      spikeDays: rawPoints.length > 0 ? (spikeDays / rawPoints.length) * 100 : 0,
    },
  };
}
