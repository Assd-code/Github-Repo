// Synthetic market data generator.
// Produces realistic multi-asset price histories with:
//   - correlated returns (equities, FX, commodities, rates proxy, crypto)
//   - volatility regimes (calm -> crisis -> recovery)
//   - drift consistent with asset class
// Deterministic given a seed so backtests are reproducible.

import { AssetMeta, MarketData } from "./types";
import {
  covarianceMatrix,
  correlationFromCovariance,
  meanVector,
  cholesky,
  randNormal,
  mulberry32,
} from "./rng";

export const TRADING_DAYS = 252;

/** Default universe of tradeable assets used by the demo portfolio. */
export const DEFAULT_ASSETS: AssetMeta[] = [
  { symbol: "SPX", name: "S&P 500 Index", assetClass: "equity", drift: 0.08, vol: 0.16, spot: 5200 },
  { symbol: "AAPL", name: "Apple Inc.", assetClass: "equity", drift: 0.12, vol: 0.24, spot: 190 },
  { symbol: "XOM", name: "Exxon Mobil", assetClass: "equity", drift: 0.06, vol: 0.28, spot: 112 },
  { symbol: "TLT", name: "20+ Yr Treasury", assetClass: "rate", drift: 0.02, vol: 0.13, spot: 92 },
  { symbol: "EURUSD", name: "Euro / US Dollar", assetClass: "fx", drift: 0.0, vol: 0.09, spot: 1.08 },
  { symbol: "GOLD", name: "Gold Spot", assetClass: "commodity", drift: 0.05, vol: 0.15, spot: 2350 },
  { symbol: "BTC", name: "Bitcoin", assetClass: "crypto", drift: 0.35, vol: 0.65, spot: 64000 },
];

/** Correlation matrix aligned with DEFAULT_ASSETS order. */
const DEFAULT_CORR: number[][] = [
  // SPX  AAPL  XOM   TLT   EURUSD GOLD  BTC
  [1.0, 0.72, 0.55, -0.35, 0.30, 0.10, 0.45], // SPX
  [0.72, 1.0, 0.42, -0.28, 0.26, 0.05, 0.40], // AAPL
  [0.55, 0.42, 1.0, -0.15, 0.18, 0.30, 0.20], // XOM
  [-0.35, -0.28, -0.15, 1.0, -0.10, 0.20, -0.12], // TLT
  [0.30, 0.26, 0.18, -0.10, 1.0, 0.35, 0.22], // EURUSD
  [0.10, 0.05, 0.30, 0.20, 0.35, 1.0, 0.15], // GOLD
  [0.45, 0.40, 0.20, -0.12, 0.22, 0.15, 1.0], // BTC
];

/**
 * Generate a market data set from the given asset universe using correlated
 * geometric Brownian motion with volatility regimes. The last ~12% of the
 * history is a "crisis" period with elevated vol and negative drift to give
 * the historical-simulation tail something to bite on.
 */
export function generateMarketData(
  assets: AssetMeta[] = DEFAULT_ASSETS,
  days: number = 504,
  seed: number = 42,
  corr: number[][] = DEFAULT_CORR
): MarketData {
  const n = assets.length;
  const rng = mulberry32(seed);

  // Build covariance from per-asset annual vol and correlation matrix.
  // Daily vol = annualVol / sqrt(252).
  const dailyVols = assets.map((a) => a.vol / Math.sqrt(TRADING_DAYS));
  const cov = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => corr[i][j] * dailyVols[i] * dailyVols[j])
  );
  const L = cholesky(cov);

  // Daily drift.
  const dailyDrift = assets.map((a) => a.drift / TRADING_DAYS);

  // Regime definitions (fraction of `days`).
  // calm (0..0.55), buildup (0.55..0.70), crisis (0.70..0.85), recovery (0.85..1.0)
  const regimes = [
    { start: 0.0, end: 0.55, volMult: 1.0, driftMult: 1.0, label: "calm" },
    { start: 0.55, end: 0.7, volMult: 1.4, driftMult: 0.2, label: "buildup" },
    { start: 0.7, end: 0.85, volMult: 2.8, driftMult: -3.0, label: "crisis" },
    { start: 0.85, end: 1.0, volMult: 1.5, driftMult: 0.6, label: "recovery" },
  ];

  const prices: number[][] = [];
  const returns: number[][] = [];
  const dates: string[] = [];

  // Anchor date for the time series (end date = today-ish).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() - (days - 1) * 24 * 3600 * 1000;

  // First row: initial spots, zero return.
  prices.push(assets.map((a) => a.spot));
  returns.push(new Array(n).fill(0));
  dates.push(new Date(startMs).toISOString().slice(0, 10));

  for (let t = 1; t < days; t++) {
    const frac = t / days;
    const regime = regimes.find((r) => frac >= r.start && frac < r.end) ?? regimes[regimes.length - 1];

    // correlated daily shocks
    const z = new Array(n).fill(0).map(() => randNormal(rng));
    const shocks = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
      shocks[i] = s;
    }

    // crisis contagion: extra correlated downward shock across risk assets
    let crisisExtra = 0;
    if (regime.label === "crisis") {
      crisisExtra = -0.012 + randNormal(rng) * 0.004;
    }

    const prev = prices[t - 1];
    const newPrices = new Array(n);
    const newReturns = new Array(n);
    for (let i = 0; i < n; i++) {
      const mu = dailyDrift[i] * regime.driftMult;
      // shocks[i] already ~ N(0, dailyVol_i^2) from the Cholesky factor,
      // so we only need to scale by the regime vol multiplier.
      let r = mu + regime.volMult * shocks[i];
      // apply crisis contagion to risk assets (equity, crypto, commodity)
      if (regime.label === "crisis") {
        if (assets[i].assetClass === "equity" || assets[i].assetClass === "crypto") {
          r += crisisExtra;
        } else if (assets[i].assetClass === "commodity") {
          r += crisisExtra * 0.4;
        } else if (assets[i].assetClass === "fx") {
          r += crisisExtra * 0.3;
        } else if (assets[i].assetClass === "rate") {
          // treasuries rally (yield down => TLT up) during crisis
          r += -crisisExtra * 0.5;
        }
      }
      newPrices[i] = prev[i] * Math.exp(r);
      newReturns[i] = r;
    }
    prices.push(newPrices);
    returns.push(newReturns);
    const d = new Date(startMs + t * 24 * 3600 * 1000);
    // skip weekends for realism in date labels
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Recompute covariance/mean/vol from the *realized* returns (drop first row).
  const realized = returns.slice(1);
  const realizedCov = covarianceMatrix(realized);
  const realizedMean = meanVector(realized);
  const realizedVol = realizedMean.map((_, i) => Math.sqrt(realizedCov[i][i]));

  return {
    assets,
    prices,
    returns,
    dates,
    cov: realizedCov,
    mean: realizedMean,
    vol: realizedVol,
  };
}

/** Build a correlation matrix view for reporting. */
export function correlationMatrix(market: MarketData): number[][] {
  return correlationFromCovariance(market.cov);
}

/**
 * Build portfolio weights from positions + latest prices.
 * If totalValue is provided we treat it as the target book size and scale
 * quantities proportionally; otherwise weights come from current market values.
 */
export function portfolioWeights(
  positions: { symbol: string; quantity: number }[],
  market: MarketData,
  totalValue: number
): { weights: number[]; marketValues: number[]; scaledQty: number[] } {
  const lastRow = market.prices[market.prices.length - 1];
  const n = market.assets.length;
  const marketValues = new Array(n).fill(0);
  const scaledQty = new Array(n).fill(0);

  // raw market values from given quantities
  const raw = new Array(n).fill(0);
  for (const p of positions) {
    const idx = market.assets.findIndex((a) => a.symbol === p.symbol);
    if (idx >= 0) raw[idx] = p.quantity * lastRow[idx];
  }
  const rawTotal = raw.reduce((a, b) => a + b, 0) || 1;

  // scale so total = totalValue
  const scale = totalValue / rawTotal;
  for (let i = 0; i < n; i++) {
    const pos = positions.find((p) => p.symbol === market.assets[i].symbol);
    scaledQty[i] = (pos ? pos.quantity : 0) * scale;
    marketValues[i] = scaledQty[i] * lastRow[i];
  }
  const weights = marketValues.map((v) => v / (totalValue || 1));
  return { weights, marketValues, scaledQty };
}
