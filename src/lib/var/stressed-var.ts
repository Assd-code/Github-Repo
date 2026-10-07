// Stressed VaR (Basel 2.5 / FRTB-style stress calibration).
// Re-runs historical-simulation VaR for the *current* portfolio over every
// contiguous `windowDays` slice of the history and reports the most adverse
// one. Multi-day horizons use overlapping horizon returns inside each window.

import { MarketData, PortfolioConfig, StressedVarResult } from "./types";
import { quantile, mean, downsample } from "./rng";
import { historicalPnlFractions } from "./methods";

function varEs(pnl: number[], confidence: number): { var: number; es: number } {
  const cutoff = quantile(pnl, 1 - confidence);
  const tail = pnl.filter((v) => v <= cutoff);
  const v = Math.max(0, -cutoff);
  return { var: v, es: tail.length > 0 ? Math.max(v, -mean(tail)) : v };
}

export function computeStressedVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1,
  windowDays: number = 250
): StressedVarResult {
  // pnl[k] is the horizon return starting on return-day k (dates[k + 1]).
  const pnl = historicalPnlFractions(market, portfolio, horizon);
  const dates = market.dates.slice(1);
  // Each window holds `windowDays` days of returns, i.e. windowDays - horizon + 1
  // horizon scenarios. Shrink the window if the history is shorter.
  const span = Math.max(horizon + 1, Math.min(windowDays, dates.length));
  const perWindow = span - horizon + 1;

  const rolling: { date: string; var: number }[] = [];
  let worst = { var: -Infinity, es: 0, start: 0 };
  for (let s = 0; s + perWindow <= pnl.length; s++) {
    const r = varEs(pnl.slice(s, s + perWindow), confidence);
    rolling.push({ date: dates[s + span - 1], var: r.var * portfolio.totalValue });
    if (r.var > worst.var) worst = { var: r.var, es: r.es, start: s };
  }
  if (!Number.isFinite(worst.var)) worst = { var: 0, es: 0, start: 0 };

  const current = varEs(pnl.slice(Math.max(0, pnl.length - perWindow)), confidence);
  const V = portfolio.totalValue;

  return {
    confidence,
    horizon,
    windowDays: span,
    var: worst.var * V,
    es: worst.es * V,
    currentVar: current.var * V,
    currentEs: current.es * V,
    ratio: current.var > 0 ? worst.var / current.var : 0,
    windowStart: dates[worst.start] ?? "",
    windowEnd: dates[Math.min(dates.length - 1, worst.start + span - 1)] ?? "",
    rolling: downsample(rolling, 200),
  };
}
