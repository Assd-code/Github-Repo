import { describe, expect, test } from "bun:test";
import { computeStandaloneRisk, rankMarketScreenerResults } from "./market-screener";
import { getMarketUniverseSymbols } from "./market-universe";

function pricesFromReturns(returns: number[], start = 100): number[] {
  const prices = [start];
  for (const value of returns) prices.push(prices[prices.length - 1] * Math.exp(value));
  return prices;
}

describe("market screener risk model", () => {
  test("historical ES is at least as severe as VaR", () => {
    const returns = Array.from({ length: 120 }, (_, index) =>
      index % 29 === 0 ? -0.08 : index % 11 === 0 ? -0.025 : 0.003
    );
    const risk = computeStandaloneRisk(pricesFromReturns(returns), {
      method: "historical",
      confidence: 0.99,
      horizon: 1,
    });
    expect(risk.varPct).toBeGreaterThan(0);
    expect(risk.esPct).toBeGreaterThanOrEqual(risk.varPct);
    expect(risk.observations).toBe(120);
  });

  test("parametric VaR scales approximately with square root of time", () => {
    const returns = Array.from({ length: 200 }, (_, index) => index % 2 === 0 ? -0.01 : 0.01);
    const oneDay = computeStandaloneRisk(pricesFromReturns(returns), {
      method: "parametric",
      confidence: 0.99,
      horizon: 1,
    });
    const tenDay = computeStandaloneRisk(pricesFromReturns(returns), {
      method: "parametric",
      confidence: 0.99,
      horizon: 10,
    });
    expect(tenDay.varPct / oneDay.varPct).toBeCloseTo(Math.sqrt(10), 1);
  });

  test("ranking orders the largest comparable VaR first", () => {
    const base = {
      name: "Asset",
      assetClass: "equity" as const,
      spot: 100,
      esPct: 0.06,
      annualizedVol: 0.2,
      dailyChange: 0,
      observations: 100,
      esAmount: 6000,
      historyStart: "2025-01-01",
      historyEnd: "2025-12-31",
    };
    const ranked = rankMarketScreenerResults([
      { ...base, symbol: "LOW", varPct: 0.02, varAmount: 2000 },
      { ...base, symbol: "HIGH", varPct: 0.08, varAmount: 8000 },
      { ...base, symbol: "MID", varPct: 0.04, varAmount: 4000 },
    ]);
    expect(ranked.map((result) => result.symbol)).toEqual(["HIGH", "MID", "LOW"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].riskBand).toBe("extreme");
  });

  test("global universe is unique and within the API scan limit", () => {
    const symbols = getMarketUniverseSymbols("global");
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols.length).toBeGreaterThan(150);
    expect(symbols.length).toBeLessThanOrEqual(200);
  });
});
