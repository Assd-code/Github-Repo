// Derivatives with Greeks: Black-Scholes option pricing, Greeks computation,
// and delta-gamma VaR approximation vs full-revaluation.
//
// The delta-gamma VaR approach approximates the non-linear P&L of an option:
//   P&L ≈ delta * dS + 0.5 * gamma * dS^2 + vega * dσ + theta * dt
// This captures the convexity that a pure delta-only (linear) VaR misses,
// which is exactly where parametric VaR fails for non-linear instruments.

import { MarketData, OptionPosition, Greeks, DerivativesAnalysis, AssetClass } from "./types";
import { normCdf, normInv, quantile, mean, std, randNormal, mulberry32 } from "./rng";

/** Standard normal probability density function. */
function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Black-Scholes call/put price. */
function bsPrice(s: number, k: number, t: number, r: number, sigma: number, isCall: boolean): number {
  if (t <= 0 || sigma <= 0) {
    // intrinsic at expiry
    return Math.max(0, isCall ? s - k : k - s);
  }
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  if (isCall) {
    return s * normCdf(d1) - k * Math.exp(-r * t) * normCdf(d2);
  }
  return k * Math.exp(-r * t) * normCdf(-d2) - s * normCdf(-d1);
}

/** Full Greeks for a Black-Scholes option. */
function bsGreeks(s: number, k: number, t: number, r: number, sigma: number, isCall: boolean): Greeks {
  if (t <= 0 || sigma <= 0) {
    const intrinsic = Math.max(0, isCall ? s - k : k - s);
    return { delta: isCall ? (s > k ? 1 : 0) : (s > k ? 0 : -1), gamma: 0, vega: 0, theta: 0, rho: 0, price: intrinsic };
  }
  const d1 = (Math.log(s / k) + (r + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  const sqrtT = Math.sqrt(t);
  const discount = Math.exp(-r * t);
  const nD1 = normPdf(d1);

  const delta = isCall ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = nD1 / (s * sigma * sqrtT);
  const vega = s * nD1 * sqrtT; // per 1.00 (100%) vol change; divide by 100 for 1%
  const theta = isCall
    ? (-(s * nD1 * sigma) / (2 * sqrtT) - r * k * discount * normCdf(d2)) / 365
    : (-(s * nD1 * sigma) / (2 * sqrtT) + r * k * discount * normCdf(-d2)) / 365;
  const rho = isCall
    ? (k * t * discount * normCdf(d2)) / 100
    : (-k * t * discount * normCdf(-d2)) / 100;
  const price = bsPrice(s, k, t, r, sigma, isCall);

  return { delta, gamma, vega, theta, rho, price };
}

const DEFAULT_OPTION_SPECS = [
  { symbol: "SPX-CALL-ATM", underlying: "SPX", type: "call" as const, direction: "long" as const, quantity: 50, contractSize: 100, maturity: 0.25, impliedVol: 0.16, riskFreeRate: 0.045, strikeOffset: 1.0 },
  { symbol: "AAPL-PUT-ATM", underlying: "AAPL", type: "put" as const, direction: "long" as const, quantity: 200, contractSize: 100, maturity: 0.166, impliedVol: 0.28, riskFreeRate: 0.045, strikeOffset: 0.95 },
  { symbol: "BTC-CALL-OTM", underlying: "BTC", type: "call" as const, direction: "short" as const, quantity: 30, contractSize: 1, maturity: 0.083, impliedVol: 0.65, riskFreeRate: 0.045, strikeOffset: 1.15 },
];

/** Build default options with strikes based on the current spot (ATM/OTM). */
export function getDefaultOptions(market?: MarketData): OptionPosition[] {
  if (!market) {
    // fallback without market data (shouldn't happen in normal use)
    return DEFAULT_OPTION_SPECS.map((s) => ({ ...s, strike: 100 }));
  }
  const lastPrices = market.prices[market.prices.length - 1];
  return DEFAULT_OPTION_SPECS.map((s) => {
    const underIdx = market.assets.findIndex((a) => a.symbol === s.underlying);
    const spot = underIdx >= 0 ? lastPrices[underIdx] : 100;
    return {
      symbol: s.symbol,
      underlying: s.underlying,
      type: s.type,
      direction: s.direction,
      quantity: s.quantity,
      contractSize: s.contractSize,
      strike: Math.round(spot * s.strikeOffset * 100) / 100,
      maturity: s.maturity,
      impliedVol: s.impliedVol,
      riskFreeRate: s.riskFreeRate,
    };
  });
}

export function computeDerivativesAnalysis(
  market: MarketData,
  options?: OptionPosition[],
  confidence: number = 0.99
): DerivativesAnalysis {
  const opts = options && options.length > 0 ? options : getDefaultOptions(market);
  const lastPrices = market.prices[market.prices.length - 1];
  const returns = market.returns.slice(1);
  const z = normInv(confidence);

  // Compute Greeks for each position.
  const positions = opts.map((opt) => {
    const underIdx = market.assets.findIndex((a) => a.symbol === opt.underlying);
    const spot = underIdx >= 0 ? lastPrices[underIdx] : 0;
    const isCall = opt.type === "call";
    const sign = opt.direction === "long" ? 1 : -1;
    const greeks = bsGreeks(spot, opt.strike, opt.maturity, opt.riskFreeRate, opt.impliedVol, isCall);
    const totalDelta = greeks.delta * opt.quantity * opt.contractSize * sign;
    const totalGamma = greeks.gamma * opt.quantity * opt.contractSize * sign;
    const marketValue = greeks.price * opt.quantity * opt.contractSize * sign;
    return {
      ...opt,
      greeks,
      marketValue,
      notionalDelta: Math.abs(totalDelta * spot),
      _totalDelta: totalDelta,
      _totalGamma: totalGamma,
      _totalVega: greeks.vega * opt.quantity * opt.contractSize * sign,
      _totalTheta: greeks.theta * opt.quantity * opt.contractSize * sign,
      _totalRho: greeks.rho * opt.quantity * opt.contractSize * sign,
      _spot: spot,
      _underIdx: underIdx,
    };
  });

  // Aggregate portfolio Greeks.
  const portfolioGreeks = {
    delta: positions.reduce((a, p) => a + (p as any)._totalDelta, 0),
    gamma: positions.reduce((a, p) => a + (p as any)._totalGamma, 0),
    vega: positions.reduce((a, p) => a + (p as any)._totalVega, 0),
    theta: positions.reduce((a, p) => a + (p as any)._totalTheta, 0),
    rho: positions.reduce((a, p) => a + (p as any)._totalRho, 0),
  };

  // ---- VaR comparison: delta-only vs delta-gamma vs full-reval ----
  // We use the historical returns of each underlying to generate P&L scenarios.
  const rng = mulberry32(7777);
  const N = 5000;
  const underlyingIndices = [...new Set(positions.map((p) => (p as any)._underIdx as number))].filter((i) => i >= 0);
  const underReturns: number[][] = [];
  for (const idx of underlyingIndices) {
    underReturns.push(returns.map((r) => r[idx]));
  }

  const deltaOnlyPnls: number[] = [];
  const deltaGammaPnls: number[] = [];
  const fullPnls: number[] = [];

  for (let s = 0; s < N; s++) {
    // Sample a historical day for each underlying (bootstrap).
    const dayIdx = Math.floor(rng() * returns.length);
    let pnlDelta = 0;
    let pnlDg = 0;
    let pnlFull = 0;

    for (const p of positions) {
      const uIdx = (p as any)._underIdx as number;
      if (uIdx < 0) continue;
      const spot = (p as any)._spot as number;
      const r = returns[dayIdx][uIdx];
      const dS = r * spot; // absolute price change
      const sign = p.direction === "long" ? 1 : -1;
      const qtyCs = p.quantity * p.contractSize;

      // Delta-only: P&L = delta * dS * qty * cs * sign
      pnlDelta += p.greeks.delta * dS * qtyCs * sign;

      // Delta-gamma: P&L = delta * dS + 0.5 * gamma * dS^2
      pnlDg += (p.greeks.delta * dS + 0.5 * p.greeks.gamma * dS * dS) * qtyCs * sign;

      // Full revaluation: reprice option at new spot.
      const newSpot = spot * (1 + r);
      const newPrice = bsPrice(newSpot, p.strike, Math.max(0.001, p.maturity - 1 / 365), p.riskFreeRate, p.impliedVol, p.type === "call");
      pnlFull += (newPrice - p.greeks.price) * qtyCs * sign;
    }
    deltaOnlyPnls.push(pnlDelta);
    deltaGammaPnls.push(pnlDg);
    fullPnls.push(pnlFull);
  }

  // VaR = -quantile(pnl, 1-conf)
  const varDeltaOnly = Math.max(0, -quantile(deltaOnlyPnls, 1 - confidence));
  const varDeltaGamma = Math.max(0, -quantile(deltaGammaPnls, 1 - confidence));
  const varFullReval = Math.max(0, -quantile(fullPnls, 1 - confidence));
  const gammaAdjustPct = varDeltaOnly > 0 ? ((varDeltaGamma - varDeltaOnly) / varDeltaOnly) * 100 : 0;

  // ---- Sensitivity table: P&L for ±N% moves in each underlying ----
  const sensitivityMoves = [-20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20];
  const sensitivityUnderlyings = [...new Set(positions.map((p) => p.underlying))];
  const sensitivities = sensitivityUnderlyings.map((underSym) => {
    const underIdx = market.assets.findIndex((a) => a.symbol === underSym);
    const spot = lastPrices[underIdx];
    const moves = sensitivityMoves.map((pct) => {
      const newSpot = spot * (1 + pct / 100);
      const dS = newSpot - spot;
      let deltaPnl = 0;
      let deltaGammaPnl = 0;
      let fullPnl = 0;
      for (const p of positions) {
        if (p.underlying !== underSym) continue;
        const sign = p.direction === "long" ? 1 : -1;
        const qtyCs = p.quantity * p.contractSize;
        deltaPnl += p.greeks.delta * dS * qtyCs * sign;
        deltaGammaPnl += (p.greeks.delta * dS + 0.5 * p.greeks.gamma * dS * dS) * qtyCs * sign;
        const newPrice = bsPrice(newSpot, p.strike, p.maturity, p.riskFreeRate, p.impliedVol, p.type === "call");
        fullPnl += (newPrice - p.greeks.price) * qtyCs * sign;
      }
      return { pct, deltaPnl: Math.round(deltaPnl), deltaGammaPnl: Math.round(deltaGammaPnl), fullPnl: Math.round(fullPnl) };
    });
    return { underlying: underSym, moves };
  });

  // Strip private fields from positions.
  const cleanPositions = positions.map((p) => {
    const { _totalDelta, _totalGamma, _totalVega, _totalTheta, _totalRho, _spot, _underIdx, ...rest } = p as any;
    return rest;
  });

  return {
    positions: cleanPositions,
    portfolioGreeks,
    varComparison: {
      deltaOnly: Math.round(varDeltaOnly),
      deltaGamma: Math.round(varDeltaGamma),
      fullReval: Math.round(varFullReval),
      gammaAdjustPct,
    },
    sensitivities,
  };
}
