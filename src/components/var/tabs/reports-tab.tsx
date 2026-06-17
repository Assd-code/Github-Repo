"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CustomReportPanel } from "../custom-report-panel";
import { BookOpen } from "lucide-react";
import type { FullReport } from "@/lib/var/types";
import type { MarketSeries, VarControls } from "../use-var-data";

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.4, delay: Math.min(i * 0.05, 0.3), ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  }),
};

function Section({ children, i }: { children: React.ReactNode; i: number }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return <div>{children}</div>;
  return <motion.div custom={i} variants={fadeUp} initial="hidden" animate="show">{children}</motion.div>;
}

interface TabProps {
  report: FullReport;
  market: MarketSeries | null;
  controls: VarControls;
  setControls: React.Dispatch<React.SetStateAction<VarControls>>;
  useRealData: boolean;
  activePortfolioName: string | null;
  setActivePortfolioName: React.Dispatch<React.SetStateAction<string | null>>;
  isDirty: boolean;
  markClean: () => void;
}

function MethodologyReference() {
  const refs = [
    { name: "Parametric (Var-Cov)", desc: "Assumes jointly normal returns. Fast, captures diversification via the covariance matrix, but underestimates fat tails and fails for non-linear instruments (options, MBS)." },
    { name: "Historical Simulation", desc: "Non-parametric: re-values the portfolio under every historical move. Captures empirical fat tails & correlations but is anchored to the chosen window." },
    { name: "Monte Carlo", desc: "Simulates thousands of correlated paths from fitted stochastic processes. Most flexible — handles path-dependency & non-linearity, but compute-heavy." },
    { name: "Filtered HS (EWMA)", desc: "EWMA-GARCH filter standardizes historical returns, then bootstraps residuals scaled to current volatility. Adapts fast to vol regimes." },
    { name: "EVT (GPD)", desc: "Fits a Generalized Pareto Distribution to the tail beyond a threshold. Improves accuracy at very high confidence (99.5%+)." },
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
          <div key={r.name} className="rounded-lg border bg-muted/20 p-3 hover:bg-muted/30 transition-colors">
            <div className="text-xs font-semibold mb-1">{r.name}</div>
            <div className="text-[11px] text-muted-foreground leading-relaxed">{r.desc}</div>
          </div>
        ))}
        <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-amber-500/10 p-3">
          <div className="text-xs font-semibold mb-1 text-rose-500">Complementary Measures</div>
          <div className="text-[11px] text-muted-foreground leading-relaxed">
            VaR is never used alone. This engine also reports Expected Shortfall, stress tests, Greeks-style decomposition, liquidity-adjusted VaR, reverse stress, P&L attribution, and backtesting.
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsTab({ controls, useRealData, activePortfolioName }: TabProps) {
  return (
    <div className="space-y-3">
      <Section i={1}><CustomReportPanel controls={controls} useRealData={useRealData} activePortfolioName={activePortfolioName} /></Section>
      <Section i={2}><MethodologyReference /></Section>
    </div>
  );
}
