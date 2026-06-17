"use client";

import * as React from "react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useVarData } from "./use-var-data";
import { ControlBar } from "./control-bar";
import { KpiCards } from "./kpi-cards";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, BookOpen, Layers3 } from "lucide-react";

// Dynamic imports: panels are compiled on-demand by Turbopack, preventing the
// initial page load from OOM-killing the dev server with 8GB cgroup limit.
// ssr: false because these are all client components with browser-only APIs.
const MethodologyComparison = dynamic(() => import("./methodology-comparison").then(m => m.MethodologyComparison), { ssr: false, loading: () => <PanelSkeleton /> });
const PnlDistribution = dynamic(() => import("./pnl-distribution").then(m => m.PnlDistribution), { ssr: false, loading: () => <PanelSkeleton /> });
const BacktestPanel = dynamic(() => import("./backtest-panel").then(m => m.BacktestPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const McPathsPanel = dynamic(() => import("./mc-paths-panel").then(m => m.McPathsPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const DecompositionPanel = dynamic(() => import("./decomposition-panel").then(m => m.DecompositionPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const StressPanel = dynamic(() => import("./stress-panel").then(m => m.StressPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const MarketPanel = dynamic(() => import("./market-panel").then(m => m.MarketPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const PortfolioPanel = dynamic(() => import("./portfolio-panel").then(m => m.PortfolioPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const VarTrendPanel = dynamic(() => import("./var-trend-panel").then(m => m.VarTrendPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const LiquidityPanel = dynamic(() => import("./liquidity-panel").then(m => m.LiquidityPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const ReverseStressPanel = dynamic(() => import("./reverse-stress-panel").then(m => m.ReverseStressPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const PnlAttributionPanel = dynamic(() => import("./pnl-attribution-panel").then(m => m.PnlAttributionPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const LimitMonitoringPanel = dynamic(() => import("./limit-monitoring-panel").then(m => m.LimitMonitoringPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const ScenarioBuilderPanel = dynamic(() => import("./scenario-builder-panel").then(m => m.ScenarioBuilderPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const BreachFeedPanel = dynamic(() => import("./breach-feed-panel").then(m => m.BreachFeedPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const UtilizationHeatmapPanel = dynamic(() => import("./utilization-heatmap-panel").then(m => m.UtilizationHeatmapPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const DerivativesPanel = dynamic(() => import("./derivatives-panel").then(m => m.DerivativesPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const HistoricalComparisonPanel = dynamic(() => import("./historical-comparison-panel").then(m => m.HistoricalComparisonPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const ModellabilityPanel = dynamic(() => import("./modellability-panel").then(m => m.ModellabilityPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const ConcentrationPanel = dynamic(() => import("./concentration-panel").then(m => m.ConcentrationPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const PerformancePanel = dynamic(() => import("./performance-panel").then(m => m.PerformancePanel), { ssr: false, loading: () => <PanelSkeleton /> });
const WhatIfSimulatorPanel = dynamic(() => import("./whatif-simulator-panel").then(m => m.WhatIfSimulatorPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const OptimizerPanel = dynamic(() => import("./optimizer-panel").then(m => m.OptimizerPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const CorrelationRegimePanel = dynamic(() => import("./correlation-regime-panel").then(m => m.CorrelationRegimePanel), { ssr: false, loading: () => <PanelSkeleton /> });
const ExceptionDeepDivePanel = dynamic(() => import("./exception-deepdive-panel").then(m => m.ExceptionDeepDivePanel), { ssr: false, loading: () => <PanelSkeleton /> });
const SensitivityPanel = dynamic(() => import("./sensitivity-panel").then(m => m.SensitivityPanel), { ssr: false, loading: () => <PanelSkeleton /> });
const VolatilityRegimePanel = dynamic(() => import("./volatility-regime-panel").then(m => m.VolatilityRegimePanel), { ssr: false, loading: () => <PanelSkeleton /> });
const SavedPortfoliosPanel = dynamic(() => import("./saved-portfolios-panel").then(m => m.SavedPortfoliosPanel), { ssr: false, loading: () => <PanelSkeleton /> });

function PanelSkeleton() {
  return <Skeleton className="h-[400px] rounded-xl" />;
}

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: Math.min(i * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

function Section({ children, i }: { children: React.ReactNode; i: number }) {
  // Only animate after mount to avoid SSR/CSR hydration mismatch from
  // framer-motion setting inline styles (opacity:0) on the server.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div>{children}</div>;
  return (
    <motion.div custom={i} variants={fadeUp} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

// Lazy-mount wrapper: only renders children when they scroll into view.
// Includes a staggered delay based on the section index so panels compile
// one-at-a-time, preventing OOM-kills from simultaneous Turbopack compilation.
function LazySection({ children, i, minHeight = 200 }: { children: React.ReactNode; i: number; minHeight?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            // Stagger the mount by index to avoid simultaneous compilation
            const delay = Math.min(i * 100, 800);
            setTimeout(() => setVisible(true), delay);
            observer.disconnect();
            break;
          }
        }
      },
      { rootMargin: "50px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [i]);

  if (!visible) {
    return (
      <div ref={ref} style={{ minHeight }} className="flex items-center justify-center">
        <div className="text-xs text-muted-foreground/50 animate-pulse">Loading…</div>
      </div>
    );
  }
  return <Section i={i}>{children}</Section>;
}

// A subtle horizontal divider that groups panels into thematic sections.
function SectionDivider({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 pt-4 pb-1">
      <div className="h-px w-12 bg-gradient-to-r from-transparent to-border" />
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/80">
          {label}
        </span>
        {hint && (
          <span className="hidden sm:inline text-[10px] text-muted-foreground">
            · {hint}
          </span>
        )}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-border via-border/40 to-transparent" />
    </div>
  );
}

export function VarDashboard() {
  const { report, market, loading, error, controls, setControls, lastUpdated, useRealData, setUseRealData, dataSource } = useVarData();
  const [, force] = React.useReducer((x) => x + 1, 0);
  const refresh = () => force();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight">VaR Lab</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">Value-at-Risk Risk Model</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 ml-3">
            {useRealData ? (
              <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                LIVE DATA
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-5 bg-muted/30 text-muted-foreground border-muted-foreground/30">
                SYNTHETIC
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] h-5">5 methodologies</Badge>
            <Badge variant="secondary" className="text-[10px] h-5">FRTB-aligned</Badge>
            <Badge variant="secondary" className="text-[10px] h-5">Basel backtest</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">L-VaR</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-2/15 text-chart-2 border-chart-2/30">Reverse stress</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-4/15 text-chart-4 border-chart-4/30">Greeks</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">NMRF</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-4/15 text-chart-4 border-chart-4/30">Concentration</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-2/15 text-chart-2 border-chart-2/30">Sharpe</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-5/15 text-chart-5 border-chart-5/30">What-If</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-2/15 text-chart-2 border-chart-2/30">Optimizer</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">Regimes</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-1/15 text-chart-1 border-chart-1/30">Sensitivities</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">GARCH</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-5/15 text-chart-5 border-chart-5/30">Save/Load</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-rose-500/15 text-rose-500 border-rose-500/30">Breach feed</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums" suppressHydrationWarning>
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <a
              href="https://www.bis.org/bcbs/publ/d457.htm" target="_blank" rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5" /> FRTB
            </a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1400px] w-full px-4 md:px-6 py-5 space-y-4">
        {/* Control bar */}
        <div
          className="rounded-xl border bg-card p-3 md:p-4 shadow-sm"
        >
          <ControlBar controls={controls} setControls={setControls} onRefresh={refresh} loading={loading} useRealData={useRealData} setUseRealData={setUseRealData} />
        </div>

        {/* Data source banner */}
        {dataSource && dataSource.dataSource && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${dataSource.dataSource === "real" ? "bg-emerald-500/5 border-emerald-500/20" : dataSource.dataSource === "mixed" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {dataSource.dataSource === "real" && <span className="text-emerald-500 font-medium">🟢 Live Data</span>}
              {dataSource.dataSource === "mixed" && <span className="text-amber-500 font-medium">🟡 Mixed Data</span>}
              {dataSource.dataSource === "synthetic-fallback" && <span className="text-rose-500 font-medium">🔴 Synthetic Fallback</span>}
              <span className="text-muted-foreground">
                · {dataSource.fetched?.length || 0} symbols fetched from Yahoo Finance
              </span>
              {dataSource.fetched && dataSource.fetched.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {dataSource.fetched.map((f) => (
                    <span key={f.symbol} className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono" title={`${f.name} · ${f.assetClass} · $${f.spot.toFixed(2)} · ${f.prices} prices`}>
                      {f.symbol}
                    </span>
                  ))}
                </div>
              )}
              {dataSource.failed && dataSource.failed.length > 0 && (
                <span className="text-rose-500 text-[10px]">
                  · failed: {dataSource.failed.map((f) => f.symbol).join(", ")}
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to compute VaR</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading && !report ? (
          <LoadingState />
        ) : report ? (
          <>
            {/* KPI cards */}
            <Section i={0}>
              <KpiCards report={report} method={controls.method} />
            </Section>

            <SectionDivider label="Risk Measurement" hint="5 methodologies · ES · P&L distribution" />

            {/* Methodology comparison + P&L distribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={1}><MethodologyComparison report={report} activeMethod={controls.method} /></LazySection>
              <LazySection i={2}><PnlDistribution report={report} method={controls.method} /></LazySection>
            </div>

            {/* VaR Trend + Liquidity (FRTB) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={3}><VarTrendPanel report={report} method={controls.method} /></LazySection>
              <LazySection i={4}><LiquidityPanel report={report} /></LazySection>
            </div>

            {/* Backtest + MC paths */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={5}><BacktestPanel report={report} method={controls.method} /></LazySection>
              <LazySection i={6}><McPathsPanel report={report} method={controls.method} /></LazySection>
            </div>

            {/* Exception deep-dive (round 8) */}
            <LazySection i={7}><ExceptionDeepDivePanel controls={controls} /></LazySection>

            {/* Decomposition + Stress */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={8}><DecompositionPanel report={report} /></LazySection>
              <LazySection i={9}><StressPanel report={report} /></LazySection>
            </div>

            {/* Risk Factor Sensitivity (round 9) */}
            <LazySection i={10}><SensitivityPanel controls={controls} /></LazySection>

            <SectionDivider label="Stress & Attribution" hint="Reverse stress · PLA · scenario builder" />

            {/* Reverse stress + P&L attribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={11}><ReverseStressPanel report={report} controls={controls} /></LazySection>
              <LazySection i={12}><PnlAttributionPanel report={report} /></LazySection>
            </div>

            {/* Limit monitoring + Scenario builder (round 3) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={13}><LimitMonitoringPanel controls={controls} /></LazySection>
              <LazySection i={14}><ScenarioBuilderPanel controls={controls} /></LazySection>
            </div>

            {/* Breach feed + Utilization heatmap (round 4) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={15}><BreachFeedPanel /></LazySection>
              <LazySection i={16}><UtilizationHeatmapPanel /></LazySection>
            </div>

            <SectionDivider label="Advanced Analytics" hint="Greeks · NMRF · concentration · performance · regimes · GARCH" />

            {/* Derivatives/Greeks + Historical VaR comparison (round 5) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={17}><DerivativesPanel /></LazySection>
              <LazySection i={18}><HistoricalComparisonPanel /></LazySection>
            </div>

            {/* Modellability assessment (round 6) */}
            <LazySection i={19}><ModellabilityPanel /></LazySection>

            {/* Concentration + Performance (round 7) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={20}><ConcentrationPanel controls={controls} /></LazySection>
              <LazySection i={21}><PerformancePanel controls={controls} /></LazySection>
            </div>

            {/* Correlation Regime Analysis (round 8) */}
            <LazySection i={22}><CorrelationRegimePanel controls={controls} /></LazySection>

            {/* Volatility Regime & GARCH Forecast (round 9) */}
            <LazySection i={23}><VolatilityRegimePanel controls={controls} /></LazySection>

            <SectionDivider label="Interactive Simulator" hint="live what-if weight rebalancing · portfolio optimizer" />

            {/* What-If Simulator (round 7) — full-width */}
            <LazySection i={24}><WhatIfSimulatorPanel controls={controls} report={report} /></LazySection>

            {/* Portfolio Optimizer (round 8) — full-width */}
            <LazySection i={25}><OptimizerPanel controls={controls} /></LazySection>

            <SectionDivider label="Market & Holdings" hint="reference data · saved portfolios" />

            {/* Saved Portfolios (round 9) */}
            <LazySection i={26}><SavedPortfoliosPanel controls={controls} setControls={setControls} /></LazySection>

            {/* Market + Portfolio */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <LazySection i={27}><MarketPanel market={market} /></LazySection>
              <LazySection i={28}><PortfolioPanel report={report} /></LazySection>
            </div>

            {/* Methodology reference */}
            <LazySection i={29}>
              <MethodologyReference />
            </LazySection>
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-auto">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">VaR Lab</span>
            <span>·</span>
            <span>Educational risk-model implementation — not investment advice.</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            <span>Parametric · Historical · Monte Carlo · Filtered HS · EVT</span>
            <span>·</span>
            <span>L-VaR · PLA · Reverse stress · Greeks · NMRF · Concentration · Sharpe · What-If · Optimizer · Regimes · GARCH · Sensitivities · Exception deep-dive · Limit monitoring · Scenario builder · Breach feed · Heatmap · Historical comparison · Save/Load · Kupiec · Christoffersen · Basel III</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-[460px] rounded-xl" />
        <Skeleton className="h-[460px] rounded-xl" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Skeleton className="h-[460px] rounded-xl" />
        <Skeleton className="h-[460px] rounded-xl" />
      </div>
    </div>
  );
}

function MethodologyReference() {
  const refs = [
    { name: "Parametric (Var-Cov)", short: "Parametric", desc: "Assumes jointly normal returns. Fast, captures diversification via the covariance matrix, but underestimates fat tails and fails for non-linear instruments (options, MBS)." },
    { name: "Historical Simulation", short: "Historical", desc: "Non-parametric: re-values the portfolio under every historical move. Captures empirical fat tails & correlations but is anchored to the chosen window — 'ghost features' as shocks enter/exit." },
    { name: "Monte Carlo", short: "Monte Carlo", desc: "Simulates thousands of correlated paths from fitted stochastic processes. Most flexible — handles path-dependency & non-linearity, but compute-heavy and exposed to process-specification model risk." },
    { name: "Filtered HS (EWMA)", short: "Filtered HS", desc: "EWMA-GARCH filter standardizes historical returns, then bootstraps residuals scaled to current volatility. Adapts fast to vol regimes while keeping empirical correlation structure." },
    { name: "EVT (GPD)", short: "EVT", desc: "Fits a Generalized Pareto Distribution to the tail beyond a threshold. Improves accuracy at very high confidence (99.5%+) where historical data is sparse — often used as an overlay." },
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <Layers3 className="h-4 w-4 text-muted-foreground" />
        Methodology Reference
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        A robust risk framework reports a range of VaRs across methods — the spread itself is a measure of model risk. No single number should be trusted in isolation.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {refs.map((r) => (
          <div key={r.name} className="rounded-lg border bg-muted/20 p-3 hover:bg-muted/30 transition-colors">
            <div className="text-xs font-semibold mb-1">{r.name}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</div>
          </div>
        ))}
        <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-amber-500/10 p-3">
          <div className="text-xs font-semibold mb-1 text-rose-500">Complementary Measures</div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            VaR is never used alone. This engine also reports <span className="font-medium text-foreground">Expected Shortfall</span> (coherent, tail-shape aware, the FRTB metric), <span className="font-medium text-foreground">stress tests</span>, <span className="font-medium text-foreground">Greeks-style decomposition</span>, <span className="font-medium text-foreground">liquidity-adjusted VaR</span>, <span className="font-medium text-foreground">reverse stress</span>, <span className="font-medium text-foreground">P&amp;L attribution</span>, and <span className="font-medium text-foreground">backtesting</span> to form a complete risk picture.
          </div>
        </div>
      </div>
    </div>
  );
}
