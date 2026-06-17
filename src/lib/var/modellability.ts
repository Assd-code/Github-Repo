// Risk factor modellability assessment per FRTB MAR33.
//
// FRTB requires each risk factor to have sufficient "real price" observations:
//   - At least 24 observations over the last 12 months
//   - No gap larger than 1 month (≈21 trading days) between consecutive observations
//
// Non-Modellable Risk Factors (NMRFs) attract a capital surcharge via the
// stressed expected shortfall approach with a prescribed shock.

import { MarketData, PortfolioConfig, ModellabilityReport, RiskFactorAssessment, AssetClass } from "./types";
import { portfolioWeights } from "./market-data";

const ASSET_CLASS_LH: Record<AssetClass, 10 | 20 | 40 | 60 | 120> = {
  equity: 10,
  fx: 20,
  commodity: 20,
  rate: 40,
  crypto: 60,
};

export function computeModellability(
  market: MarketData,
  portfolio: PortfolioConfig
): ModellabilityReport {
  const returns = market.returns.slice(1);
  const dates = market.dates.slice(1);
  const { marketValues } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;

  const factors: RiskFactorAssessment[] = [];

  for (let i = 0; i < n; i++) {
    const asset = market.assets[i];
    const series = returns.map((r) => r[i]);

    // Count non-zero observations (days with a real price move) in the last 252 days.
    const last252 = series.slice(-252);
    const observationCount = last252.filter((r) => Math.abs(r) > 1e-8).length;

    // Find the largest gap between consecutive non-zero observations.
    let largestGap = 0;
    let lastObsIdx = -1;
    for (let t = 0; t < last252.length; t++) {
      if (Math.abs(last252[t]) > 1e-8) {
        if (lastObsIdx >= 0) {
          const gap = t - lastObsIdx;
          if (gap > largestGap) largestGap = gap;
        }
        lastObsIdx = t;
      }
    }
    // If there were no observations at all, the gap is the whole window.
    if (lastObsIdx < 0) largestGap = last252.length;

    // FRTB criteria: >= 24 observations, no gap > 21 trading days (~1 month).
    const modellable = observationCount >= 24 && largestGap <= 21;
    let reason = "";
    if (!modellable) {
      if (observationCount < 24) {
        reason = `Only ${observationCount} observations (need ≥ 24)`;
      } else {
        reason = `Largest gap ${largestGap} days (need ≤ 21)`;
      }
    }

    // NMRF surcharge: for non-modellable factors, apply a stressed ES shock.
    // We approximate it as 3× the asset's contribution to portfolio ES.
    const assetWeight = marketValues[i] / portfolio.totalValue;
    const dailyVol = Math.sqrt(market.cov[i][i]);
    const nmrfSurcharge = modellable ? 0 : assetWeight * portfolio.totalValue * dailyVol * 2.5 * 3.0;

    factors.push({
      symbol: asset.symbol,
      name: asset.name,
      assetClass: asset.assetClass,
      observationCount,
      modellable,
      reason,
      largestGap,
      nmrfSurcharge,
      liquidityHorizon: ASSET_CLASS_LH[asset.assetClass],
    });
  }

  const modellableCount = factors.filter((f) => f.modellable).length;
  const nonModellableCount = factors.length - modellableCount;
  const totalNmrfSurcharge = factors.reduce((a, f) => a + f.nmrfSurcharge, 0);
  const modellablePct = factors.length > 0 ? (modellableCount / factors.length) * 100 : 100;

  let assessment: "excellent" | "good" | "warning" | "poor";
  if (modellablePct >= 100) assessment = "excellent";
  else if (modellablePct >= 80) assessment = "good";
  else if (modellablePct >= 60) assessment = "warning";
  else assessment = "poor";

  return {
    factors,
    totalFactors: factors.length,
    modellableCount,
    nonModellableCount,
    totalNmrfSurcharge,
    modellablePct,
    assessment,
  };
}
