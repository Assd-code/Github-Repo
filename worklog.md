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

---
Task ID: 11 (round 2 — cron review)
Agent: main
Task: QA pass + add 4 new features (VaR trend, L-VaR/FRTB, reverse stress, P&L attribution) + CSV export + styling polish.

## Current project status (assessment)
- Round 1 delivered a stable, production-ready VaR dashboard with 5 methodologies,
  ES, backtesting (Kupiec/Christoffersen/Basel), decomposition, stress testing,
  market panel, portfolio editor. Verified by VLM (all 12 sections PASS).
- Fresh-load QA: 0 console errors, 0 lint errors, APIs healthy (~100-190ms).
- No bugs found requiring immediate fix. Project was stable → proceeded to add
  new features per the suggested roadmap.

## Completed modifications (this round)

### New backend modules
- src/lib/var/trend.ts — computeVarTrend(): rolling 250-day VaR vs realized P&L
  time series with procyclicality stats (mean/max/min VaR, VaR volatility, spike-day %).
- src/lib/var/liquidity.ts — computeLiquidityAdjustedVar(): FRTB 97.5% ES scaled
  across 5 liquidity horizons (10/20/40/60/120d) via sqrt-of-time, per-asset-class
  horizon weighting (equity 10d, fx/commodity 20d, rate 40d, crypto 60d), aggregated
  ES + regulatory capital (3.0× multiplier).
- src/lib/var/reverse-stress.ts — computeReverseStress(): binary-search the uniform
  shock intensity producing a target loss, with per-asset-class sensitivities
  (equity/crypto/commodity fall, treasuries rally). Handles unreachable-ruin case
  (bond hedge floors the book). Reports margin-to-ruin, sigma-event probability,
  comparison to Lehman/COVID.
- src/lib/var/pla.ts — computePnlAttribution(): FRTB P&L Attribution test comparing
  risk-theoretical P&L (linear risk factors) vs hypothetical P&L (with convexity
  residual). Spearman rank correlation + mean-abs-residual, traffic-light zone
  (green ≥0.80 ρ & <10% residual; amber/red thresholds).
- src/lib/var/types.ts — added VarTrend, LiquidityAdjustedVar, ReverseStressResult,
  PnlAttribution types; extended FullReport with 4 new fields.
- src/lib/var/engine.ts — wired all 4 new computations into buildFullReport().
- src/app/api/var/export/route.ts — CSV export endpoint with all 8 report sections
  (portfolio, methodologies, backtest, decomposition, stress, liquidity, reverse
  stress, PLA, trend). Returns 7.7KB CSV in ~150ms.

### New frontend panels
- src/components/var/var-trend-panel.tsx — ComposedChart (VaR area + P&L area +
  exception scatter) with mean-VaR reference line, 5 stat cards, procyclicality
  risk badge (low/moderate/high).
- src/components/var/liquidity-panel.tsx — gradient KPI cards (aggregated ES +
  regulatory capital), bar chart of 5 FRTB horizons with ratio bars, FRTB MAR33 badge.
- src/components/var/reverse-stress-panel.tsx — interactive target-loss slider
  (5-80%, client-side linear interpolation), per-asset-class shock chart, Lehman/COVID
  comparison, sigma-event probability, ruin-floor detection.
- src/components/var/pnl-attribution-panel.tsx — RTPL vs HPL line chart + residual
  scatter, Spearman ρ / mean-residual / window stat cards, PLA traffic-light badge.
- src/components/var/control-bar.tsx — added Export CSV button (opens /api/var/export).
- src/components/var/var-dashboard.tsx — wired 4 new panels into a 7-row grid;
  added framer-motion fade-up animations on every section (staggered, custom delay);
  added L-VaR + Reverse stress badges to header; expanded footer feature list;
  hover transitions on methodology reference cards.

## Verification results
- Fresh reload: 0 console errors, 0 warnings.
- ESLint: 0 errors.
- DOM: 17 charts (was 13), 3 tables, 1 slider, all 9 sections present
  (VaR Trend, Liquidity, Reverse Stress, P&L Attribution, Backtest, Decomposition,
  Stress, Market Data, Portfolio Holdings).
- VLM audit: all 4 new sections PASS (VaR Trend, Liquidity-Adjusted VaR FRTB,
  Reverse Stress Testing, P&L Attribution PLA). No broken layouts, footer confirmed.
- Slider interactivity: arrow-key changes value 20→35, chart updates client-side.
- Mobile (390px): no horizontal overflow.
- CSV export: 198 lines, 7.7KB, well-formatted with 8 sections.
- API timing: report 184ms (132KB), export 157ms (7.7KB), market 5ms.
- Realistic results: aggregated L-VaR ES $763K → regulatory capital $2.29M (23% of book);
  reverse stress needs 59% equity drop for -20% portfolio loss (bond hedge floors ruin);
  PLA Spearman ρ=0.998 (green zone, IMA retained).

## Unresolved issues / risks
- Reverse-stress slider uses client-side linear interpolation from the server-computed
  20% baseline; for very different target losses (e.g. 80%) the linear approximation
  diverges slightly from a true server recompute. Acceptable for interactivity; a future
  enhancement could debounce-call the API for exact values.
- PLA convexity residual uses a fixed gamma proxy (2% of delta); real desks would
  derive this from actual option Greeks. Educational approximation only.
- FRTB liquidity aggregation approximates the full per-risk-factor horizon mixing with
  a portfolio-level asset-class-weighted combination.

## Priority recommendations for next phase
1. **Interactive Scenario Builder** — let users define custom shock matrices and
   save them (persist via Prisma). High user value.
2. **VaR Limit Monitoring** — set per-desk/per-trader VaR limits with breach alerts
   and a limit-utilization gauge. Requires Prisma schema for limits.
3. **Time-series VaR trend across methodologies** — overlay all 5 methods' rolling VaR
   on one chart to visualize model divergence over time.
4. **Derivatives with Greeks** — add option positions (delta-gamma-vega) and show
   delta-gamma VaR approximation vs full-reval.
5. **Reverse stress via API** — move the slider to a debounced API call for exact
   non-linear recompute at any target loss.

---
Task ID: 12 (round 3 — cron review)
Agent: main
Task: QA pass + fix hydration bug + add VaR limit monitoring, interactive scenario builder, multi-method trend overlay + styling polish.

## Current project status (assessment)
- Rounds 1-2 delivered a stable dashboard with 5 VaR methodologies, ES, backtesting,
  decomposition, stress testing, VaR trend, L-VaR, reverse stress, P&L attribution,
  CSV export. VLM-verified all sections PASS.
- Fresh-load QA found 1 real bug: framer-motion `motion.div` with `initial`/`animate`
  props caused a hydration mismatch (server rendered `style={{opacity:0}}`, client
  animated away from it). Fixed by gating animation behind a `mounted` flag and
  removing the control-bar motion wrapper.
- No other bugs. Project was stable → proceeded to add new features.

## Completed modifications (this round)

### Bug fix
- src/components/var/var-dashboard.tsx — Fixed framer-motion hydration mismatch:
  `Section` wrapper now returns a plain `<div>` until mounted, then swaps to
  `motion.div`. Removed `motion.div` wrapper around ControlBar. Added
  `suppressHydrationWarning` to the `lastUpdated` timestamp (locale-dependent).

### Database (Prisma)
- prisma/schema.prisma — added 3 models: VarLimit (scope/label/method/confidence/
  horizon/limitUsd/softLimitUsd/active), SavedScenario (name/description/type/
  shocks JSON), VarReading (audit log of VaR readings + breaches). Ran db:push.
- src/lib/var/seed.ts — seeds 5 default VaR limits (firm-wide 99%/1d, regulatory
  99%/10d, equities desk 95%/1d, crypto desk 99%/1d, rates desk 99%/1d).

### New backend modules
- src/lib/var/limits.ts — computeLimitMonitoring(): runs VaR per each limit's
  method/confidence/horizon, computes utilization, flags ok/warning/breach, persists
  a VarReading audit row. Plus CRUD: listLimits, upsertLimit, deleteLimit,
  recentReadings.
- src/lib/var/custom-scenarios.ts — runCustomScenario(): applies a per-symbol shock
  matrix to the portfolio. Plus saveScenario, listScenarios, deleteScenario,
  seedExampleScenarios (seeds Tech Wipeout, Inflation Surprise, Gold Rally).

### New API routes
- src/app/api/var/limits/route.ts — GET (compute monitoring) + POST (CRUD actions).
- src/app/api/var/scenarios/route.ts — GET (list + run saved) + POST (save/delete/run ad-hoc).

### New frontend panels
- src/components/var/limit-monitoring-panel.tsx — live limit cards with utilization
  Progress bars, ok/warning/breach color coding (emerald/amber/rose), headroom USD,
  ES display, hover-to-edit buttons, full add/edit/delete limit editor dialog
  (scope, method, confidence, horizon, hard/soft limits).
- src/components/var/scenario-builder-panel.tsx — 7 per-asset shock sliders (-60% to
  +60%), quick presets (Neutral/Crash/Rally), Run/Save buttons, result chart with
  per-asset P&L bars, saved-scenarios list with one-click apply + delete.

### Enhanced existing panel
- src/components/var/var-trend-panel.tsx — added multi-method overlay: a "Show all
  methods" toggle that overlays the other 4 methodologies' rolling VaR as dashed
  lines on the trend chart. Color-coded per method.

### Performance optimization
- src/lib/var/trend.ts — multi-method overlay computed on a sparse grid (every 5th
  day) with forward-fill, reduced MC paths (400 vs 800), reduced test days (150 vs
  250). API time: 7.4s → 1.2s (6× faster).

### Dashboard wiring + styling
- src/components/var/var-dashboard.tsx — wired LimitMonitoringPanel +
  ScenarioBuilderPanel into a new grid row. Added "Limit monitor" badge to header.
  Updated footer feature list. All sections animate in with staggered fade-up
  (mounted-gated to avoid hydration issues).

## Verification results
- Fresh reload: 0 console errors, 0 hydration warnings.
- ESLint: 0 errors (fixed React Compiler useCallback dependency mismatch in 2 panels).
- DOM: 18 charts (was 17), 3 tables, 8 sliders (7 scenario + 1 reverse stress).
- All 11 sections present: VaR Trend, Liquidity, Reverse Stress, P&L Attribution,
  Limit Monitoring, Scenario Builder, Backtest, Decomposition, Stress, Market Data,
  Portfolio.
- VLM audit: all 11 sections PASS, no broken layouts, footer at bottom, dark theme
  consistent.
- Limit monitoring: 5 limits, 2 breaches (Crypto 218%, Rates 105%), 1 warning
  (Equities 87%), correct utilization bars + headroom.
- Scenario builder: 3 saved scenarios (Tech Wipeout, Inflation Surprise, Gold Rally),
  Run button produces P&L chart, sliders interactive.
- Multi-method overlay toggle present and functional.
- Mobile (390px): no horizontal overflow.
- API timing: report 1.2s (was 7.4s), limits 50ms, scenarios 10ms.

## Unresolved issues / risks
- Multi-method trend overlay uses sparse grid (every 5th day) with forward-fill;
  the overlay lines are slightly less smooth than the primary method but still
  clearly show model divergence. Acceptable trade-off for 6× speedup.
- VaR readings are persisted on every limit-monitoring API call (audit log grows);
  no TTL/pruning yet. Low risk for demo; production would prune to N days.

## Priority recommendations for next phase
1. **VaR breach alert feed** — show a scrolling timeline of recent breaches from the
   VarReading audit table, with severity + scope filtering.
2. **Limit utilization heatmap** — desk × time matrix showing which desks breach
   most often (uses VarReading history).
3. **Reverse stress via API** — move the slider to a debounced API call for exact
   non-linear recompute at any target loss (currently client-side linear interp).
4. **Derivatives with Greeks** — add option positions (delta-gamma-vega) and show
   delta-gamma VaR approximation vs full-reval.
5. **Scenario import/export** — JSON import of external scenario libraries
   (e.g. EBA stress test scenarios).
