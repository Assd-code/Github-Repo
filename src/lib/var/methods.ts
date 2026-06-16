// VaR methodologies: parametric, historical simulation, Monte Carlo,
// filtered historical simulation (EWMA), and extreme value theory (GPD tail).

import {
  MarketData,
  PortfolioConfig,
  VarResult,
  Methodology,
  PnlDistribution,
} from "./types";
import {
  normInv,
  quantile,
  mean,
  std,
  sum,
  cholesky,
  matVec,
  randNormal,
  mulberry32,
  histogram,
  downsample,
} from "./rng";
import { portfolioWeights } from "./market-data";

const TRADING_DAYS = 252;

/** Convert portfolio P&L samples (as fractions of portfolio value) into a VarResult. */
function buildResult(
  methodology: Methodology,
  pnlFractions: number[],
  confidence: number,
  horizon: number,
  portfolioValue: number,
  paths?: VarResult["paths"],
  elapsedMs: number = 0
): VarResult {
  const pnl = pnlFractions
    .map((r) => r * portfolioValue)
    .filter((v) => Number.isFinite(v));
  const sorted = [...pnl].sort((a, b) => a - b);
  const lossQuantile = quantile(pnl, 1 - confidence); // negative typically
  const varValue = Math.max(0, -lossQuantile);
  const tail = pnl.filter((v) => v <= lossQuantile);
  const esValue = tail.length > 0 ? -mean(tail) : varValue;

  const distValues = downsample(sorted, 1000);
  const bins = histogram(pnl, 45);

  return {
    methodology,
    confidence,
    horizon,
    var: varValue,
    varPct: varValue / portfolioValue,
    es: esValue,
    esPct: esValue / portfolioValue,
    meanPnl: mean(pnl),
    stdPnl: std(pnl),
    p5: quantile(pnl, 0.05),
    p95: quantile(pnl, 0.95),
    worst: sorted[0],
    best: sorted[sorted.length - 1],
    distribution: { values: distValues, bins },
    paths,
    portfolioValue,
    elapsedMs,
  };
}

/** Parametric (variance-covariance) VaR assuming jointly normal returns. */
export function parametricVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number,
  horizon: number
): VarResult {
  const t0 = Date.now();
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;
  const muDaily = market.mean;
  const covDaily = market.cov;

  // portfolio daily mean & variance
  let muP = 0;
  for (let i = 0; i < n; i++) muP += weights[i] * muDaily[i];
  let varP = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) varP += weights[i] * covDaily[i][j] * weights[j];
  const sigP = Math.sqrt(Math.max(varP, 1e-18));

  // horizon scaling (sqrt-of-time)
  const muH = muP * horizon;
  const sigH = sigP * Math.sqrt(horizon);

  // Build a synthetic normal distribution for charting (and VaR via quantile).
  const rng = mulberry32(7);
  const samples: number[] = [];
  const N = 20000;
  for (let i = 0; i < N; i++) {
    samples.push(muH + sigH * randNormal(rng));
  }
  return buildResult(
    "parametric",
    samples,
    confidence,
    horizon,
    portfolio.totalValue,
    undefined,
    Date.now() - t0
  );
}

/** Historical simulation VaR using overlapping horizon returns. */
export function historicalVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number,
  horizon: number
): VarResult {
  const t0 = Date.now();
  const pnlFractions = historicalPnlFractions(market, portfolio, horizon);
  return buildResult(
    "historical",
    pnlFractions,
    confidence,
    horizon,
    portfolio.totalValue,
    undefined,
    Date.now() - t0
  );
}

/** Compute the full historical portfolio P&L fraction series (no downsampling). */
export function historicalPnlFractions(
  market: MarketData,
  portfolio: PortfolioConfig,
  horizon: number
): number[] {
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const returns = market.returns.slice(1); // drop the zero first row
  const n = market.assets.length;
  const pnlFractions: number[] = [];
  if (horizon === 1) {
    for (let t = 0; t < returns.length; t++) {
      let r = 0;
      for (let i = 0; i < n; i++) r += weights[i] * returns[t][i];
      pnlFractions.push(r);
    }
  } else {
    for (let t = 0; t + horizon <= returns.length; t++) {
      let r = 0;
      for (let h = 0; h < horizon; h++) {
        for (let i = 0; i < n; i++) r += weights[i] * returns[t + h][i];
      }
      pnlFractions.push(r);
    }
  }
  return pnlFractions;
}

/** Monte Carlo VaR with correlated GBM path simulation. */
export function monteCarloVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number,
  horizon: number,
  paths: number = 10000,
  seed: number = 12345,
  returnPaths: boolean = false
): VarResult {
  const t0 = Date.now();
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;
  const muDaily = market.mean;
  const covDaily = market.cov;
  const L = cholesky(covDaily);
  const rng = mulberry32(seed);

  const pnlFractions: number[] = [];
  const sampledPaths: { date: number; values: number[] }[] = [];
  const sampleEvery = Math.max(1, Math.floor(paths / 40));
  const lastPrices = market.prices[market.prices.length - 1];

  for (let p = 0; p < paths; p++) {
    let cumulative = 0;
    const pathValues: number[] = [];
    // step through horizon days
    for (let h = 0; h < horizon; h++) {
      const z = new Array(n).fill(0).map(() => randNormal(rng));
      const shocks = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j <= i; j++) s += L[i][j] * z[j];
        shocks[i] = s;
      }
      let dailyR = 0;
      for (let i = 0; i < n; i++) {
        const r = muDaily[i] + shocks[i];
        dailyR += weights[i] * r;
      }
      cumulative += dailyR;
      if (returnPaths && p % sampleEvery === 0) {
        // portfolio value fraction at step h
        pathValues.push(1 + cumulative);
      }
    }
    pnlFractions.push(cumulative);
    if (returnPaths && p % sampleEvery === 0) {
      sampledPaths.push({ date: p, values: pathValues });
    }
  }

  return buildResult(
    "montecarlo",
    pnlFractions,
    confidence,
    horizon,
    portfolio.totalValue,
    returnPaths ? sampledPaths : undefined,
    Date.now() - t0
  );
}

/** EWMA variance forecast for a single asset return series. */
function ewmaVariance(returns: number[], decay: number): number[] {
  const v: number[] = new Array(returns.length).fill(0);
  if (returns.length === 0) return v;
  v[0] = returns[0] * returns[0];
  for (let t = 1; t < returns.length; t++) {
    v[t] = (1 - decay) * returns[t - 1] * returns[t - 1] + decay * v[t - 1];
  }
  return v;
}

/**
 * Filtered Historical Simulation:
 *   1. Fit EWMA vol per asset.
 *   2. Standardize historical returns by their conditional vol -> residuals.
 *   3. Bootstrap residuals, rescale by *current* conditional vol forecast.
 *   4. Apply to portfolio to get P&L scenarios.
 */
export function filteredHistoricalVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number,
  horizon: number,
  decay: number = 0.94,
  seed: number = 99
): VarResult {
  const t0 = Date.now();
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const returns = market.returns.slice(1);
  const T = returns.length;
  const n = market.assets.length;

  // EWMA variance per asset and current forecast (last value).
  const ewmaVar: number[][] = [];
  const currentVol: number[] = [];
  for (let i = 0; i < n; i++) {
    const series = returns.map((r) => r[i]);
    const v = ewmaVariance(series, decay);
    ewmaVar.push(v);
    currentVol.push(Math.sqrt(v[v.length - 1]));
  }

  // Standardized residuals per asset.
  const residuals: number[][] = [];
  for (let t = 0; t < T; t++) {
    const row: number[] = [];
    for (let i = 0; i < n; i++) {
      const sd = Math.sqrt(ewmaVar[i][t]) || 1e-8;
      row.push(returns[t][i] / sd);
    }
    residuals.push(row);
  }

  // Bootstrap: draw `horizon` residual-rows per scenario, rescale by current vol,
  // accumulate portfolio return. Produce N scenarios.
  const rng = mulberry32(seed);
  const N = Math.max(5000, T);
  const pnlFractions: number[] = [];
  for (let s = 0; s < N; s++) {
    let cumR = 0;
    for (let h = 0; h < horizon; h++) {
      const idx = Math.floor(rng() * T);
      const row = residuals[idx];
      let dailyR = 0;
      for (let i = 0; i < n; i++) {
        const r = row[i] * currentVol[i];
        dailyR += weights[i] * r;
      }
      cumR += dailyR;
    }
    pnlFractions.push(cumR);
  }

  return buildResult(
    "filtered",
    pnlFractions,
    confidence,
    horizon,
    portfolio.totalValue,
    undefined,
    Date.now() - t0
  );
}

/**
 * Generalized Pareto Distribution fit via Zhang-Stephens (2009) MLE.
 * Returns {xi, sigma} for the exceedances over threshold u.
 */
function fitGPD(exceedances: number[]): { xi: number; sigma: number } | null {
  const n = exceedances.length;
  if (n < 10) return null;
  const sorted = [...exceedances].sort((a, b) => a - b);
  // Use the Zhang-Stephens profile likelihood approach.
  const priorBS = 3;
  const m = 30 + Math.floor(Math.sqrt(n));
  const theta = new Array(m);
  let j = 0;
  for (let i = 1; i <= m; i++) {
    theta[j++] = 1 / sorted[n - i] + (1 - Math.sqrt(m / (i - 0.5))) / (priorBS * sorted[0]);
  }
  // log-likelihood at each theta
  const k = n;
  const l = new Array(m);
  for (let i = 0; i < m; i++) {
    const th = theta[i];
    let s = 0;
    for (let v = 0; v < k; v++) s += Math.log1p(-th * sorted[v]);
    s = -s - k * Math.log(-s / (k * th));
    l[i] = s;
  }
  // weights
  const maxL = Math.max(...l);
  const w = l.map((li) => Math.exp(li - maxL));
  const wSum = sum(w);
  const thHat = sum(w.map((wi, i) => wi * theta[i])) / wSum;
  const sHat = -(sum(sorted.map((x) => Math.log1p(-thHat * x)))) / (k * thHat);
  const xi = -thHat * sHat;
  const sigma = sHat;
  return { xi, sigma };
}

/**
 * Extreme Value Theory overlay: fit a Generalized Pareto Distribution to the
 * tail of losses beyond a threshold and compute the high-quantile VaR via the
 * standard EVT formula. The distribution is augmented with GPD tail samples
 * for visualization.
 */
export function evtVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number,
  horizon: number,
  thresholdQuantile: number = 0.9
): VarResult {
  const t0 = Date.now();
  // Full historical P&L fractions (no downsampling) so the tail is preserved.
  const pnl = historicalPnlFractions(market, portfolio, horizon);
  const losses = pnl.filter((v) => v < 0).map((v) => -v); // positive losses
  if (losses.length < 30) {
    // not enough tail data; fall back to historical
    return buildResult("evt", pnl, confidence, horizon, portfolio.totalValue, undefined, Date.now() - t0);
  }
  const N = pnl.length;
  const u = quantile(losses, thresholdQuantile);
  const exceedances = losses.filter((l) => l > u).map((l) => l - u);
  const Nu = exceedances.length;
  const gpd = fitGPD(exceedances);

  // Analytic EVT VaR (positive loss fraction):
  //   VaR = u + (sigma/xi) * ( (N/Nu * (1-conf))^(-xi) - 1 )
  let evtVarFraction: number;
  let evtEsFraction: number;
  if (gpd && Math.abs(gpd.xi) > 1e-8) {
    const { xi, sigma } = gpd;
    const q = (N / Nu) * (1 - confidence);
    evtVarFraction = u + (sigma / xi) * (Math.pow(q, -xi) - 1);
    // EVT Expected Shortfall:
    //   ES = (VaR + sigma - xi*u) / (1 - xi)
    evtEsFraction = (evtVarFraction + sigma - xi * u) / (1 - xi);
  } else {
    // fallback: use historical quantile
    evtVarFraction = -quantile(pnl, 1 - confidence);
    evtEsFraction = evtVarFraction * 1.15;
  }

  // Build an augmented distribution for charting: keep the historical body
  // (returns above the threshold) and append GPD-sampled tail losses in the
  // correct empirical proportion (Nu/N).
  const rng = mulberry32(2024);
  const body = pnl.filter((v) => v >= -u);
  const tailSamples: number[] = [];
  if (gpd) {
    const { xi, sigma } = gpd;
    const tailCount = Math.max(5000, Math.floor(N * 0.5));
    for (let i = 0; i < tailCount; i++) {
      const u01 = rng();
      let excess: number;
      if (Math.abs(xi) < 1e-8) {
        excess = -sigma * Math.log(1 - u01);
      } else {
        excess = (sigma / xi) * (Math.pow(1 - u01, -xi) - 1);
      }
      if (excess > 0 && Number.isFinite(excess)) {
        tailSamples.push(-(u + excess));
      }
    }
  }
  // Inject the analytic EVT VaR so the distribution's quantile lands exactly
  // on the EVT estimate at the requested confidence (and scale tail proportion).
  const tailFrac = Nu / N;
  const tailNeeded = Math.floor((body.length + tailSamples.length) * tailFrac);
  const trimmedTail = tailSamples.slice().sort((a, b) => a - b).slice(0, Math.max(tailNeeded, 1));
  // ensure the EVT VaR appears as a loss sample so buildResult's quantile reflects it
  trimmedTail.push(-evtVarFraction);
  const augmented = [...body, ...trimmedTail];

  const res = buildResult("evt", augmented, confidence, horizon, portfolio.totalValue, undefined, Date.now() - t0);
  // Override with the analytic EVT estimates for accuracy at high confidence.
  res.var = evtVarFraction * portfolio.totalValue;
  res.varPct = evtVarFraction;
  res.es = evtEsFraction * portfolio.totalValue;
  res.esPct = evtEsFraction;
  return res;
}

export function runVar(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology,
  confidence: number,
  horizon: number,
  opts: { mcPaths?: number; seed?: number; decay?: number; evtThreshold?: number } = {}
): VarResult {
  switch (methodology) {
    case "parametric":
      return parametricVar(market, portfolio, confidence, horizon);
    case "historical":
      return historicalVar(market, portfolio, confidence, horizon);
    case "montecarlo":
      return monteCarloVar(
        market,
        portfolio,
        confidence,
        horizon,
        opts.mcPaths ?? 10000,
        opts.seed ?? 12345,
        true
      );
    case "filtered":
      return filteredHistoricalVar(
        market,
        portfolio,
        confidence,
        horizon,
        opts.decay ?? 0.94,
        opts.seed ?? 99
      );
    case "evt":
      return evtVar(
        market,
        portfolio,
        confidence,
        horizon,
        opts.evtThreshold ?? 0.9
      );
    default:
      return parametricVar(market, portfolio, confidence, horizon);
  }
}
