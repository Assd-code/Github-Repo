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
import { TabErrorBoundary } from "./tab-error-boundary";

// ONE dynamic import per tab — each tab's panels are bundled into a single chunk.
// This reduces the number of dynamic import wrappers from 30 to 6, dramatically
// reducing memory pressure during initial load and tab switching.
const OverviewTab = dynamic(() => import("./tabs/overview-tab").then(m => m.OverviewTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /><Skeleton className="h-[400px] rounded-xl" /></div>,
});
const RiskTab = dynamic(() => import("./tabs/risk-tab").then(m => m.RiskTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /><Skeleton className="h-[400px] rounded-xl" /></div>,
});
const StressTab = dynamic(() => import("./tabs/stress-tab").then(m => m.StressTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /><Skeleton className="h-[400px] rounded-xl" /></div>,
});
const AdvancedTab = dynamic(() => import("./tabs/advanced-tab").then(m => m.AdvancedTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /><Skeleton className="h-[400px] rounded-xl" /></div>,
});
const ToolsTab = dynamic(() => import("./tabs/tools-tab").then(m => m.ToolsTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /></div>,
});
const ReportsTab = dynamic(() => import("./tabs/reports-tab").then(m => m.ReportsTab), {
  ssr: false,
  loading: () => <div className="space-y-3"><Skeleton className="h-[400px] rounded-xl" /></div>,
});

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

  // Shared props for all tabs
  const tabProps = { report, market, controls, setControls, useRealData, activePortfolioName, setActivePortfolioName, isDirty, markClean };

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

            {/* Tab content — only the active tab's chunk is loaded */}
            <TabErrorBoundary tabId={activeTab}>
              {activeTab === "overview" && <OverviewTab {...tabProps} />}
              {activeTab === "risk" && <RiskTab {...tabProps} />}
              {activeTab === "stress" && <StressTab {...tabProps} />}
              {activeTab === "advanced" && <AdvancedTab {...tabProps} />}
              {activeTab === "tools" && <ToolsTab {...tabProps} />}
              {activeTab === "reports" && <ReportsTab {...tabProps} />}
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
