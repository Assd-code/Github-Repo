# Project Worklog — VaR Risk Model Web Application

## Project Overview
Building a comprehensive Value-at-Risk (VaR) risk model as an interactive Next.js web
application. Implements the full methodology stack described in the requirements:
parametric, historical simulation, Monte Carlo, filtered historical simulation, EVT,
Expected Shortfall, backtesting (Kupiec/Christoffersen/Basel traffic light), risk
decomposition (marginal/component/incremental VaR), stress testing, and an interactive
dashboard with multiple visualizations.

---
Task ID: 1
Agent: main
Task: Project foundation — start dev server, set up worklog, plan architecture.

Work Log:
- Inspected existing Next.js 16 + TS + Tailwind 4 + shadcn/ui scaffold.
- Confirmed recharts, framer-motion, zustand, tanstack-query available.
- Started dev server on port 3000 (Ready in 539ms, GET / 200).
- Created worklog.md and planned module layout:
  - src/lib/var/types.ts
  - src/lib/var/rng.ts (seeded PRNG, normal inverse CDF, quantile, covariance, Cholesky)
  - src/lib/var/market-data.ts (synthetic multi-asset GBM with regimes + correlation)
  - src/lib/var/methods.ts (parametric, historical, Monte Carlo, FHS, EVT)
  - src/lib/var/backtest.ts (Kupiec, Christoffersen, Basel traffic light)
  - src/lib/var/decomposition.ts (marginal/component/incremental VaR)
  - src/lib/var/stress.ts (historical + hypothetical scenarios)
  - src/lib/var/engine.ts (orchestrator)
  - src/app/api/var/* routes
  - src/app/page.tsx dashboard

Stage Summary:
- Dev server up and healthy. Foundation ready to build VaR engine modules.

---
Task ID: 2-7
Agent: main
Task: Build the full VaR engine (math, data, methods, backtest, decomposition, stress) and API routes.

Work Log:
- src/lib/var/types.ts — full type system (MarketData, VarResult, BacktestResult, DecompositionResult, StressResult, FullReport).
- src/lib/var/rng.ts — mulberry32 seeded PRNG, Box-Muller normal, Acklam normal inverse CDF, normal CDF, linear-interpolation quantile, mean/std/sum, covariance matrix, Cholesky decomposition (with ridge correction), correlation matrix, histogram (NaN-safe), chi-square p-value via regularized incomplete gamma (series + Lentz continued fraction), downsample.
- src/lib/var/market-data.ts — 7-asset universe (SPX, AAPL, XOM, TLT, EURUSD, GOLD, BTC), correlated GBM simulation with 4 volatility regimes (calm/buildup/crisis/recovery), crisis contagion across asset classes, realized covariance/mean/vol, portfolio weight scaling.
- src/lib/var/methods.ts — parametric (variance-covariance, sqrt-of-time horizon scaling), historical simulation (overlapping horizon returns), Monte Carlo (correlated GBM path stepping, 10k paths, returns sample paths for viz), filtered HS (EWMA vol filter + bootstrap of standardized residuals), EVT (Zhang-Stephens GPD MLE fit + analytic VaR/ES formulas + augmented distribution). Fixed critical bugs: double-applied volatility, operator-precedence NaN in portfolio weights, parametric sample injection pollution, EVT using downsampled data.
- src/lib/var/backtest.ts — rolling-window backtest, Kupiec POF LR test, Christoffersen independence + conditional coverage tests, Basel traffic-light zones (green/yellow/red with capital multipliers).
- src/lib/var/decomposition.ts — marginal VaR (analytic dVaR/dw), component VaR (sums to parametric total), incremental VaR (historical-based, leave-one-out), standalone VaR.
- src/lib/var/stress.ts — 7 scenarios (Lehman 2008, COVID 2020, Rate Shock 2022, equity crash, vol spike, crypto wipeout, flight to safety) with per-asset-class shock factors.
- src/lib/var/engine.ts — orchestrator running all 5 methodologies + backtest + decomposition + stress.
- src/lib/var/cache.ts — memoized market-data cache.
- src/app/api/var/report/route.ts — full report endpoint with query params (confidence, horizon, seed, method, positions, totalValue).
- src/app/api/var/market/route.ts — compact price history for charting.

Bugs found & fixed during testing:
1. const reassign in chiSquarePValue continued-fraction.
2. Double volatility application in generateMarketData (shocks already scaled by Cholesky).
3. Operator precedence: `?.quantity * scale ?? 0` produced NaN for assets not in reduced portfolio.
4. Parametric VaR injected an analytic sample that polluted the 1% quantile.
5. Decomposition sign errors (marginal/standalone used wrong sign on z term).
6. EVT used downsampled distribution; rewrote to use full P&L + analytic GPD VaR formula.

Stage Summary:
- API verified: GET /api/var/report returns 117KB JSON in ~190ms.
- Realistic results for $10M portfolio (99% 1-day): Parametric $185k, Historical $264k,
  Monte Carlo $182k, Filtered HS $187k, EVT $264k (ES $303k).
- Backtest: 6 exceptions vs 2.5 expected, yellow zone, Kupiec p=0.059, CC p=0.050.
- Decomposition: component VaRs sum to parametric total; incremental VaR correct
  (BTC +$22k, GOLD +$23k; TLT/EURUSD negative or zero = diversifiers).
- Stress: 5 of 7 scenarios breach 99% VaR (Lehman/COVID/RateShock/EquityCrash/CryptoWipeout).
- Ready to build the frontend dashboard.

---
Task ID: 8-9
Agent: main
Task: Build the interactive frontend dashboard and verify end-to-end.

Work Log:
- src/lib/format.ts — currency/percent/number/date formatters (compact + full).
- src/components/theme-provider.tsx + theme-toggle.tsx — next-themes dark/light toggle.
- src/app/layout.tsx — wrapped in ThemeProvider (defaultTheme dark), updated metadata.
- src/components/var/use-var-data.ts — React hook fetching /api/var/report + /api/var/market, manages controls (method, confidence, horizon, seed, portfolio).
- src/components/var/control-bar.tsx — methodology/confidence/horizon/seed selectors, portfolio editor dialog (add/remove/resize positions), recompute button.
- src/components/var/kpi-cards.tsx — 6 gradient KPI cards (VaR, ES, portfolio value, method spread, backtest zone, worst stress).
- src/components/var/methodology-comparison.tsx — grouped bar chart (VaR vs ES per method) + detailed table with active-method highlight.
- src/components/var/pnl-distribution.tsx — histogram with VaR/ES/mean reference lines, color-coded tail/loss/gain bins, 6-stat panel.
- src/components/var/backtest-panel.tsx — ComposedChart (P&L area + −VaR line + exception scatter), Basel traffic-light badge, Kupiec/Christoffersen test cards, zone band reference.
- src/components/var/mc-paths-panel.tsx — Monte Carlo path visualization with percentile stats (active only for MC method).
- src/components/var/decomposition-panel.tsx — horizontal bar chart of component VaR by asset + full table (marginal/component/incremental/standalone) + methodology legend.
- src/components/var/stress-panel.tsx — horizontal bar chart of scenario P&L vs −VaR line + per-scenario breach cards.
- src/components/var/market-panel.tsx — tabbed: normalized price lines, correlation heatmap (diverging rose/emerald), asset universe cards.
- src/components/var/portfolio-panel.tsx — holdings table with allocation bars.
- src/components/var/var-dashboard.tsx — orchestrator: sticky header, control bar, KPIs, 4×2-section grid, methodology reference, sticky footer.
- src/app/page.tsx — renders VarDashboard.

Verification (agent-browser + VLM):
- Page loads with 0 console errors, title "VaR Lab — Value-at-Risk Risk Model".
- 13-14 recharts charts, 3 data tables, all KPI numbers correct.
- Methodology switch (Historical → Monte Carlo) reveals MC paths panel.
- Confidence switch (99% → 95%) correctly lowers VaR ($184.6K → $130.7K parametric).
- Portfolio editor dialog opens with 7 position rows + total-value input.
- Mobile (390px): fixed horizontal overflow (wrapped tables in overflow-x-auto, made TabsList scrollable).
- VLM full-page audit: all 12 sections PASS (KPI, methodology table, P&L dist, backtest, MC paths, decomposition, stress, market, portfolio, sticky footer, no empty sections, charts display data).
- ESLint: 0 errors.

Stage Summary:
- Production-ready VaR dashboard. Dark-theme financial-terminal aesthetic with
  rose/amber/emerald traffic-light palette (no indigo/blue).
- All 5 methodologies, ES, backtesting (Kupiec/Christoffersen/Basel), decomposition
  (marginal/component/incremental/standalone), 7 stress scenarios, correlation heatmap,
  MC path viz, interactive portfolio editor — all verified working.
- Sticky footer confirmed; responsive from 390px → 1440px+.
