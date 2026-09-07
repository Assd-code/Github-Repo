// Backtesting for VaR models.
// Implements:
//   - Rolling-window VaR exception tracking
//   - Kupiec POF (unconditional coverage) likelihood-ratio test
//   - Christoffersen independence & conditional coverage tests
//   - Basel traffic-light zone classification

import { MarketData, PortfolioConfig, BacktestResult, Methodology } from "./types";
import { chiSquarePValue } from "./rng";
import { runVar } from "./methods";
import { portfolioWeights } from "./market-data";

/**
 * Run a rolling backtest of the chosen methodology.
 * For each day t in the test window we:
 *   - estimate VaR using the trailing `window` days of returns,
 *   - compare against the realized P&L on day t+1.
 */
export function backtest(
  market: MarketData,
  portfolio: PortfolioConfig,
  methodology: Methodology,
  confidence: number,
  window: number = 250,
  testDays: number = 250
): BacktestResult {
  const returns = market.returns.slice(1); // drop zero first row
  const dates = market.dates.slice(1);
  const totalDays = returns.length;
  const { weights } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const n = market.assets.length;

  // Test window = the last `testDays` days.
  const startIdx = Math.max(window, totalDays - testDays);
  const exceptions: BacktestResult["exceptions"] = [];
  let exceptionCount = 0;
  let exceptionMagSum = 0;

  for (let t = startIdx; t < totalDays; t++) {
    // Trailing window sub-market.
    const subReturns = returns.slice(t - window, t);
    const subDates = dates.slice(t - window, t);
    const subPrices = market.prices.slice(t - window, t + 1);
    const subMean = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const r of subReturns) s += r[i];
      subMean[i] = s / subReturns.length;
    }
    const subCov = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let a = 0; a < n; a++) {
      for (let b = a; b < n; b++) {
        let s = 0;
        for (const r of subReturns) s += (r[a] - subMean[a]) * (r[b] - subMean[b]);
        const c = s / (subReturns.length - 1);
        subCov[a][b] = c;
        subCov[b][a] = c;
      }
    }
    const subVol = subMean.map((_, i) => Math.sqrt(subCov[i][i]));
    const subMarket = {
      assets: market.assets,
      prices: subPrices,
      returns: [new Array(n).fill(0), ...subReturns],
      dates: subDates,
      cov: subCov,
      mean: subMean,
      vol: subVol,
    };

    const res = runVar(subMarket, portfolio, methodology, confidence, 1, {
      mcPaths: 2000,
      seed: 100 + t,
    });
    const varValue = res.var;

    // realized P&L on day t (return at index t-1 applied to current portfolio value)
    const realizedR = weights.reduce((acc, w, i) => acc + w * returns[t][i], 0);
    const realizedPnl = realizedR * portfolio.totalValue;
    const isException = realizedPnl < -varValue;
    if (isException) {
      exceptionCount++;
      exceptionMagSum += Math.abs(realizedPnl) - varValue;
    }
    exceptions.push({
      date: dates[t],
      pnl: realizedPnl,
      var: varValue,
      exception: isException,
    });
  }

  const N = exceptions.length;
  const x = exceptionCount;
  const expected = N * (1 - confidence);
  const rate = N > 0 ? x / N : 0;

  // ---- Kupiec POF (unconditional coverage) ----
  // LR = -2 * ln[ (1-p)^(N-x) p^x / (1-x/N)^(N-x) (x/N)^x ]
  const p = 1 - confidence;
  let kupiecLR = 0;
  if (x === 0) {
    kupiecLR = -2 * Math.log(Math.pow(1 - p, N));
  } else if (x === N) {
    kupiecLR = -2 * Math.log(Math.pow(p, N));
  } else {
    const num = Math.pow(1 - p, N - x) * Math.pow(p, x);
    const den = Math.pow(1 - x / N, N - x) * Math.pow(x / N, x);
    kupiecLR = -2 * Math.log(num / den);
  }
  const kupiecP = chiSquarePValue(kupiecLR, 1);

  // ---- Christoffersen independence test ----
  // transitions: n_ij = count of (state i followed by state j), state 0=no-exc, 1=exc
  let n00 = 0, n01 = 0, n10 = 0, n11 = 0;
  for (let i = 0; i < exceptions.length - 1; i++) {
    const a = exceptions[i].exception ? 1 : 0;
    const b = exceptions[i + 1].exception ? 1 : 0;
    if (a === 0 && b === 0) n00++;
    else if (a === 0 && b === 1) n01++;
    else if (a === 1 && b === 0) n10++;
    else n11++;
  }
  const pi01 = n00 + n01 > 0 ? n01 / (n00 + n01) : 0;
  const pi11 = n10 + n11 > 0 ? n11 / (n10 + n11) : 0;
  const pi = (n01 + n11) / Math.max(1, n00 + n01 + n10 + n11);
  let indLR = 0;
  const safe = (v: number) => (v <= 0 ? 1e-12 : v);
  indLR =
    -2 *
    (Math.log(safe(Math.pow(1 - pi, n00 + n10) * Math.pow(pi, n01 + n11))) -
      Math.log(
        safe(
          Math.pow(1 - pi01, n00) * Math.pow(pi01, n01) *
            Math.pow(1 - pi11, n10) * Math.pow(pi11, n11)
        )
      ));
  const indP = chiSquarePValue(indLR, 1);
  const ccLR = indLR + kupiecLR;
  const ccP = chiSquarePValue(ccLR, 2);

  // ---- Basel traffic light (250-day, 99%) ----
  // Green <=4, Yellow 5-9, Red >=10 (scaled for window size).
  const scaledX = (x / Math.max(1, N)) * 250;
  let zone: "green" | "yellow" | "red";
  let multiplier: number;
  if (scaledX <= 4) {
    zone = "green";
    multiplier = 3.0;
  } else if (scaledX <= 9) {
    zone = "yellow";
    multiplier = 3.4 + 0.3 * (scaledX - 5); // 3.4 -> 4.6
  } else {
    zone = "red";
    multiplier = 4.0;
  }

  return {
    methodology,
    confidence,
    window: N,
    exceptions,
    exceptionCount: x,
    expectedExceptions: expected,
    exceptionRate: rate,
    kupiec: { lr: kupiecLR, pValue: kupiecP, reject: kupiecP < 0.05 },
    christoffersen: {
      independenceLR: indLR,
      independenceP: indP,
      ccLR,
      ccP,
      reject: ccP < 0.05,
    },
    zone,
    zoneMultiplier: multiplier,
    avgExceptionMagnitude: x > 0 ? exceptionMagSum / x : 0,
  };
}
