// Core type definitions for the VaR risk model

export type AssetClass =
  | "equity"
  | "fx"
  | "commodity"
  | "rate"
  | "crypto";

export interface AssetMeta {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** Annualized expected return (decimal, e.g. 0.08) */
  drift: number;
  /** Annualized volatility (decimal, e.g. 0.18) */
  vol: number;
  /** Starting spot price */
  spot: number;
}

export interface Position {
  symbol: string;
  /** Number of units held (can be fractional) */
  quantity: number;
}

export interface PortfolioConfig {
  positions: Position[];
  /** Total notional / market value of the book (USD). Used to scale VaR. */
  totalValue: number;
}

export interface MarketData {
  assets: AssetMeta[];
  /** dates.length rows (chronological), each row has prices for every asset */
  prices: number[][];
  /** daily log returns matrix aligned with prices (first row = 0) */
  returns: number[][];
  dates: string[];
  /** covariance matrix of daily returns (assets x assets) */
  cov: number[][];
  /** mean daily return vector (per asset) */
  mean: number[];
  /** daily vol vector (per asset, sqrt of diagonal) */
  vol: number[];
}

export type Methodology =
  | "parametric"
  | "historical"
  | "montecarlo"
  | "filtered"
  | "evt";

export interface MethodologyLabel {
  id: Methodology;
  label: string;
  short: string;
  description: string;
}

export interface VarRequest {
  portfolio: PortfolioConfig;
  market: MarketData;
  methodology: Methodology;
  confidence: number; // e.g. 0.99
  horizon: number; // days, e.g. 1 or 10
  mcPaths?: number; // for monte carlo
  decay?: number; // EWMA decay for filtered HS
  evtThreshold?: number; // quantile for EVT tail fit, e.g. 0.95
  seed?: number;
}

export interface PnlDistribution {
  /** sorted ascending array of portfolio P&L outcomes (USD) */
  values: number[];
  /** histogram bins (for visualization) */
  bins: { x: number; count: number }[];
}

export interface VarResult {
  methodology: Methodology;
  confidence: number;
  horizon: number;
  /** VaR as a positive loss number (USD) */
  var: number;
  /** VaR expressed as a fraction of portfolio value */
  varPct: number;
  /** Expected Shortfall (CVaR), positive loss number (USD) */
  es: number;
  esPct: number;
  /** mean P&L over horizon (USD) */
  meanPnl: number;
  /** standard deviation of P&L (USD) */
  stdPnl: number;
  /** 5th percentile P&L */
  p5: number;
  /** 95th percentile P&L */
  p95: number;
  /** worst-case P&L from the simulated/historical sample */
  worst: number;
  /** best-case P&L */
  best: number;
  /** P&L distribution used to compute VaR (downsampled for charting) */
  distribution: PnlDistribution;
  /** simulated price paths (monte carlo only) — downsampled */
  paths?: { date: number; values: number[] }[];
  portfolioValue: number;
  /** elapsed compute time in ms */
  elapsedMs: number;
}

export interface BacktestException {
  date: string;
  pnl: number;
  var: number;
  exception: boolean;
}

export interface BacktestResult {
  methodology: Methodology;
  confidence: number;
  window: number;
  exceptions: BacktestException[];
  exceptionCount: number;
  expectedExceptions: number;
  exceptionRate: number;
  /** Kupiec POF (unconditional coverage) */
  kupiec: { lr: number; pValue: number; reject: boolean };
  /** Christoffersen independence + conditional coverage */
  christoffersen: {
    independenceLR: number;
    independenceP: number;
    ccLR: number;
    ccP: number;
    reject: boolean;
  };
  /** Basel traffic light zone */
  zone: "green" | "yellow" | "red";
  zoneMultiplier: number;
  /** average magnitude of exceptions (USD) */
  avgExceptionMagnitude: number;
}

export interface DecompositionResult {
  methodology: Methodology;
  totalVar: number;
  perAsset: {
    symbol: string;
    name: string;
    weight: number;
    /** marginal VaR: change in total VaR per 1% increase in weight */
    marginalVar: number;
    /** component VaR: w_i * marginalVar (sums to total) */
    componentVar: number;
    componentShare: number;
    /** incremental VaR: VaR(with) - VaR(without) */
    incrementalVar: number;
    /** standalone VaR of the asset in isolation */
    standaloneVar: number;
  }[];
}

export interface StressScenario {
  id: string;
  name: string;
  type: "historical" | "hypothetical";
  description: string;
  /** per-asset shock factors (multiplicative on price, e.g. 0.8 = -20%) */
  shocks: Record<string, number>;
}

export interface StressResult {
  scenario: StressScenario;
  /** P&L under the shocked scenario (USD, negative = loss) */
  pnl: number;
  pnlPct: number;
  /** whether the loss breaches the 99% VaR */
  breachesVar: boolean;
  /** worst single-asset contribution */
  worstContributor: { symbol: string; pnl: number };
}

export interface FullReport {
  portfolio: {
    positions: (Position & { name: string; assetClass: AssetClass; weight: number; marketValue: number })[];
    totalValue: number;
  };
  market: {
    assets: AssetMeta[];
    windowDays: number;
    correlationMatrix: number[][];
  };
  results: Record<Methodology, VarResult>;
  backtest: BacktestResult;
  decomposition: DecompositionResult;
  stress: StressResult[];
  trend: VarTrend;
  liquidity: LiquidityAdjustedVar;
  reverseStress: ReverseStressResult;
  pnlAttribution: PnlAttribution;
  generatedAt: string;
}

// ---- New feature types (round 2) ----

/** Rolling VaR trend over time — one point per trading day in the test window. */
export interface VarTrendPoint {
  date: string;
  /** 1-day VaR estimate at that point in time (USD) */
  var: number;
  /** realized P&L on that day (USD) */
  pnl: number;
  /** whether the day was a backtest exception */
  exception: boolean;
}

export interface VarTrend {
  methodology: Methodology;
  confidence: number;
  window: number;
  points: VarTrendPoint[];
  /** summary statistics over the trend */
  stats: {
    meanVar: number;
    maxVar: number;
    minVar: number;
    currentVar: number;
    /** VaR volatility (how jumpy the model is) */
    varVolatility: number;
    /** percentage of days VaR exceeded the average (proxy for procyclicality) */
    spikeDays: number;
  };
}

/** FRTB liquidity horizons (days). */
export type LiquidityHorizon = 10 | 20 | 40 | 60 | 120;

/** Liquidity-Adjusted VaR: ES scaled by FRTB's 5 liquidity horizons. */
export interface LiquidityAdjustedVar {
  confidence: number;
  /** base ES at 1-day horizon (USD) */
  baseEs: number;
  /** per-horizon scaled ES (USD) */
  horizons: {
    horizon: LiquidityHorizon;
    /** ES scaled by sqrt(horizon/10) per FRTB */
    es: number;
    /** ratio to base 10-day ES */
    ratio: number;
    /** capital contribution (ES * capital multiplier, scaled by horizon weight) */
    capital: number;
  }[];
  /** aggregated liquidity-adjusted ES (USD) — FRTB weighted combination */
  aggregatedEs: number;
  /** implied regulatory capital (multiplier 3.0, green zone) */
  regulatoryCapital: number;
}

/** Reverse stress test: find the uniform shock that produces a target loss. */
export interface ReverseStressResult {
  /** target loss as fraction of portfolio (e.g. 0.20 = -20%) */
  targetLossPct: number;
  /** target loss in USD (negative) */
  targetLoss: number;
  /** the uniform multiplicative shock factor that produces the target loss (e.g. 0.82 = -18%) */
  shockFactor: number;
  /** the implied per-asset-class shock needed */
  perAssetClass: { assetClass: AssetClass; shock: number; pnl: number }[];
  /** how the shock compares to historical extremes */
  comparison: {
    worseThanLehman: boolean;
    worseThanCovid: boolean;
    probability: string;
  };
  /** margin to ruin: how much further shock would wipe out the book */
  marginToRuin: number;
}

/** P&L attribution: risk-theoretical vs hypothetical P&L (FRTB PLA test). */
export interface PnlAttribution {
  /** date window used */
  window: number;
  /** per-day comparison */
  points: {
    date: string;
    /** P&L from risk model (risk-theoretical, using risk factor shocks) */
    riskTheoretical: number;
    /** P&L from front-office pricing (hypothetical, using all price moves) */
    hypothetical: number;
    /** difference (should be small if model is accurate) */
    residual: number;
  }[];
  /** Spearman correlation between RTPL and HPL (FRTB requires > 0.80) */
  spearmanCorrelation: number;
  /** mean absolute residual as % of portfolio value (FRTB requires < 10%) */
  meanAbsResidualPct: number;
  /** FRTB traffic light for PLA */
  zone: "green" | "amber" | "red";
  /** explanation */
  notes: string;
}
