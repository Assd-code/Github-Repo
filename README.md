# VaR Lab

VaR Lab is a Value-at-Risk (VaR) risk model with an interactive dashboard. It
computes portfolio VaR and Expected Shortfall with five methodologies, backtests
the model against realized P&L, breaks risk down by position, and runs stress
tests. It runs as a Next.js web app and can be packaged as a desktop app for
macOS and Windows (see [DESKTOP_APP.md](DESKTOP_APP.md)).

## Quick start

Requires [Bun](https://bun.sh) (or Node.js 18+ with npm).

```bash
bun install
bun run db:push     # create the SQLite tables (limits, scenarios, portfolios)
bun run dev         # http://localhost:3000
```

`DATABASE_URL` must point at a SQLite file, e.g. `DATABASE_URL=file:./db/custom.db`
in `.env`.

| Script | What it does |
| --- | --- |
| `bun run dev` | Start the dev server on port 3000 |
| `bun run build` / `bun run start` | Production build and server |
| `bun run lint` | ESLint |
| `bun run electron` | Open the running app in an Electron window |
| `bun run dist:mac` / `bun run dist:win` | Build desktop installers into `release/` |

## The model

### Inputs

- **Portfolio**: a list of positions (`symbol`, `quantity`) plus the total book
  value in USD. Weights are each position's market value over the book value.
- **Market data**: a matrix of daily prices for every asset, from which the engine
  derives daily log returns, the mean return vector and the covariance matrix.
  Two sources are supported:
  - *Synthetic* (default): a seeded, 7-asset universe (SPX, AAPL, XOM, TLT,
    EURUSD, GOLD, BTC) simulated as correlated geometric Brownian motion with four
    volatility regimes (calm, build-up, crisis, recovery) and crisis contagion.
    The same seed always produces the same history, so results are reproducible.
  - *Real*: daily closes for any ticker from Yahoo Finance's public chart
    endpoint (no API key), cached for 15 minutes. Symbols that fail to download
    fall back to synthetic data.
- **Settings**: confidence level (90% to 99.9%, default 99%), horizon in days
  (1 to 20, default 1) and history length (250 to 1000 days, default 504).

### Outputs

For each methodology the engine returns VaR and Expected Shortfall in USD and as
a percentage of the book, plus the P&L distribution behind them (mean, standard
deviation, 5th/95th percentiles, best and worst outcome, histogram).

- **VaR** at confidence *c* is the loss that is exceeded with probability
  1 − *c* over the horizon: VaR = −quantile(P&L, 1 − *c*).
- **Expected Shortfall** (ES, or CVaR) is the average loss on the days that are
  worse than VaR: ES = −mean(P&L | P&L ≤ −VaR).

### Methodologies

All five live in [`src/lib/var/methods.ts`](src/lib/var/methods.ts).

| Method | How it works | Strengths and limits |
| --- | --- | --- |
| **Parametric** (variance-covariance) | Portfolio mean μ = wᵀm and volatility σ = √(wᵀΣw) from the daily covariance matrix, scaled to the horizon by √T. VaR = −(μT + z₁₋c σ√T), read from a 20,000-draw normal sample. | Fast and captures diversification, but assumes normal returns, so it understates fat tails. |
| **Historical simulation** | Applies every historical daily (or overlapping T-day) return vector to today's weights and takes the empirical quantile. | No distributional assumption and keeps real correlations, but is only as good as the chosen window. |
| **Monte Carlo** | Draws 10,000 correlated return paths using the Cholesky factor of Σ, stepping day by day over the horizon. | Most flexible and handles path dependence; costs more compute and depends on the chosen process. |
| **Filtered historical simulation** | Filters each asset's returns with an EWMA volatility (λ = 0.94), bootstraps the standardized residuals and rescales them by today's volatility. | Reacts quickly to volatility regimes while keeping empirical correlation. |
| **Extreme value theory** | Fits a Generalized Pareto Distribution (Zhang-Stephens estimator) to historical losses above the 90th percentile and reads VaR and ES from the fitted tail: VaR = u + σ/ξ · ((N/Nᵤ · (1 − c))^(−ξ) − 1), ES = (VaR + σ − ξu)/(1 − ξ). | Smoother, better-founded estimates at very high confidence (99.5%+). |

Example output for the default $10M book (synthetic data, seed 42, 504 days,
99% one-day):

| Method | VaR | ES |
| --- | --- | --- |
| Parametric | $184,617 | $215,599 |
| Historical | $263,839 | $283,752 |
| Monte Carlo | $181,850 | $207,099 |
| Filtered HS | $187,072 | $231,140 |
| EVT | $250,463 | $283,773 |

The normal-based methods come in lower than historical and EVT because the
simulated history contains a crisis regime with fat tails.

### Validation and analytics

| Feature | Module | Description |
| --- | --- | --- |
| Backtesting | `backtest.ts` | Rolling 250-day VaR against next-day P&L. Kupiec proportion-of-failures test, Christoffersen independence and conditional-coverage tests, Basel traffic-light zone and capital multiplier. |
| Risk decomposition | `decomposition.ts` | Marginal, component (sums to total VaR), incremental (leave-one-out) and standalone VaR per position. |
| Stress testing | `stress.ts`, `custom-scenarios.ts` | Seven built-in scenarios (Lehman 2008, COVID 2020, 2022 rate shock, equity crash, volatility spike, crypto wipeout, flight to safety) plus user-defined shocks saved to the database. |
| Reverse stress | `reverse-stress.ts` | Finds the uniform shock that produces a target loss (default 20%). |
| Liquidity-adjusted ES | `liquidity.ts` | 97.5% ES scaled over the FRTB liquidity horizons (10 to 120 days). |
| P&L attribution | `pla.ts` | FRTB PLA test: Spearman correlation and residuals between risk-theoretical and hypothetical P&L. |
| Modellability | `modellability.ts` | FRTB risk-factor eligibility test and NMRF surcharge. |
| Derivatives | `derivatives.ts` | Black-Scholes Greeks and delta-only vs delta-gamma vs full-revaluation VaR for option positions. |
| Limits | `limits.ts` | VaR limits per scope with soft and hard thresholds, utilization and breach log. |
| Other | `trend.ts`, `volatility-regime.ts`, `correlation-regime.ts`, `sensitivity.ts`, `whatif.ts`, `optimizer.ts`, `concentration.ts` | Rolling VaR trend, regime detection, parameter sensitivity, what-if trades, minimum-VaR and risk-parity optimization, concentration metrics. |

## Using the engine from code

The engine is plain TypeScript with no framework dependencies, so it can be used
outside the app:

```ts
import { generateMarketData, DEFAULT_ASSETS } from "@/lib/var/market-data";
import { runVar } from "@/lib/var/methods";
import { buildFullReport, DEFAULT_PORTFOLIO } from "@/lib/var/engine";

const market = generateMarketData(DEFAULT_ASSETS, 504, 42);

// One methodology
const hs = runVar(market, DEFAULT_PORTFOLIO, "historical", 0.99, 1);
console.log(hs.var, hs.es);

// Everything: all five methods, backtest, decomposition, stress, ...
const report = buildFullReport(market, DEFAULT_PORTFOLIO, 0.99, 1, "historical");
```

Custom portfolios use the same shape:

```ts
const portfolio = {
  totalValue: 5_000_000,
  positions: [
    { symbol: "SPX", quantity: 400 },
    { symbol: "TLT", quantity: 20000 },
  ],
};
```

## HTTP API

All endpoints live under `/api/var/`. The main one is the full report:

```
GET /api/var/report?confidence=0.99&horizon=1&method=historical&seed=42&days=504
                   &positions=SPX:800,AAPL:12000,BTC:45&totalValue=10000000
```

| Parameter | Default | Range |
| --- | --- | --- |
| `confidence` | `0.99` | 0.90 to 0.999 |
| `horizon` | `1` | 1 to 20 days |
| `method` | `historical` | `parametric`, `historical`, `montecarlo`, `filtered`, `evt` (used for the backtest and trend) |
| `seed` | `42` | any integer (synthetic data) |
| `days` | `504` | 250 to 1000 |
| `positions` | default book | `SYMBOL:qty,...` |
| `totalValue` | `10000000` | USD |

`/api/var/real-report` takes the same parameters but uses real Yahoo Finance
prices. Other endpoints (`market`, `limits`, `scenarios`, `portfolios`,
`whatif`, `optimizer`, `export-pdf` and more) each back one dashboard panel;
see `src/app/api/var/`.

## Project layout

```
src/
  lib/var/            VaR engine (pure TypeScript)
    types.ts          shared types
    rng.ts            seeded RNG, normal CDF/inverse, quantiles, Cholesky
    market-data.ts    synthetic market generator, portfolio weights
    real-market-data.ts  Yahoo Finance loader
    methods.ts        the five VaR/ES methodologies
    engine.ts         orchestrator that builds the full report
    ...               backtest, decomposition, stress and the other analytics
  app/api/var/        REST endpoints
  components/var/     dashboard panels
prisma/schema.prisma  limits, saved scenarios, VaR readings, saved portfolios
electron/main.js      desktop wrapper
```

## Assumptions and limitations

- Returns are daily log returns; multi-day VaR uses √T scaling (parametric) or
  overlapping windows (historical).
- Positions are treated as linear in their underlying, except in the
  derivatives panel.
- Market data defaults to synthetic prices. Use the real-data mode for actual
  portfolios.
- Yahoo Finance's endpoint is unofficial and may rate-limit or change.

This is an analytics tool, not a regulatory capital calculator.
