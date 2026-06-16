"use client";

import * as React from "react";
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
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, Github, BookOpen } from "lucide-react";

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
          </div>
          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums">
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
        <div className="rounded-xl border bg-card p-3 md:p-4">
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
            <KpiCards report={report} method={controls.method} />

            {/* Methodology comparison + P&L distribution */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <MethodologyComparison report={report} activeMethod={controls.method} />
              <PnlDistribution report={report} method={controls.method} />
            </div>

            {/* Backtest + MC paths */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <BacktestPanel report={report} method={controls.method} />
              <McPathsPanel report={report} method={controls.method} />
            </div>

            {/* Decomposition + Stress */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <DecompositionPanel report={report} />
              <StressPanel report={report} />
            </div>

            {/* Market + Portfolio */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <MarketPanel market={market} />
              <PortfolioPanel report={report} />
            </div>

            {/* Methodology reference */}
            <MethodologyReference />
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
          <div className="flex items-center gap-3">
            <span>Parametric · Historical · Monte Carlo · Filtered HS · EVT</span>
            <span>·</span>
            <span>Kupiec · Christoffersen · Basel III</span>
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
      <h3 className="text-sm font-semibold mb-1">Methodology Reference</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        A robust risk framework reports a range of VaRs across methods — the spread itself is a measure of model risk. No single number should be trusted in isolation.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {refs.map((r) => (
          <div key={r.name} className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-semibold mb-1">{r.name}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</div>
          </div>
        ))}
        <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-amber-500/10 p-3">
          <div className="text-xs font-semibold mb-1 text-rose-500">Complementary Measures</div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            VaR is never used alone. This engine also reports <span className="font-medium text-foreground">Expected Shortfall</span> (coherent, tail-shape aware, the FRTB metric), <span className="font-medium text-foreground">stress tests</span>, <span className="font-medium text-foreground">Greeks-style decomposition</span>, and <span className="font-medium text-foreground">backtesting</span> to form a complete risk picture.
          </div>
        </div>
      </div>
    </div>
  );
}
