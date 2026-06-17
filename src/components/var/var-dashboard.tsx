"use client";

import * as React from "react";
import { useVarData } from "./use-var-data";
import { ControlBar } from "./control-bar";
import { KpiCards } from "./kpi-cards";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, BookOpen } from "lucide-react";

// Direct static imports — no dynamic imports, no tabs, no lazy loading.
// This is a simple single-page dashboard that just works.
import { MethodologyComparison } from "./methodology-comparison";
import { PnlDistribution } from "./pnl-distribution";
import { PortfolioPanel } from "./portfolio-panel";
import { MarketPanel } from "./market-panel";
import { VarTrendPanel } from "./var-trend-panel";
import { LiquidityPanel } from "./liquidity-panel";
import { BacktestPanel } from "./backtest-panel";
import { DecompositionPanel } from "./decomposition-panel";
import { StressPanel } from "./stress-panel";
import { ReverseStressPanel } from "./reverse-stress-panel";
import { PnlAttributionPanel } from "./pnl-attribution-panel";
import { CustomReportPanel } from "./custom-report-panel";

export function VarDashboard() {
  const { report, market, loading, error, controls, setControls, lastUpdated, useRealData, setUseRealData, dataSource, activePortfolioName, setActivePortfolioName, isDirty, markClean } = useVarData();
  const [, force] = React.useReducer((x) => x + 1, 0);
  const refresh = () => force();

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
      </header>

      <main className="flex-1 mx-auto max-w-[1400px] w-full px-4 md:px-6 py-4 space-y-3">
        {/* Control bar */}
        <div className="rounded-xl border bg-card p-3 md:p-4 shadow-sm">
          <ControlBar
            controls={controls}
            setControls={setControls}
            onRefresh={refresh}
            loading={loading}
            useRealData={useRealData}
            setUseRealData={setUseRealData}
            activePortfolioName={activePortfolioName}
            setActivePortfolioName={setActivePortfolioName}
            isDirty={isDirty}
            markClean={markClean}
          />
        </div>

        {/* Data source banner */}
        {dataSource && dataSource.dataSource && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${dataSource.dataSource === "real" ? "bg-emerald-500/5 border-emerald-500/20" : dataSource.dataSource === "mixed" ? "bg-amber-500/5 border-amber-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {dataSource.dataSource === "real" && <span className="text-emerald-500 font-medium">🟢 Live Data</span>}
              {dataSource.dataSource === "mixed" && <span className="text-amber-500 font-medium">🟡 Mixed Data</span>}
              {dataSource.dataSource === "synthetic-fallback" && <span className="text-rose-500 font-medium">🔴 Synthetic Fallback</span>}
              <span className="text-muted-foreground">· {dataSource.fetched?.length || 0} symbols from Yahoo Finance</span>
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-[420px] rounded-xl" />
          </div>
        ) : report ? (
          <div className="space-y-3">
            {/* KPI cards */}
            <KpiCards report={report} method={controls.method} />

            {/* Core charts — use report data, no extra API calls */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <MethodologyComparison report={report} activeMethod={controls.method} />
              <PnlDistribution report={report} method={controls.method} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <VarTrendPanel report={report} method={controls.method} />
              <LiquidityPanel report={report} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <BacktestPanel report={report} method={controls.method} />
              <DecompositionPanel report={report} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <StressPanel report={report} />
              <ReverseStressPanel report={report} controls={controls} />
            </div>

            <PnlAttributionPanel report={report} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <PortfolioPanel report={report} />
              <MarketPanel market={market} />
            </div>

            {/* Custom Report Builder */}
            <CustomReportPanel controls={controls} useRealData={useRealData} activePortfolioName={activePortfolioName} />

            {/* Methodology reference */}
            <MethodologyReference />
          </div>
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
          <span>5 VaR methods · FRTB · Basel III</span>
        </div>
      </footer>
    </div>
  );
}

function MethodologyReference() {
  const refs = [
    { name: "Parametric (Var-Cov)", desc: "Assumes jointly normal returns. Fast, captures diversification via the covariance matrix, but underestimates fat tails." },
    { name: "Historical Simulation", desc: "Non-parametric: re-values the portfolio under every historical move. Captures empirical fat tails but anchored to the window." },
    { name: "Monte Carlo", desc: "Simulates thousands of correlated paths. Most flexible — handles non-linearity, but compute-heavy." },
    { name: "Filtered HS (EWMA)", desc: "EWMA-GARCH filter standardizes returns, bootstraps residuals scaled to current vol. Adapts fast to vol regimes." },
    { name: "EVT (GPD)", desc: "Fits a Generalized Pareto Distribution to the tail. Improves accuracy at very high confidence (99.5%+)." },
  ];
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        Methodology Reference
      </h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        A robust risk framework reports a range of VaRs across methods — the spread itself is a measure of model risk.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {refs.map((r) => (
          <div key={r.name} className="rounded-lg border bg-muted/20 p-3">
            <div className="text-xs font-semibold mb-1">{r.name}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
