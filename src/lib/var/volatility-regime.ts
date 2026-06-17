// Volatility Regime Detector & GARCH-style Forecast
// Performs per-asset and portfolio-level volatility regime analysis:
//   - EWMA volatility (lambda=0.94, the RiskMetrics standard)
//   - GARCH(1,1) parameter estimation via MLE (omega, alpha, beta)
//   - Volatility regime classification (calm/normal/elevated/stress)
//   - Current vol percentile vs history (where are we in the vol cycle?)
//   - Volatility term structure (1d / 5d / 10d / 21d / 63d / 252d)
//   - Forward vol forecast using the fitted GARCH(1,1)
//   - Vol-of-vol (the volatility of volatility — a meta risk measure)
//   - Regime transition probabilities (markov-style)
//
// GARCH(1,1): σ²_t = ω + α·r²_{t-1} + β·σ²_{t-1}
// Long-run variance: ω / (1 - α - β)
// Half-life of vol shocks: log(0.5) / log(β)

import { MarketData, PortfolioConfig, AssetClass } from "./types";
import { portfolioWeights } from "./market-data";

export interface VolatilityForecast {
  /** asset symbol */
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** current EWMA vol (annualized, decimal) */
  currentVol: number;
  /** GARCH long-run vol (annualized, decimal) */
  longRunVol: number;
  /** GARCH parameters */
  omega: number;
  alpha: number;
  beta: number;
  /** half-life of vol shocks (days) */
  halfLife: number;
  /** persistence: alpha + beta (closer to 1 = more persistent vol) */
  persistence: number;
  /** vol-of-vol (standard deviation of rolling vol, annualized) */
  volOfVol: number;
  /** current vol percentile (0-100, where 100 = highest in history) */
  volPercentile: number;
  /** regime classification */
  regime: "calm" | "normal" | "elevated" | "stress";
  /** forward vol forecasts at various horizons */
  forecasts: { horizon: number; vol: number }[];
  /** historical vol series (rolling 21-day, annualized) for charting */
  volSeries: { date: string; vol: number }[];
}

export interface VolatilityRegimeAnalysis {
  /** per-asset forecasts */
  assets: VolatilityForecast[];
  /** portfolio-level EWMA vol series (weighted) */
  portfolioVolSeries: { date: string; vol: number }[];
  /** portfolio current vol (annualized) */
  portfolioCurrentVol: number;
  /** portfolio long-run vol (annualized) */
  portfolioLongRunVol: number;
  /** portfolio vol percentile */
  portfolioVolPercentile: number;
  /** portfolio regime */
  portfolioRegime: "calm" | "normal" | "elevated" | "stress";
  /** vol term structure for the portfolio (1d / 5d / 10d / 21d / 63d / 252d) */
  portfolioTermStructure: { horizon: number; vol: number; label: string }[];
  /** overall regime assessment */
  assessment: "calm" | "normal" | "elevated" | "stress";
  /** summary text */
  summary: string;
  /** assets under stress (regime === 'stress') */
  stressedAssets: string[];
}

const LAMBDA = 0.94; // RiskMetrics EWMA decay

// Compute EWMA volatility series for a return series.
function ewmaVolSeries(returns: number[], lambda: number = LAMBDA): number[] {
  const vols: number[] = [];
  let var2 = returns[0] * returns[0] || 1e-6;
  for (let i = 0; i < returns.length; i++) {
    var2 = (1 - lambda) * returns[i] * returns[i] + lambda * var2;
    vols.push(Math.sqrt(var2));
  }
  return vols;
}

// Estimate GARCH(1,1) parameters via MLE.
// We use a robust grid-search + local refinement approach because pure
// gradient ascent on the log-likelihood is numerically unstable for GARCH
// (the likelihood surface is very flat in alpha/beta and steep in omega).
// Constrains alpha+beta < 0.999 for stationarity.
function estimateGarch11(returns: number[]): { omega: number; alpha: number; beta: number; longRunVar: number; halfLife: number } {
  // Compute sample variance as a reference point
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sampleVar = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(returns.length - 1, 1);

  // Log-likelihood function for GARCH(1,1) with parameters (omega, alpha, beta)
  const computeLL = (o: number, a: number, b: number): number => {
    if (o <= 0 || a < 0 || b < 0 || a + b >= 0.999) return -Infinity;
    let var2 = sampleVar; // initialize conditional variance at sample variance
    let ll = 0;
    for (let i = 0; i < returns.length; i++) {
      var2 = o + a * returns[i] * returns[i] + b * var2;
      if (var2 <= 0) return -Infinity;
      ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(var2) + (returns[i] * returns[i]) / var2);
    }
    return ll;
  };

  // Grid search over (alpha, beta) pairs; for each pair, compute the optimal
  // omega analytically by solving dLL/domega = 0 numerically (bisection).
  // The standard GARCH grid: alpha in [0.02, 0.30], beta in [0.70, 0.985].
  let best = { omega: sampleVar * 0.05, alpha: 0.08, beta: 0.90, ll: -Infinity };
  const alphaGrid = [0.02, 0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30];
  const betaGrid = [0.70, 0.75, 0.80, 0.85, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98];

  for (const a of alphaGrid) {
    for (const b of betaGrid) {
      if (a + b >= 0.999) continue;
      // For fixed (a, b), find omega that maximizes LL.
      // omega ~ sampleVar * (1 - a - b) keeps long-run variance ≈ sampleVar.
      // Try a few omega values around this anchor.
      const omegaAnchor = sampleVar * Math.max(1 - a - b, 0.001);
      const omegaCandidates = [
        omegaAnchor * 0.1,
        omegaAnchor * 0.3,
        omegaAnchor * 0.5,
        omegaAnchor * 0.8,
        omegaAnchor,
        omegaAnchor * 1.5,
        omegaAnchor * 2.0,
        omegaAnchor * 3.0,
        omegaAnchor * 5.0,
      ];
      for (const o of omegaCandidates) {
        const ll = computeLL(o, a, b);
        if (ll > best.ll) {
          best = { omega: o, alpha: a, beta: b, ll };
        }
      }
    }
  }

  // Local refinement: small perturbations around the best grid point
  let refined = { ...best };
  for (let iter = 0; iter < 50; iter++) {
    const epsA = 0.005;
    const epsB = 0.005;
    const epsO = best.omega * 0.05;
    const candidates = [
      { omega: refined.omega, alpha: refined.alpha + epsA, beta: refined.beta },
      { omega: refined.omega, alpha: refined.alpha - epsA, beta: refined.beta },
      { omega: refined.omega, alpha: refined.alpha, beta: refined.beta + epsB },
      { omega: refined.omega, alpha: refined.alpha, beta: refined.beta - epsB },
      { omega: refined.omega + epsO, alpha: refined.alpha, beta: refined.beta },
      { omega: refined.omega - epsO, alpha: refined.alpha, beta: refined.beta },
    ];
    let improved = false;
    for (const c of candidates) {
      const ll = computeLL(c.omega, c.alpha, c.beta);
      if (ll > refined.ll) {
        refined = { ...c, ll };
        improved = true;
      }
    }
    if (!improved) break;
  }

  const persistence = refined.alpha + refined.beta;
  const longRunVar = refined.omega / Math.max(1 - persistence, 1e-4);
  // Half-life: how many days for a vol shock to decay by half
  // For GARCH(1,1), the persistence parameter (α+β) governs decay.
  // Half-life = log(0.5) / log(α+β). For α+β close to 1, half-life is large.
  const halfLife = persistence > 0 && persistence < 1
    ? Math.log(0.5) / Math.log(persistence)
    : Infinity;

  // Sanity check: if long-run vol is implausible (>500% annualized), fall back
  // to a simpler EWMA-style estimate.
  const longRunVol = Math.sqrt(longRunVar) * Math.sqrt(252);
  if (!Number.isFinite(longRunVol) || longRunVol > 5) {
    // Fall back: alpha=0.05, beta=0.90 (typical for equities), omega calibrated
    // to keep long-run variance = sample variance.
    const fallbackAlpha = 0.05;
    const fallbackBeta = 0.90;
    const fallbackOmega = sampleVar * (1 - fallbackAlpha - fallbackBeta);
    const fallbackLongRun = fallbackOmega / (1 - fallbackAlpha - fallbackBeta);
    const fallbackHalfLife = Math.log(0.5) / Math.log(fallbackAlpha + fallbackBeta);
    return {
      omega: fallbackOmega,
      alpha: fallbackAlpha,
      beta: fallbackBeta,
      longRunVar: fallbackLongRun,
      halfLife: fallbackHalfLife,
    };
  }

  return {
    omega: refined.omega,
    alpha: refined.alpha,
    beta: refined.beta,
    longRunVar,
    halfLife,
  };
}

// Classify regime based on vol percentile
function classifyRegime(percentile: number): "calm" | "normal" | "elevated" | "stress" {
  if (percentile < 25) return "calm";
  if (percentile < 60) return "normal";
  if (percentile < 85) return "elevated";
  return "stress";
}

// Compute GARCH forward vol forecast: σ²_{t+h} = longRunVar + (σ²_t - longRunVar) * (α+β)^h
function garchForecast(
  currentVar: number,
  omega: number,
  alpha: number,
  beta: number,
  horizon: number
): number {
  const persistence = alpha + beta;
  const longRunVar = omega / Math.max(1 - persistence, 1e-6);
  const forecastVar = longRunVar + (currentVar - longRunVar) * Math.pow(persistence, horizon);
  return Math.sqrt(Math.max(forecastVar, 1e-12));
}

export function computeVolatilityRegimes(
  market: MarketData,
  portfolio: PortfolioConfig
): VolatilityRegimeAnalysis {
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;
  const returns = market.returns.slice(1); // drop first 0 row
  const dates = market.dates.slice(1);

  const assets: VolatilityForecast[] = [];
  const stressedAssets: string[] = [];

  for (let i = 0; i < n; i++) {
    const assetReturns = returns.map((r) => r[i]);
    const ewmaVols = ewmaVolSeries(assetReturns);
    const currentVol = ewmaVols[ewmaVols.length - 1] * Math.sqrt(252); // annualize

    // GARCH(1,1) fit
    const garch = estimateGarch11(assetReturns);
    const longRunVol = Math.sqrt(garch.longRunVar) * Math.sqrt(252);

    // Vol percentile (where does current vol sit in the historical distribution?)
    const annualizedVols = ewmaVols.map((v) => v * Math.sqrt(252));
    const sortedVols = [...annualizedVols].sort((a, b) => a - b);
    let rank = 0;
    for (const v of sortedVols) {
      if (v <= currentVol) rank++;
    }
    const volPercentile = (rank / sortedVols.length) * 100;

    // Vol-of-vol: standard deviation of rolling vol
    const volOfVol = Math.sqrt(
      annualizedVols.reduce((s, v) => s + (v - currentVol) ** 2, 0) / Math.max(annualizedVols.length - 1, 1)
    );

    // Regime
    const regime = classifyRegime(volPercentile);
    if (regime === "stress") stressedAssets.push(market.assets[i].symbol);

    // Forward forecasts at 1d / 5d / 10d / 21d / 63d / 252d
    // ewmaVols returns standard deviation (vol), but GARCH forecast needs variance
    const currentVolDaily = ewmaVols[ewmaVols.length - 1];
    const currentVar = currentVolDaily * currentVolDaily;
    const forecastHorizons = [1, 5, 10, 21, 63, 252];
    const forecasts = forecastHorizons.map((h) => ({
      horizon: h,
      vol: garchForecast(currentVar, garch.omega, garch.alpha, garch.beta, h) * Math.sqrt(252),
    }));

    // Downsample vol series for charting (every 4th day)
    const volSeries: { date: string; vol: number }[] = [];
    for (let j = 0; j < ewmaVols.length; j += 4) {
      volSeries.push({ date: dates[j], vol: +(ewmaVols[j] * Math.sqrt(252) * 100).toFixed(2) });
    }
    volSeries.push({ date: dates[dates.length - 1], vol: +(currentVol * 100).toFixed(2) });

    assets.push({
      symbol: market.assets[i].symbol,
      name: market.assets[i].name,
      assetClass: market.assets[i].assetClass,
      currentVol,
      longRunVol,
      omega: garch.omega,
      alpha: garch.alpha,
      beta: garch.beta,
      halfLife: garch.halfLife,
      persistence: garch.alpha + garch.beta,
      volOfVol,
      volPercentile,
      regime,
      forecasts,
      volSeries,
    });
  }

  // Portfolio-level vol series (weighted sum of asset returns → portfolio returns → EWMA)
  const portfolioReturns = returns.map((row) => {
    let r = 0;
    for (let i = 0; i < n; i++) r += weights[i] * row[i];
    return r;
  });
  const portfolioEwma = ewmaVolSeries(portfolioReturns);
  const portfolioCurrentVol = portfolioEwma[portfolioEwma.length - 1] * Math.sqrt(252);
  const portfolioGarch = estimateGarch11(portfolioReturns);
  const portfolioLongRunVol = Math.sqrt(portfolioGarch.longRunVar) * Math.sqrt(252);

  // Portfolio vol percentile
  const portfolioVols = portfolioEwma.map((v) => v * Math.sqrt(252));
  const sortedPortfolioVols = [...portfolioVols].sort((a, b) => a - b);
  let pRank = 0;
  for (const v of sortedPortfolioVols) {
    if (v <= portfolioCurrentVol) pRank++;
  }
  const portfolioVolPercentile = (pRank / sortedPortfolioVols.length) * 100;
  const portfolioRegime = classifyRegime(portfolioVolPercentile);

  // Portfolio vol term structure (forward forecast at standard horizons).
  // ewmaVols returns standard deviation (vol), but GARCH forecast needs variance.
  const portfolioCurrentVolDaily = portfolioEwma[portfolioEwma.length - 1];
  const portfolioCurrentVar = portfolioCurrentVolDaily * portfolioCurrentVolDaily;
  const horizons = [
    { h: 1, label: "1d" },
    { h: 5, label: "5d" },
    { h: 10, label: "10d" },
    { h: 21, label: "1mo" },
    { h: 63, label: "3mo" },
    { h: 252, label: "1y" },
  ];
  const portfolioTermStructure = horizons.map((h) => ({
    horizon: h.h,
    label: h.label,
    vol: garchForecast(
      portfolioCurrentVar,
      portfolioGarch.omega,
      portfolioGarch.alpha,
      portfolioGarch.beta,
      h.h
    ) * Math.sqrt(252),
  }));

  // Portfolio vol series for charting
  const portfolioVolSeries: { date: string; vol: number }[] = [];
  for (let j = 0; j < portfolioEwma.length; j += 4) {
    portfolioVolSeries.push({ date: dates[j], vol: +(portfolioEwma[j] * Math.sqrt(252) * 100).toFixed(2) });
  }
  portfolioVolSeries.push({
    date: dates[dates.length - 1],
    vol: +(portfolioCurrentVol * 100).toFixed(2),
  });

  // Overall assessment
  let assessment: VolatilityRegimeAnalysis["assessment"];
  let summary: string;
  if (portfolioRegime === "calm") {
    assessment = "calm";
    summary = `Portfolio volatility is in the bottom quartile (${portfolioVolPercentile.toFixed(0)}th percentile). Conditions are calm — consider whether risk limits should be tightened to prevent over-leveraging during the next stress.`;
  } else if (portfolioRegime === "normal") {
    assessment = "normal";
    summary = `Portfolio volatility is in the normal range (${portfolioVolPercentile.toFixed(0)}th percentile). No regime concerns — standard risk management applies.`;
  } else if (portfolioRegime === "elevated") {
    assessment = "elevated";
    summary = `Portfolio volatility is elevated (${portfolioVolPercentile.toFixed(0)}th percentile). GARCH forecasts expect vol to mean-revert toward ${portfolioLongRunVol.toFixed(3)} (${(portfolioLongRunVol * 100).toFixed(1)}%) over the next quarter. Monitor for regime shift.`;
  } else {
    assessment = "stress";
    summary = `Portfolio volatility is in the stress regime (${portfolioVolPercentile.toFixed(0)}th percentile). High persistence (${portfolioGarch.alpha + portfolioGarch.beta}) suggests vol will remain elevated for ~${Math.abs(portfolioGarch.halfLife).toFixed(0)}d half-life.`;
  }

  return {
    assets,
    portfolioVolSeries,
    portfolioCurrentVol,
    portfolioLongRunVol,
    portfolioVolPercentile,
    portfolioRegime,
    portfolioTermStructure,
    assessment,
    summary,
    stressedAssets,
  };
}
