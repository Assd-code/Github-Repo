// Risk-Adjusted Performance Metrics
// Computes standard portfolio-performance statistics from the historical
// daily-return series of the portfolio:
//   - Annualized return & volatility
//   - Sharpe ratio (rf=0 by default; pass risk-free to override)
//   - Sortino ratio (only downside deviation penalized)
//   - Calmar ratio (CAGR / |Max drawdown|)
//   - Information ratio vs benchmark (equal-weighted index as proxy)
//   - Max drawdown (peak-to-trough on cumulative P&L)
//   - Win rate, avg win / avg loss, profit factor
//   - Best/worst day, positive/negative day counts
//   - Cumulative P&L series for charting
//   - Drawdown series for charting

import { MarketData, PortfolioConfig, Methodology } from "./types";
import { portfolioWeights } from "./market-data";
import { TRADING_DAYS } from "./market-data";

export interface PerformanceMetrics {
  /** number of trading days in the sample */
  days: number;
  /** annualized return (decimal, e.g. 0.10 = 10%) */
  annualReturn: number;
  /** annualized volatility (decimal) */
  annualVol: number;
  /** annualized downside deviation (Sortino denominator) */
  downsideDev: number;
  /** Sharpe ratio = (annReturn - rf) / annVol */
  sharpe: number;
  /** Sortino ratio = (annReturn - rf) / downsideDev */
  sortino: number;
  /** max drawdown as a positive fraction (e.g. 0.25 = -25%) */
  maxDrawdown: number;
  /** Calmar ratio = annReturn / maxDrawdown */
  calmar: number;
  /** Information ratio vs benchmark (equal-weighted index) */
  informationRatio: number;
  /** tracking error vs benchmark (annualized) */
  trackingError: number;
  /** win rate (% of up days) */
  winRate: number;
  /** average win on up days (USD) */
  avgWin: number;
  /** average loss on down days (USD, negative) */
  avgLoss: number;
  /** profit factor = gross profit / gross loss */
  profitFactor: number;
  /** best day P&L (USD) */
  bestDay: number;
  /** worst day P&L (USD) */
  worstDay: number;
  /** number of up days */
  upDays: number;
  /** number of down days */
  downDays: number;
  /** cumulative P&L series for charting */
  cumulative: { date: string; pnl: number; drawdown: number }[];
  /** benchmark (equal-weighted index) cumulative return */
  benchmarkCumulative: { date: string; pnl: number }[];
}

export function computePerformance(
  market: MarketData,
  portfolio: PortfolioConfig,
  riskFreeRate: number = 0.02,
  methodology: Methodology = "historical"
): PerformanceMetrics {
  const { weights } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );

  // Portfolio daily P&L = sum_i weight_i * return_i * totalValue
  const returns = market.returns.slice(1); // drop the first 0 row
  const dates = market.dates.slice(1);
  const totalValue = portfolio.totalValue;
  const portPnl = returns.map((row) => {
    let r = 0;
    for (let i = 0; i < row.length; i++) r += weights[i] * row[i];
    return r * totalValue;
  });

  // Equal-weighted benchmark across the same assets
  const nAssets = market.assets.length;
  const eqW = 1 / nAssets;
  const benchPnl = returns.map((row) => {
    let r = 0;
    for (let i = 0; i < row.length; i++) r += eqW * row[i];
    return r * totalValue;
  });

  // Daily returns in $ -> convert to fractional for ratio metrics
  const portRet = portPnl.map((p) => p / totalValue);
  const benchRet = benchPnl.map((p) => p / totalValue);

  // --- Stats ---
  const meanDaily = portRet.reduce((a, b) => a + b, 0) / portRet.length;
  const varDaily =
    portRet.reduce((s, r) => s + (r - meanDaily) ** 2, 0) /
    Math.max(portRet.length - 1, 1);
  const stdDaily = Math.sqrt(Math.max(varDaily, 1e-18));
  const annualReturn = meanDaily * TRADING_DAYS;
  const annualVol = stdDaily * Math.sqrt(TRADING_DAYS);

  // Downside deviation (only returns below 0 — Sortino uses target=0 by default)
  const downsideReturns = portRet.filter((r) => r < 0);
  const downsideVar =
    downsideReturns.reduce((s, r) => s + r * r, 0) /
    Math.max(portRet.length, 1);
  const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(TRADING_DAYS);

  const sharpe =
    annualVol > 0 ? (annualReturn - riskFreeRate) / annualVol : 0;
  const sortino =
    downsideDev > 0 ? (annualReturn - riskFreeRate) / downsideDev : 0;

  // --- Cumulative P&L and drawdown ---
  let cum = 0;
  let peak = 0;
  let maxDD = 0;
  const cumulative: PerformanceMetrics["cumulative"] = [];
  for (let i = 0; i < portPnl.length; i++) {
    cum += portPnl[i];
    if (cum > peak) peak = cum;
    const dd = cum - peak; // negative or 0
    if (dd < maxDD) maxDD = dd;
    cumulative.push({ date: dates[i], pnl: cum, drawdown: dd });
  }
  const maxDrawdownFrac = totalValue > 0 ? Math.abs(maxDD) / totalValue : 0;
  // CAGR approximation from cumulative P&L: final cumulative as fraction of book,
  // annualized via length in years.
  const years = portPnl.length / TRADING_DAYS;
  const totalReturnFrac = cum / totalValue;
  const cagr =
    years > 0 && totalReturnFrac > -1
      ? Math.pow(1 + totalReturnFrac, 1 / years) - 1
      : totalReturnFrac / Math.max(years, 1e-9);
  const calmar = maxDrawdownFrac > 0 ? cagr / maxDrawdownFrac : 0;

  // --- Information ratio vs benchmark ---
  const excessRet = portRet.map((r, i) => r - benchRet[i]);
  const meanExcess = excessRet.reduce((a, b) => a + b, 0) / excessRet.length;
  const varExcess =
    excessRet.reduce((s, r) => s + (r - meanExcess) ** 2, 0) /
    Math.max(excessRet.length - 1, 1);
  const trackingError = Math.sqrt(varExcess) * Math.sqrt(TRADING_DAYS);
  const informationRatio =
    trackingError > 0 ? (meanExcess * TRADING_DAYS) / trackingError : 0;

  // --- Win/loss stats ---
  let upDays = 0;
  let downDays = 0;
  let sumWin = 0;
  let sumLoss = 0;
  let bestDay = -Infinity;
  let worstDay = Infinity;
  for (const p of portPnl) {
    if (p > 0) {
      upDays++;
      sumWin += p;
    } else if (p < 0) {
      downDays++;
      sumLoss += p;
    }
    if (p > bestDay) bestDay = p;
    if (p < worstDay) worstDay = p;
  }
  const winRate = portPnl.length > 0 ? upDays / portPnl.length : 0;
  const avgWin = upDays > 0 ? sumWin / upDays : 0;
  const avgLoss = downDays > 0 ? sumLoss / downDays : 0;
  const profitFactor = avgLoss !== 0 ? Math.abs(sumWin / sumLoss) : Infinity;

  // Benchmark cumulative
  let benchCum = 0;
  const benchmarkCumulative: PerformanceMetrics["benchmarkCumulative"] = [];
  for (let i = 0; i < benchPnl.length; i++) {
    benchCum += benchPnl[i];
    benchmarkCumulative.push({ date: dates[i], pnl: benchCum });
  }

  return {
    days: portPnl.length,
    annualReturn,
    annualVol,
    downsideDev,
    sharpe,
    sortino,
    maxDrawdown: maxDrawdownFrac,
    calmar,
    informationRatio,
    trackingError,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    bestDay,
    worstDay,
    upDays,
    downDays,
    cumulative,
    benchmarkCumulative,
  };
}
