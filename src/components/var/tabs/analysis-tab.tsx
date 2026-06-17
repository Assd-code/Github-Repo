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
import { ReverseStressPanel } from "../reverse-stress-panel";
import { PnlAttributionPanel } from "../pnl-attribution-panel";
import { LimitMonitoringPanel } from "../limit-monitoring-panel";
import { ScenarioBuilderPanel } from "../scenario-builder-panel";
import { BreachFeedPanel } from "../breach-feed-panel";
import { UtilizationHeatmapPanel } from "../utilization-heatmap-panel";
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

function Staggered({ children, i, delay = 2000 }: { children: React.ReactNode; i: number; delay?: number }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), i * delay);
    return () => clearTimeout(t);
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

export function AnalysisTab({ report, controls }: TabProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={0}><VarTrendPanel report={report} method={controls.method} /></Staggered>
        <Staggered i={1}><LiquidityPanel report={report} /></Staggered>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={2}><BacktestPanel report={report} method={controls.method} /></Staggered>
        <Staggered i={3}><McPathsPanel report={report} method={controls.method} /></Staggered>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={4}><DecompositionPanel report={report} /></Staggered>
        <Staggered i={5}><StressPanel report={report} /></Staggered>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={6}><ReverseStressPanel report={report} controls={controls} /></Staggered>
        <Staggered i={7}><PnlAttributionPanel report={report} /></Staggered>
      </div>
      <Staggered i={8}><ExceptionDeepDivePanel controls={controls} /></Staggered>
      <Staggered i={9}><SensitivityPanel controls={controls} /></Staggered>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={10}><LimitMonitoringPanel controls={controls} /></Staggered>
        <Staggered i={11}><ScenarioBuilderPanel controls={controls} /></Staggered>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Staggered i={12}><BreachFeedPanel /></Staggered>
        <Staggered i={13}><UtilizationHeatmapPanel /></Staggered>
      </div>
    </div>
  );
}
