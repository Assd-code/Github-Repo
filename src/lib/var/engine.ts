// Engine orchestrator: ties methodologies, backtesting, decomposition and
// stress testing into a single report. Also provides default presets.

import { MarketData, PortfolioConfig, Methodology, FullReport } from "./types";
import { generateMarketData, DEFAULT_ASSETS, portfolioWeights, correlationMatrix } from "./market-data";
import { runVar } from "./methods";
import { backtest } from "./backtest";
import { decompose } from "./decomposition";
import { runStress } from "./stress";
import { computeVarTrend } from "./trend";
import { computeLiquidityAdjustedVar } from "./liquidity";
import { computeReverseStress } from "./reverse-stress";
import { computePnlAttribution } from "./pla";

export const DEFAULT_PORTFOLIO: PortfolioConfig = {
  totalValue: 10_000_000,
  positions: [
    { symbol: "SPX", quantity: 800 },
    { symbol: "AAPL", quantity: 12000 },
    { symbol: "XOM", quantity: 18000 },
    { symbol: "TLT", quantity: 45000 },
    { symbol: "EURUSD", quantity: 4_000_000 },
    { symbol: "GOLD", quantity: 1400 },
    { symbol: "BTC", quantity: 45 },
  ],
};

export const METHODOLOGIES: { id: Methodology; label: string; short: string; description: string }[] = [
  {
    id: "parametric",
    label: "Parametric (Variance-Covariance)",
    short: "Parametric",
    description:
      "Assumes jointly normal returns. Fast and captures diversification via the covariance matrix, but underestimates fat tails and fails for non-linear instruments.",
  },
  {
    id: "historical",
    label: "Historical Simulation",
    short: "Historical",
    description:
      "Non-parametric: re-values the portfolio under every historical move. Captures empirical fat tails and correlations but is anchored to the chosen window.",
  },
  {
    id: "montecarlo",
    label: "Monte Carlo Simulation",
    short: "Monte Carlo",
    description:
      "Simulates thousands of correlated paths from fitted stochastic processes. Most flexible — handles path-dependency and non-linearity, but heavy compute and model-risk in process choice.",
  },
  {
    id: "filtered",
    label: "Filtered Historical Simulation",
    short: "Filtered HS",
    description:
      "EWMA-GARCH filter standardizes historical returns, then bootstraps residuals scaled to current volatility. Adapts fast to vol regimes while keeping empirical correlation.",
  },
  {
    id: "evt",
    label: "Extreme Value Theory (GPD)",
    short: "EVT",
    description:
      "Fits a Generalized Pareto Distribution to the tail beyond a threshold and blends with the historical body for smoother very-high quantiles (99.5%+).",
  },
];

export function buildFullReport(
  market: MarketData,
  portfolio: PortfolioConfig,
  confidence: number = 0.99,
  horizon: number = 1,
  primaryMethod: Methodology = "historical"
): FullReport {
  const { weights, marketValues } = portfolioWeights(
    portfolio.positions,
    market,
    portfolio.totalValue
  );

  // Run all 5 methodologies.
  const results = {
    parametric: runVar(market, portfolio, "parametric", confidence, horizon),
    historical: runVar(market, portfolio, "historical", confidence, horizon),
    montecarlo: runVar(market, portfolio, "montecarlo", confidence, horizon, {
      mcPaths: 10000,
      seed: 12345,
    }),
    filtered: runVar(market, portfolio, "filtered", confidence, horizon, {
      decay: 0.94,
    }),
    evt: runVar(market, portfolio, "evt", confidence, horizon, {
      evtThreshold: 0.9,
    }),
  } as FullReport["results"];

  // Backtest on the primary method.
  const bt = backtest(market, portfolio, primaryMethod, confidence, 250, 250);

  // Decomposition (historical-based incremental VaR).
  const decomp = decompose(market, portfolio, "historical", confidence, horizon);

  // Stress testing.
  const stress = runStress(market, portfolio, confidence, horizon);

  // New round-2 features.
  const trend = computeVarTrend(market, portfolio, primaryMethod, confidence, 250, 250);
  const liquidity = computeLiquidityAdjustedVar(market, portfolio, 0.975);
  const reverseStress = computeReverseStress(market, portfolio, 0.20);
  const pnlAttribution = computePnlAttribution(market, portfolio, 60);

  const positions = portfolio.positions.map((p, idx) => {
    const assetIdx = market.assets.findIndex((a) => a.symbol === p.symbol);
    const asset = market.assets[assetIdx];
    return {
      symbol: p.symbol,
      quantity: p.quantity,
      name: asset.name,
      assetClass: asset.assetClass,
      weight: weights[assetIdx],
      marketValue: marketValues[assetIdx],
    };
  });

  return {
    portfolio: {
      positions,
      totalValue: portfolio.totalValue,
    },
    market: {
      assets: market.assets,
      windowDays: market.dates.length,
      correlationMatrix: correlationMatrix(market),
    },
    results,
    backtest: bt,
    decomposition: decomp,
    stress,
    trend,
    liquidity,
    reverseStress,
    pnlAttribution,
    generatedAt: new Date().toISOString(),
  };
}

export { generateMarketData, DEFAULT_ASSETS };
