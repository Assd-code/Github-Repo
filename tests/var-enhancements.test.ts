import { describe, expect, test } from "bun:test";
import { generateMarketData, DEFAULT_ASSETS } from "../src/lib/var/market-data";
import { DEFAULT_PORTFOLIO, buildFullReport } from "../src/lib/var/engine";
import { parametricVar, historicalVar } from "../src/lib/var/methods";
import { baselZone, backtest } from "../src/lib/var/backtest";
import { decompose } from "../src/lib/var/decomposition";
import { computeStressedVar } from "../src/lib/var/stressed-var";
import { normInv } from "../src/lib/var/rng";
import { portfolioWeights } from "../src/lib/var/market-data";

const market = generateMarketData(DEFAULT_ASSETS, 504, 42);
const portfolio = DEFAULT_PORTFOLIO;

describe("parametric VaR", () => {
  test("headline VaR and ES are the closed-form normal values", () => {
    const horizon = 10;
    const res = parametricVar(market, portfolio, 0.99, horizon);
    const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
    const mu = weights.reduce((a, w, i) => a + w * market.mean[i], 0) * horizon;
    let v = 0;
    for (let i = 0; i < weights.length; i++)
      for (let j = 0; j < weights.length; j++) v += weights[i] * market.cov[i][j] * weights[j];
    const sigma = Math.sqrt(v * horizon);
    const z = normInv(0.99);
    const phi = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    expect(res.varPct).toBeCloseTo(z * sigma - mu, 10);
    expect(res.esPct).toBeCloseTo((sigma * phi) / 0.01 - mu, 10);
  });
});

describe("Basel traffic light", () => {
  test("multiplier follows the Basel plus-factor table and never exceeds 4", () => {
    expect(baselZone(0)).toEqual({ zone: "green", multiplier: 3 });
    expect(baselZone(4)).toEqual({ zone: "green", multiplier: 3 });
    expect(baselZone(5)).toEqual({ zone: "yellow", multiplier: 3.4 });
    expect(baselZone(7).multiplier).toBeCloseTo(3.65);
    expect(baselZone(9).multiplier).toBeCloseTo(3.85);
    expect(baselZone(10)).toEqual({ zone: "red", multiplier: 4 });
  });
});

describe("backtest", () => {
  const bt = backtest(market, portfolio, "historical", 0.99, 250, 250);
  test("Kupiec LR is finite and non-negative", () => {
    expect(Number.isFinite(bt.kupiec.lr)).toBe(true);
    expect(bt.kupiec.lr).toBeGreaterThanOrEqual(-1e-9);
  });
  test("reports the Acerbi–Székely Z2 statistic", () => {
    expect(bt.esBacktest).toBeDefined();
    expect(Number.isFinite(bt.esBacktest!.z2)).toBe(true);
    // Z2 >= -1 by construction (it is −1 when there are no exceptions)
    expect(bt.esBacktest!.z2).toBeGreaterThanOrEqual(-1);
  });
});

describe("component ES", () => {
  test("sums to historical ES", () => {
    for (const horizon of [1, 10]) {
      const d = decompose(market, portfolio, "historical", 0.99, horizon);
      const hist = historicalVar(market, portfolio, 0.99, horizon);
      const total = d.perAsset.reduce((a, r) => a + (r.componentEs ?? 0), 0);
      expect(total).toBeCloseTo(d.totalEs!, 4);
      expect(d.totalEs! / hist.es).toBeCloseTo(1, 6);
    }
  });
});

describe("stressed VaR", () => {
  test("is at least the current-window VaR and names its window", () => {
    const s = computeStressedVar(market, portfolio, 0.99, 1, 250);
    expect(s.var).toBeGreaterThanOrEqual(s.currentVar);
    expect(s.ratio).toBeGreaterThanOrEqual(1);
    expect(s.es).toBeGreaterThanOrEqual(s.var);
    expect(s.windowStart < s.windowEnd).toBe(true);
    expect(s.rolling.length).toBeGreaterThan(0);
  });
  test("handles multi-day horizons and short histories", () => {
    const short = generateMarketData(DEFAULT_ASSETS, 120, 7);
    const s = computeStressedVar(short, portfolio, 0.99, 10, 250);
    expect(Number.isFinite(s.var)).toBe(true);
    expect(s.var).toBeGreaterThan(0);
  });
  test("is included in the full report", () => {
    const report = buildFullReport(market, portfolio, 0.99, 1, "historical");
    expect(report.stressedVar).toBeDefined();
    expect(report.decomposition.totalEs).toBeDefined();
  });
});
