// Stress testing: apply historical and hypothetical shock scenarios to the
// current portfolio and compare the resulting loss to the 99% VaR.

import { MarketData, PortfolioConfig, StressScenario, StressResult } from "./types";
import { portfolioWeights } from "./market-data";
import { runVar } from "./methods";

/** Built-in stress scenarios. Shocks are multiplicative on price (0.8 = -20%). */
export function buildScenarios(market: MarketData): StressScenario[] {
  const syms = market.assets.map((a) => a.symbol);
  const shockAll = (factor: number) =>
    Object.fromEntries(syms.map((s) => [s, factor]));

  const scenarios: StressScenario[] = [
    {
      id: "lehman-2008",
      name: "Lehman Collapse (Sep 2008)",
      type: "historical",
      description:
        "Equities crash ~30%, credit spreads blow out, vol triples. Treasuries rally as a safe haven.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "equity": return [a.symbol, 0.68];
            case "crypto": return [a.symbol, 0.45];
            case "commodity": return [a.symbol, 0.75];
            case "fx": return [a.symbol, 0.92];
            case "rate": return [a.symbol, 1.12];
          }
        })
      ),
    },
    {
      id: "covid-2020",
      name: "COVID Crash (Mar 2020)",
      type: "historical",
      description:
        "Fast equity drawdown ~34%, oil collapses, then sharp recovery. Liquidity squeeze across assets.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "equity": return [a.symbol, 0.66];
            case "crypto": return [a.symbol, 0.50];
            case "commodity": return [a.symbol, 0.82];
            case "fx": return [a.symbol, 0.95];
            case "rate": return [a.symbol, 1.08];
          }
        })
      ),
    },
    {
      id: "rates-2022",
      name: "Rate Shock 2022",
      type: "historical",
      description:
        "Central banks hike aggressively. Long-duration bonds -18%, growth equities -25%, USD strengthens.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.symbol) {
            case "TLT": return [a.symbol, 0.82];
            case "SPX": return [a.symbol, 0.80];
            case "AAPL": return [a.symbol, 0.75];
            case "XOM": return [a.symbol, 1.10];
            case "EURUSD": return [a.symbol, 0.96];
            case "GOLD": return [a.symbol, 0.94];
            case "BTC": return [a.symbol, 0.65];
            default: return [a.symbol, 0.90];
          }
        })
      ),
    },
    {
      id: "equity-crash",
      name: "Equity Crash (-20%)",
      type: "hypothetical",
      description: "Sudden 20% broad equity sell-off with correlated risk assets down.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "equity": return [a.symbol, 0.80];
            case "crypto": return [a.symbol, 0.70];
            case "commodity": return [a.symbol, 0.90];
            case "fx": return [a.symbol, 0.97];
            case "rate": return [a.symbol, 1.05];
          }
        })
      ),
    },
    {
      id: "vol-spike",
      name: "Volatility Spike (VIX +120%)",
      type: "hypothetical",
      description:
        "Vol shock: equities -12%, crypto -25%, safe-haven bid in bonds & gold.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "equity": return [a.symbol, 0.88];
            case "crypto": return [a.symbol, 0.75];
            case "commodity": return [a.symbol, 1.05]; // gold rallies
            case "fx": return [a.symbol, 0.98];
            case "rate": return [a.symbol, 1.06];
          }
        })
      ),
    },
    {
      id: "crypto-wipeout",
      name: "Crypto Wipeout (-50%)",
      type: "hypothetical",
      description: "Crypto-specific deleveraging with mild risk-off spillover.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "crypto": return [a.symbol, 0.50];
            case "equity": return [a.symbol, 0.95];
            case "commodity": return [a.symbol, 0.98];
            case "fx": return [a.symbol, 0.99];
            case "rate": return [a.symbol, 1.01];
          }
        })
      ),
    },
    {
      id: "flight-to-safety",
      name: "Flight to Safety",
      type: "hypothetical",
      description: "Risk-off rotation: bonds & gold up, equities & crypto down.",
      shocks: Object.fromEntries(
        market.assets.map((a) => {
          switch (a.assetClass) {
            case "equity": return [a.symbol, 0.90];
            case "crypto": return [a.symbol, 0.80];
            case "commodity": return [a.symbol, 1.06];
            case "fx": return [a.symbol, 0.97];
            case "rate": return [a.symbol, 1.08];
          }
        })
      ),
    },
  ];

  return scenarios;
}

export function runStress(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1
): StressResult[] {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );
  const n = market.assets.length;
  const lastPrices = market.prices[market.prices.length - 1];
  const scenarios = buildScenarios(market);
  const varRef = runVar(market, portfolio, "historical", confidence, horizon).var;

  return scenarios.map((scenario) => {
    let pnl = 0;
    let worstSym = "";
    let worstPnl = Infinity;
    const perAssetPnl: { symbol: string; pnl: number }[] = [];
    for (let i = 0; i < n; i++) {
      const shock = scenario.shocks[market.assets[i].symbol] ?? 1;
      const newPrice = lastPrices[i] * shock;
      const assetPnl = (newPrice - lastPrices[i]) * (marketValues[i] / lastPrices[i]);
      pnl += assetPnl;
      perAssetPnl.push({ symbol: market.assets[i].symbol, pnl: assetPnl });
      if (assetPnl < worstPnl) {
        worstPnl = assetPnl;
        worstSym = market.assets[i].symbol;
      }
    }
    return {
      scenario,
      pnl,
      pnlPct: pnl / portfolio.totalValue,
      breachesVar: pnl < -varRef,
      worstContributor: { symbol: worstSym, pnl: worstPnl },
    };
  });
}
