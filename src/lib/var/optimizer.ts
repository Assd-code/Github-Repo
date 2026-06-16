// Portfolio Optimizer
// Computes optimal portfolio weights under three classic objective functions:
//   1. Risk Parity — each asset contributes equal risk.
//   2. Minimum Variance — minimize w' Σ w subject to sum(w)=1, w≥0.
//   3. Maximum Sharpe (tangency portfolio) — maximize (w'μ - rf) / sqrt(w'Σw).
//
// Also computes the efficient frontier and reports portfolio VaR/ES at each
// optimal point so the user can see the risk/return trade-off directly.
//
// All solvers use projected gradient / fixed-point methods on the simplex
// {w : sum(w)=1, w≥0} (long-only constraint). Convergence in <500 iterations.

import { MarketData, PortfolioConfig } from "./types";
import { portfolioWeights } from "./market-data";
import { normInv } from "./rng";

export interface OptimizationResult {
  objective: "risk-parity" | "min-variance" | "max-sharpe";
  weights: { symbol: string; name: string; assetClass: string; weight: number; marketValue: number }[];
  expectedReturn: number;
  expectedVol: number;
  sharpe: number;
  var: number;
  es: number;
  varPct: number;
  iterations: number;
  converged: boolean;
  riskContributions: { symbol: string; name: string; contribution: number; share: number }[];
}

export interface EfficientFrontierPoint {
  return: number;
  vol: number;
  sharpe: number;
  var: number;
}

export interface FullOptimization {
  riskParity: OptimizationResult;
  minVariance: OptimizationResult;
  maxSharpe: OptimizationResult;
  current: {
    weights: { symbol: string; name: string; assetClass: string; weight: number; marketValue: number }[];
    expectedReturn: number;
    expectedVol: number;
    sharpe: number;
    var: number;
    es: number;
  };
  frontier: EfficientFrontierPoint[];
  riskFreeRate: number;
}

// Project a vector onto the simplex { w : sum(w) = 1, w >= 0 }.
// Wang & Carreira-Perpiñán (2013) closed-form projection.
function projectSimplex(v: number[]): number[] {
  const n = v.length;
  const u = [...v].sort((a, b) => b - a);
  let cssv = 0;
  let rho = 0;
  for (let i = 0; i < n; i++) {
    cssv += u[i];
    if (u[i] - (cssv - 1) / (i + 1) > 0) {
      rho = i;
    }
  }
  // Recompute cssv up to rho
  cssv = 0;
  for (let i = 0; i <= rho; i++) cssv += u[i];
  const theta = (cssv - 1) / (rho + 1);
  return v.map((x) => Math.max(0, x - theta));
}

function portfolioVariance(cov: number[][], w: number[]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++) {
    let s = 0;
    for (let j = 0; j < w.length; j++) s += cov[i][j] * w[j];
    v += w[i] * s;
  }
  return v;
}

function portfolioMean(mu: number[], w: number[]): number {
  let m = 0;
  for (let i = 0; i < w.length; i++) m += w[i] * mu[i];
  return m;
}

// Risk Parity — Spinu (2013) fixed-point iteration.
// Each asset contributes equal risk: w_i * (Σw)_i = c for all i.
// Iteration: w_i ← w_i * sqrt(target_i / (rc_i / totalRc)), then normalize.
// Converges fast for risk parity because the problem is essentially convex.
function optimizeRiskParity(
  cov: number[][],
  maxIter: number = 1000,
  tol: number = 1e-8
): { weights: number[]; iterations: number; converged: boolean } {
  const n = cov.length;
  let w = new Array(n).fill(1 / n);
  const target = new Array(n).fill(1 / n); // equal risk budget

  let converged = false;
  let iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    const covW = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += cov[i][j] * w[j];
      covW[i] = s;
    }
    // Risk contribution: w_i * (Σw)_i (these sum to total variance)
    const rc = w.map((wi, i) => wi * covW[i]);
    const totalRc = rc.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
    const newW = new Array(n);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const normRc = Math.max(rc[i], 0) / totalRc;
      const factor = Math.sqrt(target[i] / Math.max(normRc, 1e-12));
      // Damped update
      newW[i] = w[i] * (0.5 + 0.5 * factor);
      maxDelta = Math.max(maxDelta, Math.abs(newW[i] - w[i]));
    }
    // Normalize to simplex
    const sum = newW.reduce((a, b) => a + b, 0) || 1;
    for (let i = 0; i < n; i++) newW[i] /= sum;
    w = newW;
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }
  return { weights: w, iterations: iter, converged };
}

// Minimum Variance — minimize w' Σ w s.t. sum(w)=1, w≥0.
// Use inverse-variance weighting as warm start, then refine with projected
// Newton step. For long-only portfolios the inverse-variance solution is
// often already very close to optimal.
function optimizeMinVariance(
  cov: number[][],
  maxIter: number = 500,
  tol: number = 1e-12
): { weights: number[]; iterations: number; converged: boolean } {
  const n = cov.length;
  // Warm start: inverse-variance weighting (analytic for diagonal Σ)
  const invVar = cov.map((_, i) => 1 / Math.max(cov[i][i], 1e-12));
  const invVarSum = invVar.reduce((a, b) => a + b, 0);
  let w = invVar.map((v) => v / invVarSum);

  // Refine via projected gradient descent on w' Σ w.
  // Step size: 1/L where L = 2 * largest eigenvalue ≈ 2 * max(diag) for diagonally-dominant Σ.
  const maxVar = Math.max(...cov.map((row, i) => row[i]));
  const lr = 1 / Math.max(2 * maxVar * 2, 1e-6);
  let converged = false;
  let iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += cov[i][j] * w[j];
      grad[i] = 2 * s;
    }
    // Gradient step
    const step = w.map((wi, i) => wi - lr * grad[i]);
    const newW = projectSimplex(step);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) maxDelta = Math.max(maxDelta, Math.abs(newW[i] - w[i]));
    w = newW;
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }
  return { weights: w, iterations: iter, converged };
}

// Maximum Sharpe — maximize (w'μ - rf) / sqrt(w'Σw) s.t. sum(w)=1, w≥0.
// Use a tilted warm start (toward highest-Sharpe assets) then refine with
// projected gradient ascent on the Sharpe ratio.
function optimizeMaxSharpe(
  cov: number[][],
  mu: number[],
  rfDaily: number,
  maxIter: number = 1000,
  tol: number = 1e-9
): { weights: number[]; iterations: number; converged: boolean } {
  const n = cov.length;
  // Warm start: tilt toward highest Sharpe per-asset
  const perAssetSharpe = mu.map((m, i) => (m - rfDaily) / Math.sqrt(Math.max(cov[i][i], 1e-12)));
  const pos = perAssetSharpe.map((s) => Math.max(0, s));
  const posSum = pos.reduce((a, b) => a + b, 0);
  let w = posSum > 0 ? pos.map((p) => p / posSum) : new Array(n).fill(1 / n);

  // Refine via projected gradient ascent.
  // d Sharpe / d w_i = (mu_i - rf - sharpe * (Σw)_i / sig) / sig
  const lr = 0.5; // step size
  let converged = false;
  let iter = 0;
  for (iter = 0; iter < maxIter; iter++) {
    const covW = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += cov[i][j] * w[j];
      covW[i] = s;
    }
    const varP = w.reduce((acc, wi, i) => acc + wi * covW[i], 0);
    const sigP = Math.sqrt(Math.max(varP, 1e-18));
    const retP = portfolioMean(mu, w);
    const sharpeP = (retP - rfDaily) / sigP;

    // grad Sharpe w.r.t. w_i = (mu_i - rf - sharpe * covW_i / sig) / sig
    const grad = mu.map((m, i) => (m - rfDaily - (sharpeP * covW[i]) / sigP) / sigP);

    // Step
    const step = w.map((wi, i) => wi + lr * grad[i] * 0.5);
    const newW = projectSimplex(step);
    let maxDelta = 0;
    for (let i = 0; i < n; i++) maxDelta = Math.max(maxDelta, Math.abs(newW[i] - w[i]));
    w = newW;
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }
  return { weights: w, iterations: iter, converged };
}

// Compute efficient frontier: for each target return, find the min-variance
// portfolio achieving that return. Uses penalty method.
function computeEfficientFrontier(
  cov: number[][],
  mu: number[],
  rfAnnual: number,
  points: number = 40
): EfficientFrontierPoint[] {
  const n = cov.length;
  const sortedMu = [...mu].sort((a, b) => a - b);
  const minRet = sortedMu[0];
  const maxRet = sortedMu[sortedMu.length - 1];
  const rfDaily = rfAnnual / 252;

  const frontier: EfficientFrontierPoint[] = [];
  for (let p = 0; p < points; p++) {
    const target = minRet + (maxRet - minRet) * (p / (points - 1));
    // Minimize w' Σ w + λ(w'μ - target)^2 via projected gradient
    let w = new Array(n).fill(1 / n);
    const maxVar = Math.max(...cov.map((row, i) => row[i]));
    const lr = 1 / Math.max(2 * maxVar * 2, 1e-6);
    const lambda = 1e8; // heavy penalty
    for (let iter = 0; iter < 300; iter++) {
      const covW = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let j = 0; j < n; j++) s += cov[i][j] * w[j];
        covW[i] = s;
      }
      const retP = portfolioMean(mu, w);
      const retErr = retP - target;
      const grad = mu.map((m, i) => 2 * covW[i] + 2 * lambda * retErr * m);
      const step = w.map((wi, i) => wi - lr * grad[i]);
      const newW = projectSimplex(step);
      let maxDelta = 0;
      for (let i = 0; i < n; i++) maxDelta = Math.max(maxDelta, Math.abs(newW[i] - w[i]));
      w = newW;
      if (maxDelta < 1e-12) break;
    }
    const varP = portfolioVariance(cov, w);
    const sigP = Math.sqrt(Math.max(varP, 1e-18));
    const retP = portfolioMean(mu, w);
    const annRet = retP * 252;
    const annVol = sigP * Math.sqrt(252);
    const sharpe = annVol > 0 ? (annRet - rfAnnual) / annVol : 0;
    const z = normInv(0.99);
    const var1d = Math.max(0, z * sigP - retP); // fraction of book
    frontier.push({
      return: annRet,
      vol: annVol,
      sharpe,
      var: var1d,
    });
  }
  return frontier;
}

function buildResult(
  objective: OptimizationResult["objective"],
  weights: number[],
  iterations: number,
  converged: boolean,
  market: MarketData,
  totalValue: number,
  confidence: number,
  horizon: number,
  rf: number
): OptimizationResult {
  const n = market.assets.length;
  const mu = market.mean; // daily
  const cov = market.cov;
  const sigP = Math.sqrt(Math.max(portfolioVariance(cov, weights), 1e-18));
  const retP = portfolioMean(mu, weights);
  const annRet = retP * 252;
  const annVol = sigP * Math.sqrt(252);
  const sharpe = annVol > 0 ? (annRet - rf) / annVol : 0;
  const z = normInv(confidence);
  const muH = retP * horizon;
  const sigH = sigP * Math.sqrt(horizon);
  const varUsd = Math.max(0, z * sigH - muH) * totalValue;
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const esUsd = Math.max(0, (sigH * phi) / (1 - confidence) - muH) * totalValue;

  // Per-asset risk contribution
  const covW = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += cov[i][j] * weights[j];
    covW[i] = s;
  }
  const totalVar = weights.reduce((acc, wi, i) => acc + wi * covW[i], 0) || 1;
  const riskContributions = market.assets
    .map((a, i) => ({
      symbol: a.symbol,
      name: a.name,
      contribution: weights[i] * covW[i],
      share: totalVar > 0 ? (weights[i] * covW[i]) / totalVar : 0,
    }))
    .filter((_, i) => weights[i] > 0.0001)
    .sort((a, b) => b.contribution - a.contribution);

  const weightsOut = market.assets
    .map((a, i) => ({
      symbol: a.symbol,
      name: a.name,
      assetClass: a.assetClass,
      weight: weights[i],
      marketValue: weights[i] * totalValue,
    }))
    .filter((w) => w.weight > 0.0001)
    .sort((a, b) => b.weight - a.weight);

  return {
    objective,
    weights: weightsOut,
    expectedReturn: annRet,
    expectedVol: annVol,
    sharpe,
    var: varUsd,
    es: esUsd,
    varPct: varUsd / totalValue,
    iterations,
    converged,
    riskContributions,
  };
}

export function optimizePortfolio(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1,
  riskFreeRate: number = 0.02
): FullOptimization {
  const n = market.assets.length;
  const mu = market.mean; // daily
  const cov = market.cov;
  const rf = riskFreeRate;
  const rfDaily = rf / 252;

  const rp = optimizeRiskParity(cov);
  const mv = optimizeMinVariance(cov);
  const ms = optimizeMaxSharpe(cov, mu, rfDaily);

  const rpResult = buildResult("risk-parity", rp.weights, rp.iterations, rp.converged, market, portfolio.totalValue, confidence, horizon, rf);
  const mvResult = buildResult("min-variance", mv.weights, mv.iterations, mv.converged, market, portfolio.totalValue, confidence, horizon, rf);
  const msResult = buildResult("max-sharpe", ms.weights, ms.iterations, ms.converged, market, portfolio.totalValue, confidence, horizon, rf);

  // Current portfolio stats
  const { weights: curW } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const curSig = Math.sqrt(Math.max(portfolioVariance(cov, curW), 1e-18));
  const curRet = portfolioMean(mu, curW);
  const curAnnRet = curRet * 252;
  const curAnnVol = curSig * Math.sqrt(252);
  const curSharpe = curAnnVol > 0 ? (curAnnRet - rf) / curAnnVol : 0;
  const z = normInv(confidence);
  const curVar = Math.max(0, z * curSig * Math.sqrt(horizon) - curRet * horizon) * portfolio.totalValue;
  const phi = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  const curEs = Math.max(0, (curSig * Math.sqrt(horizon) * phi) / (1 - confidence) - curRet * horizon) * portfolio.totalValue;

  const current: FullOptimization["current"] = {
    weights: market.assets
      .map((a, i) => ({
        symbol: a.symbol,
        name: a.name,
        assetClass: a.assetClass,
        weight: curW[i],
        marketValue: curW[i] * portfolio.totalValue,
      }))
      .filter((w) => w.weight > 0.0001)
      .sort((a, b) => b.weight - a.weight),
    expectedReturn: curAnnRet,
    expectedVol: curAnnVol,
    sharpe: curSharpe,
    var: curVar,
    es: curEs,
  };

  const frontier = computeEfficientFrontier(cov, mu, rf, 40);

  return {
    riskParity: rpResult,
    minVariance: mvResult,
    maxSharpe: msResult,
    current,
    frontier,
    riskFreeRate: rf,
  };
}
