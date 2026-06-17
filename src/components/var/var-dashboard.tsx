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
import { Activity, AlertCircle, BookOpen, LayoutDashboard, BarChart3, ShieldAlert, Microscope, SlidersHorizontal, FileText } from "lucide-react";

// Dynamic imports: panels are compiled on-demand by Turbopack.
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
const CustomReportPanel = dynamic(() => import("./custom-report-panel").then(m => m.CustomReportPanel), { ssr: false, loading: () => <PanelSkeleton /> });

function PanelSkeleton() {
  return <Skeleton className="h-[400px] rounded-xl" />;
}

// Error boundary for tab content — catches ChunkLoadError (common in dev mode
// when switching tabs triggers simultaneous compilation) and shows a retry
// button instead of crashing the whole page.
import { TabErrorBoundary } from "./tab-error-boundary";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: Math.min(i * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

function Section({ children, i }: { children: React.ReactNode; i: number }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div>{children}</div>;
  return (
    <motion.div custom={i} variants={fadeUp} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

// Tab definitions
type TabId = "overview" | "risk" | "stress" | "advanced" | "tools" | "reports";

const TABS: { id: TabId; label: string; icon: React.ElementType; hint: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "KPIs · methodology · P&L · portfolio" },
  { id: "risk", label: "Risk Measurement", icon: BarChart3, hint: "VaR trend · backtest · decomposition · stress" },
  { id: "stress", label: "Stress & Limits", icon: ShieldAlert, hint: "Reverse stress · PLA · limits · breaches · scenarios" },
  { id: "advanced", label: "Advanced Analytics", icon: Microscope, hint: "Greeks · GARCH · concentration · sensitivity · regimes" },
  { id: "tools", label: "Interactive Tools", icon: SlidersHorizontal, hint: "What-if · optimizer · portfolio manager" },
  { id: "reports", label: "Reports & Data", icon: FileText, hint: "Custom PDF report · market data · methodology reference" },
];

export function VarDashboard() {
  const { report, market, loading, error, controls, setControls, lastUpdated, useRealData, setUseRealData, dataSource, activePortfolioName, setActivePortfolioName, isDirty, markClean } = useVarData();
  const [, force] = React.useReducer((x) => x + 1, 0);
  const refresh = () => force();
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-2.5 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-sm">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight tracking-tight">VaR Lab</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">Value-at-Risk Risk Model</p>
            </div>
          </div>
          {/* Compact status badges */}
          <div className="hidden md:flex items-center gap-1.5 ml-3">
            {useRealData ? (
              <Badge variant="secondary" className="text-[10px] h-5 bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-5 bg-muted/30 text-muted-foreground border-muted-foreground/30">
                SYNTHETIC
              </Badge>
            )}
            {activePortfolioName && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-chart-5/15 text-chart-5 border-chart-5/30">
                {activePortfolioName}
              </Badge>
            )}
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

        {/* Tab navigation bar */}
        <div className="border-t bg-background/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1400px] px-4 md:px-6">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin -mb-px">
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                    }`}
                    title={tab.hint}
                  >
                    <tab.icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1400px] w-full px-4 md:px-6 py-4 space-y-3">
        {/* Control bar — always visible */}
        <div className="rounded-xl border bg-card p-3 md:p-4 shadow-sm">
          <ControlBar controls={controls} setControls={setControls} onRefresh={refresh} loading={loading} useRealData={useRealData} setUseRealData={setUseRealData} activePortfolioName={activePortfolioName} setActivePortfolioName={setActivePortfolioName} isDirty={isDirty} markClean={markClean} />
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
            {/* KPI cards — always visible across all tabs */}
            <Section i={0}>
              <KpiCards report={report} method={controls.method} />
            </Section>

            {/* Tab content — only render the active tab's panels */}
            <TabErrorBoundary tabId={activeTab}>
            {activeTab === "overview" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={1}><MethodologyComparison report={report} activeMethod={controls.method} /></Section>
                  <Section i={2}><PnlDistribution report={report} method={controls.method} /></Section>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={3}><PortfolioPanel report={report} /></Section>
                  <Section i={4}><MarketPanel market={market} /></Section>
                </div>
              </div>
            )}

            {activeTab === "risk" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={1}><VarTrendPanel report={report} method={controls.method} /></Section>
                  <Section i={2}><LiquidityPanel report={report} /></Section>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={3}><BacktestPanel report={report} method={controls.method} /></Section>
                  <Section i={4}><McPathsPanel report={report} method={controls.method} /></Section>
                </div>
                <Section i={5}><ExceptionDeepDivePanel controls={controls} /></Section>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={6}><DecompositionPanel report={report} /></Section>
                  <Section i={7}><StressPanel report={report} /></Section>
                </div>
                <Section i={8}><SensitivityPanel controls={controls} /></Section>
              </div>
            )}

            {activeTab === "stress" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={1}><ReverseStressPanel report={report} controls={controls} /></Section>
                  <Section i={2}><PnlAttributionPanel report={report} /></Section>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={3}><LimitMonitoringPanel controls={controls} /></Section>
                  <Section i={4}><ScenarioBuilderPanel controls={controls} /></Section>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={5}><BreachFeedPanel /></Section>
                  <Section i={6}><UtilizationHeatmapPanel /></Section>
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={1}><DerivativesPanel /></Section>
                  <Section i={2}><HistoricalComparisonPanel /></Section>
                </div>
                <Section i={3}><ModellabilityPanel /></Section>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <Section i={4}><ConcentrationPanel controls={controls} /></Section>
                  <Section i={5}><PerformancePanel controls={controls} /></Section>
                </div>
                <Section i={6}><CorrelationRegimePanel controls={controls} /></Section>
                <Section i={7}><VolatilityRegimePanel controls={controls} /></Section>
              </div>
            )}

            {activeTab === "tools" && (
              <div className="space-y-3">
                <Section i={1}><WhatIfSimulatorPanel controls={controls} report={report} /></Section>
                <Section i={2}><OptimizerPanel controls={controls} /></Section>
                <Section i={3}><SavedPortfoliosPanel controls={controls} setControls={setControls} activePortfolioName={activePortfolioName} setActivePortfolioName={setActivePortfolioName} isDirty={isDirty} markClean={markClean} /></Section>
              </div>
            )}

            {activeTab === "reports" && (
              <div className="space-y-3">
                <Section i={1}><CustomReportPanel controls={controls} useRealData={useRealData} activePortfolioName={activePortfolioName} /></Section>
                <Section i={2}>
                  <MethodologyReference />
                </Section>
              </div>
            )}
            </TabErrorBoundary>
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-auto">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">VaR Lab</span>
            <span>·</span>
            <span>Educational risk-model implementation — not investment advice.</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span>5 VaR methods · FRTB · Basel III · 10+ analysis panels</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
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
        <BookOpen className="h-4 w-4 text-muted-foreground" />
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
