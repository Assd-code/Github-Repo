// Backtest Exception Deep-Dive
// Takes the existing backtest result and produces a richer analysis of each
// exception: clustering, magnitude, run-length, regime, asset contributions.
// Helps risk managers understand WHY exceptions happen, not just count them.

import { MarketData, PortfolioConfig, Methodology, BacktestResult } from "./types";
import { portfolioWeights } from "./market-data";
import { backtest } from "./backtest";

export interface ExceptionDetail {
  date: string;
  pnl: number; // USD loss (negative)
  var: number; // VaR at the time (USD)
  excess: number; // pnl - (-var) = how much the loss exceeded VaR (negative = deeper)
  excessPct: number; // excess as fraction of VaR
  /** run length: how many consecutive exceptions this one belongs to */
  runLength: number;
  /** run index: which cluster of consecutive exceptions */
  runIndex: number;
  /** regime label for that day */
  regime: "calm" | "buildup" | "crisis" | "recovery";
  /** top 3 asset contributors to that day's loss */
  topContributors: { symbol: string; name: string; contribution: number; assetClass: string }[];
  /** severity classification */
  severity: "minor" | "moderate" | "severe" | "extreme";
}

export interface ExceptionDeepDive {
  /** all exceptions with detailed analysis */
  exceptions: ExceptionDetail[];
  /** clustering stats */
  clusters: {
    index: number;
    startDate: string;
    endDate: string;
    length: number;
    totalExcess: number; // total excess loss across the cluster (USD)
    regime: string;
  }[];
  /** summary stats */
  stats: {
    totalExceptions: number;
    expectedExceptions: number;
    exceptionRate: number;
    /** longest consecutive run of exceptions */
    maxRunLength: number;
    /** number of independent exception clusters */
    clusterCount: number;
    /** average excess loss per exception (USD, negative) */
    avgExcess: number;
    /** worst single-day excess (USD) */
    worstExcess: number;
    /** clustering ratio: actual clusters / expected if iid */
    clusteringRatio: number; // >1 = clustered (bad), <1 = dispersed (good)
    /** regime breakdown: how many exceptions fell in each regime */
    byRegime: { regime: string; count: number; share: number }[];
    /** severity breakdown */
    bySeverity: { severity: string; count: number }[];
  };
  /** comparison to Basel traffic light */
  baselZone: "green" | "yellow" | "red";
  /** plain-English interpretation */
  interpretation: string;
}

function classifySeverity(excessPct: number): ExceptionDetail["severity"] {
  // excessPct is how much the loss exceeded VaR, as fraction of VaR
  // negative excessPct means loss was less than VaR (shouldn't happen for exceptions)
  // exception means pnl < -var, so excess = pnl - (-var) = pnl + var < 0
  // Use abs(excess)/var as magnitude
  if (excessPct < 0.1) return "minor"; // within 10% beyond VaR
  if (excessPct < 0.3) return "moderate";
  if (excessPct < 0.6) return "severe";
  return "extreme";
}

function getRegime(frac: number): "calm" | "buildup" | "crisis" | "recovery" {
  if (frac < 0.55) return "calm";
  if (frac < 0.7) return "buildup";
  if (frac < 0.85) return "crisis";
  return "recovery";
}

export function computeExceptionDeepDive(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology = "historical",
  confidence: number = 0.99,
  window: number = 250,
  testDays: number = 250
): ExceptionDeepDive {
  const bt: BacktestResult = backtest(market, portfolio, methodology, confidence, window, testDays);

  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const totalDays = market.returns.length - 1;

  // Identify clusters of consecutive exceptions
  const exceptions: ExceptionDetail[] = [];
  let currentRun = 0;
  let runIndex = -1;
  let lastExceptionIdx = -2;
  const clusters: ExceptionDeepDive["clusters"] = [];
  let clusterStartIdx = -1;

  bt.exceptions.forEach((exc, i) => {
    if (!exc.exception) return;
    // Determine run membership
    if (i === lastExceptionIdx + 1) {
      // continuation of current run
      currentRun++;
    } else {
      // start of new run
      if (runIndex >= 0) {
        // close out the previous cluster
        clusters[clusters.length - 1].length = currentRun;
        clusters[clusters.length - 1].endDate = bt.exceptions[lastExceptionIdx].date;
      }
      runIndex++;
      currentRun = 1;
      clusterStartIdx = i;
      clusters.push({
        index: runIndex,
        startDate: exc.date,
        endDate: exc.date,
        length: 1,
        totalExcess: 0,
        regime: getRegime(i / bt.exceptions.length),
      });
    }
    lastExceptionIdx = i;

    // Compute the day's P&L contribution per asset
    // The backtest exception pnl is the actual portfolio pnl that day.
    // We need to find the underlying day's returns to break it down.
    // bt.exceptions[i].date corresponds to a date in market.dates
    // We need to find the index in market.dates that matches.
    const dateIdx = market.dates.indexOf(exc.date);
    const dayReturns = dateIdx > 0 ? market.returns[dateIdx] : new Array(market.assets.length).fill(0);
    const contributors = market.assets
      .map((a, j) => ({
        symbol: a.symbol,
        name: a.name,
        contribution: weights[j] * dayReturns[j] * portfolio.totalValue,
        assetClass: a.assetClass,
      }))
      .filter((c) => c.contribution < 0) // only loss contributors
      .sort((a, b) => a.contribution - b.contribution) // most negative first
      .slice(0, 3);

    const excess = exc.pnl + exc.var; // exception: pnl < -var, so excess < 0
    const excessPct = exc.var > 0 ? Math.abs(excess) / exc.var : 0;
    const regime = getRegime(i / bt.exceptions.length);

    exceptions.push({
      date: exc.date,
      pnl: exc.pnl,
      var: exc.var,
      excess,
      excessPct,
      runLength: currentRun,
      runIndex,
      regime,
      topContributors: contributors,
      severity: classifySeverity(excessPct),
    });

    // Update cluster total
    if (clusters.length > 0) {
      clusters[clusters.length - 1].totalExcess += excess;
    }
  });
  // Close out last cluster
  if (clusters.length > 0) {
    clusters[clusters.length - 1].length = currentRun;
    clusters[clusters.length - 1].endDate = bt.exceptions[lastExceptionIdx]?.date || "";
  }

  // Compute summary stats
  const totalExceptions = exceptions.length;
  const expectedExceptions = bt.expectedExceptions;
  const exceptionRate = bt.exceptionRate;
  const maxRunLength = Math.max(...exceptions.map((e) => e.runLength), 0);
  const clusterCount = clusters.length;
  const avgExcess = exceptions.length > 0
    ? exceptions.reduce((s, e) => s + e.excess, 0) / exceptions.length
    : 0;
  const worstExcess = exceptions.length > 0
    ? Math.min(...exceptions.map((e) => e.excess))
    : 0;

  // Clustering ratio: if exceptions were iid, expected number of clusters ≈
  // n * (1-p) * p where p = exception rate. Actual/expected ratio.
  const p = confidence;
  const n = bt.exceptions.length;
  const expectedClusters = n * (1 - (1 - p) * (1 - p)); // approx
  const clusteringRatio = expectedClusters > 0 ? clusterCount / expectedClusters : 1;

  // Regime breakdown
  const regimeCounts: Record<string, number> = { calm: 0, buildup: 0, crisis: 0, recovery: 0 };
  for (const e of exceptions) regimeCounts[e.regime]++;
  const byRegime = Object.entries(regimeCounts).map(([regime, count]) => ({
    regime,
    count,
    share: totalExceptions > 0 ? count / totalExceptions : 0,
  }));

  // Severity breakdown
  const severityCounts: Record<string, number> = { minor: 0, moderate: 0, severe: 0, extreme: 0 };
  for (const e of exceptions) severityCounts[e.severity]++;
  const bySeverity = Object.entries(severityCounts).map(([severity, count]) => ({ severity, count }));

  // Interpretation
  let interpretation: string;
  if (clusterCount === 0 || totalExceptions === 0) {
    interpretation = `No exceptions in the ${n}-day backtest. The model is conservative at the ${confidence * 100}% confidence level.`;
  } else if (clusteringRatio > 1.5) {
    interpretation = `${totalExceptions} exceptions in ${clusterCount} clustered bursts (max run: ${maxRunLength} days). Clustering indicates the model reacts too slowly to vol-regime shifts — consider Filtered HS or shorter lookback windows.`;
  } else if (clusteringRatio < 0.7) {
    interpretation = `${totalExceptions} exceptions well-dispersed across the test window (clustering ratio ${clusteringRatio.toFixed(2)}). Independence is preserved — exceptions appear to be iid, consistent with a well-calibrated model.`;
  } else {
    interpretation = `${totalExceptions} exceptions across ${clusterCount} clusters. Slight clustering (ratio ${clusteringRatio.toFixed(2)}) but within tolerance — typical for a stable model.`;
  }

  return {
    exceptions,
    clusters,
    stats: {
      totalExceptions,
      expectedExceptions,
      exceptionRate,
      maxRunLength,
      clusterCount,
      avgExcess,
      worstExcess,
      clusteringRatio,
      byRegime,
      bySeverity,
    },
    baselZone: bt.zone,
    interpretation,
  };
}
