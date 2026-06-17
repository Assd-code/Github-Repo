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
  /** VaR estimate per methodology at that point (round 3 multi-method overlay) */
  byMethod?: Record<string, number>;
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

// ---- New feature types (round 3) ----

/** A VaR limit definition (persisted in the database). */
export interface VarLimitDef {
  id: string;
  scope: string;
  label: string;
  method: Methodology;
  confidence: number;
  horizon: number;
  limitUsd: number;
  softLimitUsd: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Live VaR-vs-limit monitoring result. */
export interface LimitMonitoring {
  limits: VarLimitDef[];
  /** the live VaR computed with each limit's method/confidence/horizon */
  readings: {
    limit: VarLimitDef;
    var: number;
    es: number;
    /** var / limitUsd — 1.0 means at the hard limit */
    utilization: number;
    /** "ok" | "warning" (above soft) | "breach" (above hard) */
    status: "ok" | "warning" | "breach";
    headroomUsd: number;
  }[];
  /** overall worst status across all active limits */
  worstStatus: "ok" | "warning" | "breach";
  breachCount: number;
  warningCount: number;
}

/** A user-defined custom stress scenario (persisted). */
export interface CustomScenario {
  id?: string;
  name: string;
  description: string;
  type: "custom";
  shocks: Record<string, number>;
  createdAt?: string;
  updatedAt?: string;
}

/** Result of running a custom scenario against the portfolio. */
export interface CustomScenarioResult {
  name: string;
  pnl: number;
  pnlPct: number;
  breachesVar: boolean;
  perAsset: { symbol: string; name: string; shock: number; pnl: number; assetClass: AssetClass }[];
  worstContributor: { symbol: string; pnl: number };
  bestContributor: { symbol: string; pnl: number };
}

// ---- New feature types (round 5) ----

/** An option position with Greeks for delta-gamma VaR. */
export interface OptionPosition {
  symbol: string;
  /** underlying asset symbol (must exist in market.assets) */
  underlying: string;
  /** "call" | "put" */
  type: "call" | "put";
  /** "long" | "short" */
  direction: "long" | "short";
  /** number of contracts (each on `contractSize` units of underlying) */
  quantity: number;
  /** contract size (e.g. 100 for standard equity options) */
  contractSize: number;
  /** strike price */
  strike: number;
  /** time to maturity in years */
  maturity: number;
  /** implied volatility (annualized, decimal) */
  impliedVol: number;
  /** risk-free rate (annualized, decimal) */
  riskFreeRate: number;
}

/** Greeks for a single option position. */
export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  /** the option's theoretical price */
  price: number;
}

/** Result of the derivatives/Greeks analysis. */
export interface DerivativesAnalysis {
  positions: (OptionPosition & {
    greeks: Greeks;
    /** market value of the position (price * qty * contractSize) */
    marketValue: number;
    /** notional exposure = delta * qty * contractSize * spot */
    notionalDelta: number;
  })[];
  /** portfolio-aggregated Greeks */
  portfolioGreeks: {
    delta: number;
    gamma: number;
    vega: number;
    theta: number;
    rho: number;
  };
  /** VaR comparison: linear (delta-only) vs delta-gamma approximation vs full-reval */
  varComparison: {
    deltaOnly: number;
    deltaGamma: number;
    fullReval: number;
    /** the gamma adjustment as % of delta-only VaR */
    gammaAdjustPct: number;
  };
  /** sensitivity table: P&L for ±N% moves in each underlying */
  sensitivities: {
    underlying: string;
    moves: { pct: number; deltaPnl: number; deltaGammaPnl: number; fullPnl: number }[];
  }[];
}

/** Historical VaR comparison: where does today's VaR sit vs the 250-day distribution? */
export interface HistoricalVarComparison {
  methodology: Methodology;
  confidence: number;
  /** today's VaR (the current estimate) */
  currentVar: number;
  /** statistics over the rolling VaR series */
  stats: {
    mean: number;
    median: number;
    p5: number;
    p25: number;
    p75: number;
    p95: number;
    min: number;
    max: number;
    std: number;
  };
  /** percentile of current VaR within the historical distribution (0-100) */
  currentPercentile: number;
  /** interpretation: "low" / "normal" / "elevated" / "high" */
  regime: "low" | "normal" | "elevated" | "high";
  /** distribution histogram for charting */
  histogram: { x: number; count: number; isCurrent: boolean }[];
}

// ---- New feature types (round 6) ----

/** Risk factor modellability assessment per FRTB MAR33. */
export interface RiskFactorAssessment {
  /** the risk factor (asset symbol) */
  symbol: string;
  name: string;
  assetClass: AssetClass;
  /** number of "real price" observations in the last 12 months */
  observationCount: number;
  /** FRTB requires >= 24 observations over 12 months, with <= 1 month gap */
  modellable: boolean;
  /** reason if non-modellable */
  reason: string;
  /** largest gap between consecutive observations (days) */
  largestGap: number;
  /** the NMRF capital surcharge if non-modellable (USD) */
  nmrfSurcharge: number;
  /** FRTB liquidity horizon assigned (days) */
  liquidityHorizon: 10 | 20 | 40 | 60 | 120;
}

export interface ModellabilityReport {
  factors: RiskFactorAssessment[];
  totalFactors: number;
  modellableCount: number;
  nonModellableCount: number;
  totalNmrfSurcharge: number;
  /** percentage of risk factors that are modellable */
  modellablePct: number;
  /** overall assessment */
  assessment: "excellent" | "good" | "warning" | "poor";
}

