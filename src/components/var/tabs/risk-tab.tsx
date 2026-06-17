"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { VarTrendPanel } from "../var-trend-panel";
import { LiquidityPanel } from "../liquidity-panel";
import { BacktestPanel } from "../backtest-panel";
import { McPathsPanel } from "../mc-paths-panel";
import { ExceptionDeepDivePanel } from "../exception-deepdive-panel";
import { DecompositionPanel } from "../decomposition-panel";
import { StressPanel } from "../stress-panel";
import { SensitivityPanel } from "../sensitivity-panel";
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

function StaggeredSection({ children, i, delay = 400 }: { children: React.ReactNode; i: number; delay?: number }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setVisible(true), i * delay);
    return () => clearTimeout(timer);
  }, [i, delay]);
  if (!visible) return <Skeleton className="h-[400px] rounded-xl" />;
  return <Section i={i}>{children}</Section>;
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

export function RiskTab({ report, controls }: TabProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={0}><VarTrendPanel report={report} method={controls.method} /></StaggeredSection>
        <StaggeredSection i={1}><LiquidityPanel report={report} /></StaggeredSection>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={2}><BacktestPanel report={report} method={controls.method} /></StaggeredSection>
        <StaggeredSection i={3}><McPathsPanel report={report} method={controls.method} /></StaggeredSection>
      </div>
      <StaggeredSection i={4}><ExceptionDeepDivePanel controls={controls} /></StaggeredSection>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={5}><DecompositionPanel report={report} /></StaggeredSection>
        <StaggeredSection i={6}><StressPanel report={report} /></StaggeredSection>
      </div>
      <StaggeredSection i={7}><SensitivityPanel controls={controls} /></StaggeredSection>
    </div>
  );
}
