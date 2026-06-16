// Correlation Regime Analysis
// Splits the historical return series into volatility regimes (calm / buildup /
// crisis / recovery) using the same regime definitions as the market-data
// generator, then computes per-regime:
//   - Average correlation across all asset pairs
//   - Average pairwise correlation within each asset class
//   - Cross-asset-class correlation (equity-rate, equity-commodity, etc.)
//   - Per-regime volatility per asset
//   - "Correlation tightening" — how much correlations increase in stress
//
// This shows the user that "diversification disappears when you need it most"
// — a key insight for risk managers.

import { MarketData, PortfolioConfig, AssetClass } from "./types";

export interface RegimeStats {
  label: string;
  description: string;
  dayCount: number;
  dayShare: number; // fraction of total days
  avgCorrelation: number; // mean pairwise correlation across all asset pairs
  avgVol: number; // mean per-asset annualized vol
  // Per-asset-class stats
  byClass: {
    assetClass: AssetClass;
    avgCorrelation: number; // within-class correlation
    avgVol: number; // annualized vol
  }[];
  // Cross-asset-class correlations
  crossClass: {
    pair: string; // "equity-rate"
    correlation: number;
  }[];
  // Per-asset vol
  perAsset: { symbol: string; name: string; assetClass: AssetClass; vol: number }[];
  // stress indicator: how much avg correlation rose vs the calm baseline
  tighteningVsCalm: number;
  // regime color (for charts)
  color: string;
}

export interface CorrelationRegimeAnalysis {
  regimes: RegimeStats[];
  /** correlation differential: avg crisis correlation - avg calm correlation (systemic) */
  systemicTightening: number;
  /** asset pairs whose correlation rises the most in crisis (top 5) */
  topTighteners: { pair: string; calmCorr: number; crisisCorr: number; delta: number }[];
  /** diversification breakdown assessment */
  assessment: "stable" | "moderate-stress" | "high-stress" | "breakdown";
  /** summary text */
  summary: string;
  /** asset universe */
  assets: { symbol: string; name: string; assetClass: AssetClass }[];
}

// Regime definitions — same fractions as market-data.ts (kept in sync).
const REGIMES = [
  { start: 0.0, end: 0.55, label: "Calm", description: "Low-vol trending market — normal diversification works", color: "var(--chart-3)" },
  { start: 0.55, end: 0.7, label: "Buildup", description: "Volatility rising — correlations start to drift", color: "var(--chart-2)" },
  { start: 0.7, end: 0.85, label: "Crisis", description: "High-vol stress — diversification breaks down as correlations → 1", color: "var(--rose-500)" },
  { start: 0.85, end: 1.0, label: "Recovery", description: "Volatility fading — correlations normalize", color: "var(--chart-5)" },
];

function correlationFromReturns(returns: number[][]): number[][] {
  const n = returns.length;
  if (n === 0) return [];
  const k = returns[0].length;
  // means
  const means = new Array(k).fill(0);
  for (const row of returns) for (let i = 0; i < k; i++) means[i] += row[i];
  for (let i = 0; i < k; i++) means[i] /= n;
  // covariance
  const cov = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const row of returns) {
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        cov[i][j] += (row[i] - means[i]) * (row[j] - means[j]);
      }
    }
  }
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cov[i][j] /= Math.max(n - 1, 1);
  // correlation
  const std = cov.map((_, i) => Math.sqrt(Math.max(cov[i][i], 1e-18)));
  const corr = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      corr[i][j] = std[i] > 0 && std[j] > 0 ? cov[i][j] / (std[i] * std[j]) : 0;
    }
  }
  return corr;
}

function averagePairwiseCorrelation(corr: number[][], excludeDiagonal = true): number {
  const k = corr.length;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (excludeDiagonal && i === j) continue;
      sum += corr[i][j];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function averageWithinClass(corr: number[][], assets: { assetClass: AssetClass }[], assetClass: AssetClass): number {
  const idxs = assets.map((a, i) => ({ a, i })).filter((x) => x.a.assetClass === assetClass).map((x) => x.i);
  if (idxs.length < 2) return 1; // single asset = trivially 1
  let sum = 0;
  let count = 0;
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      sum += corr[idxs[a]][idxs[b]];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

function averageCrossClass(corr: number[][], assets: { assetClass: AssetClass }[], c1: AssetClass, c2: AssetClass): number {
  const idxs1 = assets.map((a, i) => ({ a, i })).filter((x) => x.a.assetClass === c1).map((x) => x.i);
  const idxs2 = assets.map((a, i) => ({ a, i })).filter((x) => x.a.assetClass === c2).map((x) => x.i);
  if (idxs1.length === 0 || idxs2.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const i of idxs1) {
    for (const j of idxs2) {
      sum += corr[i][j];
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}

const ASSET_CLASSES: AssetClass[] = ["equity", "fx", "commodity", "rate", "crypto"];

export function computeCorrelationRegimes(market: MarketData): CorrelationRegimeAnalysis {
  const returns = market.returns.slice(1); // drop first 0 row
  const totalDays = returns.length;
  const n = market.assets.length;

  // Compute per-regime stats
  const regimes: RegimeStats[] = [];
  let calmAvgCorr = 0;
  let crisisAvgCorr = 0;
  for (const regime of REGIMES) {
    const startIdx = Math.floor(regime.start * totalDays);
    const endIdx = Math.floor(regime.end * totalDays);
    const regimeReturns = returns.slice(startIdx, endIdx);
    if (regimeReturns.length < 5) continue;
    const corr = correlationFromReturns(regimeReturns);
    const avgCorr = averagePairwiseCorrelation(corr);
    // Per-asset vol (annualized)
    const vols = corr.map((row, i) => Math.sqrt(Math.max(row[i] * 1, 1e-18)) * Math.sqrt(252));
    // Use the diagonal of cov (which is variance) — corr diagonal is 1, so we need
    // to recompute vols from raw returns.
    const perAssetVol = market.assets.map((a, i) => {
      const series = regimeReturns.map((r) => r[i]);
      const mean = series.reduce((s, v) => s + v, 0) / Math.max(series.length, 1);
      const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(series.length - 1, 1);
      return { symbol: a.symbol, name: a.name, assetClass: a.assetClass, vol: Math.sqrt(Math.max(variance, 1e-18)) * Math.sqrt(252) };
    });
    const avgVol = perAssetVol.reduce((s, v) => s + v.vol, 0) / perAssetVol.length;
    const byClass = ASSET_CLASSES.map((cls) => ({
      assetClass: cls,
      avgCorrelation: averageWithinClass(corr, market.assets, cls),
      avgVol: perAssetVol.filter((v) => v.assetClass === cls).reduce((s, v) => s + v.vol, 0) / Math.max(perAssetVol.filter((v) => v.assetClass === cls).length, 1),
    }));
    const crossClass: RegimeStats["crossClass"] = [];
    for (let i = 0; i < ASSET_CLASSES.length; i++) {
      for (let j = i + 1; j < ASSET_CLASSES.length; j++) {
        crossClass.push({
          pair: `${ASSET_CLASSES[i]}-${ASSET_CLASSES[j]}`,
          correlation: averageCrossClass(corr, market.assets, ASSET_CLASSES[i], ASSET_CLASSES[j]),
        });
      }
    }

    regimes.push({
      label: regime.label,
      description: regime.description,
      dayCount: regimeReturns.length,
      dayShare: regimeReturns.length / totalDays,
      avgCorrelation: avgCorr,
      avgVol,
      byClass: byClass.filter((b) => !Number.isNaN(b.avgVol) && b.avgVol > 0),
      crossClass,
      perAsset: perAssetVol.sort((a, b) => b.vol - a.vol),
      tighteningVsCalm: 0, // filled below
      color: regime.color,
    });

    if (regime.label === "Calm") calmAvgCorr = avgCorr;
    if (regime.label === "Crisis") crisisAvgCorr = avgCorr;
  }

  // Fill tighteningVsCalm
  for (const r of regimes) {
    r.tighteningVsCalm = r.avgCorrelation - calmAvgCorr;
  }

  const systemicTightening = crisisAvgCorr - calmAvgCorr;

  // Top tighteners: per-asset pairs whose correlation rises most in crisis
  const calmRegime = regimes.find((r) => r.label === "Calm");
  const crisisRegime = regimes.find((r) => r.label === "Crisis");
  const topTighteners: CorrelationRegimeAnalysis["topTighteners"] = [];
  if (calmRegime && crisisRegime) {
    const calmCorr = correlationFromReturns(returns.slice(Math.floor(0 * totalDays), Math.floor(0.55 * totalDays)));
    const crisisCorr = correlationFromReturns(returns.slice(Math.floor(0.7 * totalDays), Math.floor(0.85 * totalDays)));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const calm = calmCorr[i][j];
        const crisis = crisisCorr[i][j];
        topTighteners.push({
          pair: `${market.assets[i].symbol}-${market.assets[j].symbol}`,
          calmCorr: calm,
          crisisCorr: crisis,
          delta: crisis - calm,
        });
      }
    }
    topTighteners.sort((a, b) => b.delta - a.delta);
  }

  // Assessment
  let assessment: CorrelationRegimeAnalysis["assessment"];
  let summary: string;
  if (systemicTightening < 0.05) {
    assessment = "stable";
    summary = `Correlations are stable across regimes (Δ ${(systemicTightening * 100).toFixed(1)}pp). Diversification holds up well under stress.`;
  } else if (systemicTightening < 0.15) {
    assessment = "moderate-stress";
    summary = `Moderate correlation tightening in crisis (Δ ${(systemicTightening * 100).toFixed(1)}pp). Diversification benefits partially erode under stress.`;
  } else if (systemicTightening < 0.30) {
    assessment = "high-stress";
    summary = `Significant correlation tightening in crisis (Δ ${(systemicTightening * 100).toFixed(1)}pp). Diversification benefits largely disappear when most needed.`;
  } else {
    assessment = "breakdown";
    summary = `Severe diversification breakdown (Δ ${(systemicTightening * 100).toFixed(1)}pp). Assets move together in crisis — risk concentration rises precisely when VaR is highest.`;
  }

  return {
    regimes,
    systemicTightening,
    topTighteners: topTighteners.slice(0, 6),
    assessment,
    summary,
    assets: market.assets.map((a) => ({ symbol: a.symbol, name: a.name, assetClass: a.assetClass })),
  };
}
