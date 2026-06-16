"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useVarData } from "./use-var-data";
import { ControlBar } from "./control-bar";
import { KpiCards } from "./kpi-cards";
import { MethodologyComparison } from "./methodology-comparison";
import { PnlDistribution } from "./pnl-distribution";
import { BacktestPanel } from "./backtest-panel";
import { McPathsPanel } from "./mc-paths-panel";
import { DecompositionPanel } from "./decomposition-panel";
import { StressPanel } from "./stress-panel";
import { MarketPanel } from "./market-panel";
import { PortfolioPanel } from "./portfolio-panel";
import { VarTrendPanel } from "./var-trend-panel";
import { LiquidityPanel } from "./liquidity-panel";
import { ReverseStressPanel } from "./reverse-stress-panel";
import { PnlAttributionPanel } from "./pnl-attribution-panel";
import { LimitMonitoringPanel } from "./limit-monitoring-panel";
import { ScenarioBuilderPanel } from "./scenario-builder-panel";
import { BreachFeedPanel } from "./breach-feed-panel";
import { UtilizationHeatmapPanel } from "./utilization-heatmap-panel";
import { DerivativesPanel } from "./derivatives-panel";
import { HistoricalComparisonPanel } from "./historical-comparison-panel";
import { ModellabilityPanel } from "./modellability-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, BookOpen, Layers3 } from "lucide-react";

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

export function VarDashboard() {
  const { report, market, loading, error, controls, setControls, lastUpdated } = useVarData();
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
            <Badge variant="secondary" className="text-[10px] h-5">5 methodologies</Badge>
            <Badge variant="secondary" className="text-[10px] h-5">FRTB-aligned</Badge>
            <Badge variant="secondary" className="text-[10px] h-5">Basel backtest</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">L-VaR</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-2/15 text-chart-2 border-chart-2/30">Reverse stress</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-4/15 text-chart-4 border-chart-4/30">Greeks</Badge>
            <Badge variant="secondary" className="text-[10px] h-5 bg-chart-3/15 text-chart-3 border-chart-3/30">NMRF</Badge>
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
          <ControlBar controls={controls} setControls={setControls} onRefresh={refresh} loading={loading} />
        </div>

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

            {/* Methodology comparison + P&L distribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={1}><MethodologyComparison report={report} activeMethod={controls.method} /></Section>
              <Section i={2}><PnlDistribution report={report} method={controls.method} /></Section>
            </div>

            {/* VaR Trend + Liquidity (FRTB) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={3}><VarTrendPanel report={report} method={controls.method} /></Section>
              <Section i={4}><LiquidityPanel report={report} /></Section>
            </div>

            {/* Backtest + MC paths */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={5}><BacktestPanel report={report} method={controls.method} /></Section>
              <Section i={6}><McPathsPanel report={report} method={controls.method} /></Section>
            </div>

            {/* Decomposition + Stress */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={7}><DecompositionPanel report={report} /></Section>
              <Section i={8}><StressPanel report={report} /></Section>
            </div>

            {/* Reverse stress + P&L attribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={9}><ReverseStressPanel report={report} controls={controls} /></Section>
              <Section i={10}><PnlAttributionPanel report={report} /></Section>
            </div>

            {/* Limit monitoring + Scenario builder (round 3) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={11}><LimitMonitoringPanel controls={controls} /></Section>
              <Section i={12}><ScenarioBuilderPanel controls={controls} /></Section>
            </div>

            {/* Breach feed + Utilization heatmap (round 4) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={13}><BreachFeedPanel /></Section>
              <Section i={14}><UtilizationHeatmapPanel /></Section>
            </div>

            {/* Derivatives/Greeks + Historical VaR comparison (round 5) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={15}><DerivativesPanel /></Section>
              <Section i={16}><HistoricalComparisonPanel /></Section>
            </div>

            {/* Modellability assessment (round 6) */}
            <Section i={17}><ModellabilityPanel /></Section>

            {/* Market + Portfolio */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Section i={18}><MarketPanel market={market} /></Section>
              <Section i={19}><PortfolioPanel report={report} /></Section>
            </div>

            {/* Methodology reference */}
            <Section i={20}>
              <MethodologyReference />
            </Section>
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
            <span>L-VaR · PLA · Reverse stress · Greeks · NMRF · Limit monitoring · Scenario builder · Breach feed · Heatmap · Historical comparison · Kupiec · Christoffersen · Basel III</span>
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
