"use client";

import * as React from "react";
import { useVarData } from "./use-var-data";
import { ControlBar } from "./control-bar";
import { KpiCards } from "./kpi-cards";
import { ThemeToggle } from "@/components/theme-toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, BookOpen, LayoutDashboard, BarChart3, Microscope, SlidersHorizontal } from "lucide-react";

// All imports are static — no dynamic imports, no lazy loading.
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
import { ExceptionDeepDivePanel } from "./exception-deepdive-panel";
import { SensitivityPanel } from "./sensitivity-panel";
import { LimitMonitoringPanel } from "./limit-monitoring-panel";
import { ScenarioBuilderPanel } from "./scenario-builder-panel";
import { BreachFeedPanel } from "./breach-feed-panel";
import { UtilizationHeatmapPanel } from "./utilization-heatmap-panel";
import { DerivativesPanel } from "./derivatives-panel";
import { HistoricalComparisonPanel } from "./historical-comparison-panel";
import { ModellabilityPanel } from "./modellability-panel";
import { ConcentrationPanel } from "./concentration-panel";
import { PerformancePanel } from "./performance-panel";
import { CorrelationRegimePanel } from "./correlation-regime-panel";
import { VolatilityRegimePanel } from "./volatility-regime-panel";
import { WhatIfSimulatorPanel } from "./whatif-simulator-panel";
import { OptimizerPanel } from "./optimizer-panel";
import { SavedPortfoliosPanel } from "./saved-portfolios-panel";
import { McPathsPanel } from "./mc-paths-panel";

type TabId = "overview" | "analysis" | "advanced" | "tools";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "analysis", label: "Analysis", icon: BarChart3 },
  { id: "advanced", label: "Advanced", icon: Microscope },
  { id: "tools", label: "Tools & Reports", icon: SlidersHorizontal },
];

export function VarDashboard() {
  const { report, market, loading, error, controls, setControls, lastUpdated, useRealData, setUseRealData, dataSource, activePortfolioName, setActivePortfolioName, isDirty, markClean } = useVarData();
  const [, force] = React.useReducer((x) => x + 1, 0);
  const refresh = () => force();
  const [activeTab, setActiveTab] = React.useState<TabId>("overview");

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />LIVE
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] h-5 bg-muted/30 text-muted-foreground border-muted-foreground/30">SYNTHETIC</Badge>
            )}
            {activePortfolioName && (
              <Badge variant="secondary" className="text-[10px] h-5 bg-chart-5/15 text-chart-5 border-chart-5/30">{activePortfolioName}</Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {lastUpdated && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums" suppressHydrationWarning>
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
        {/* Tab bar */}
        <div className="border-t bg-background/95">
          <div className="mx-auto max-w-[1400px] px-4 md:px-6">
            <div className="flex items-center gap-0.5 -mb-px">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 md:px-6 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
                    activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto max-w-[1400px] w-full px-4 md:px-6 py-4 space-y-3">
        <div className="rounded-xl border bg-card p-3 md:p-4 shadow-sm">
          <ControlBar controls={controls} setControls={setControls} onRefresh={refresh} loading={loading} useRealData={useRealData} setUseRealData={setUseRealData} activePortfolioName={activePortfolioName} setActivePortfolioName={setActivePortfolioName} isDirty={isDirty} markClean={markClean} />
        </div>

        {dataSource && dataSource.dataSource && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${dataSource.dataSource === "real" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"}`}>
            <span className={dataSource.dataSource === "real" ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
              {dataSource.dataSource === "real" ? "🟢 Live Data" : "🔴 Fallback"}
            </span>
            <span className="text-muted-foreground"> · {dataSource.fetched?.length || 0} symbols from Yahoo Finance</span>
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
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-lg" />)}
            </div>
            <Skeleton className="h-[420px] rounded-xl" />
          </div>
        ) : report ? (
          <>
            <KpiCards report={report} method={controls.method} />

            {activeTab === "overview" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <MethodologyComparison report={report} activeMethod={controls.method} />
                  <PnlDistribution report={report} method={controls.method} />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <PortfolioPanel report={report} />
                  <MarketPanel market={market} />
                </div>
              </div>
            )}

            {activeTab === "analysis" && (
              <div className="space-y-3">
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
                <ExceptionDeepDivePanel controls={controls} />
                <SensitivityPanel controls={controls} />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <LimitMonitoringPanel controls={controls} />
                  <ScenarioBuilderPanel controls={controls} />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <BreachFeedPanel />
                  <UtilizationHeatmapPanel />
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <DerivativesPanel />
                  <HistoricalComparisonPanel />
                </div>
                <ModellabilityPanel />
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  <ConcentrationPanel controls={controls} />
                  <PerformancePanel controls={controls} />
                </div>
                <CorrelationRegimePanel controls={controls} />
                <VolatilityRegimePanel controls={controls} />
              </div>
            )}

            {activeTab === "tools" && (
              <div className="space-y-3">
                <CustomReportPanel controls={controls} useRealData={useRealData} activePortfolioName={activePortfolioName} />
                <WhatIfSimulatorPanel controls={controls} report={report} />
                <OptimizerPanel controls={controls} />
                <SavedPortfoliosPanel controls={controls} setControls={setControls} activePortfolioName={activePortfolioName} setActivePortfolioName={setActivePortfolioName} isDirty={isDirty} markClean={markClean} />
              </div>
            )}
          </>
        ) : null}
      </main>

      <footer className="border-t bg-muted/30 mt-auto">
        <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-3 text-[11px] text-muted-foreground text-center">
          VaR Lab · Educational risk-model implementation — not investment advice.
        </div>
      </footer>
    </div>
  );
}
