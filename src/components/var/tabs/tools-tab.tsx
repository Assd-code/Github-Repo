"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatIfSimulatorPanel } from "../whatif-simulator-panel";
import { OptimizerPanel } from "../optimizer-panel";
import { SavedPortfoliosPanel } from "../saved-portfolios-panel";
import { CustomReportPanel } from "../custom-report-panel";
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

function Staggered({ children, i, delay = 3000 }: { children: React.ReactNode; i: number; delay?: number }) {
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

export function ToolsTab({ report, controls, setControls, useRealData, activePortfolioName, setActivePortfolioName, isDirty, markClean }: TabProps) {
  return (
    <div className="space-y-3">
      <Staggered i={0}><CustomReportPanel controls={controls} useRealData={useRealData} activePortfolioName={activePortfolioName} /></Staggered>
      <Staggered i={1}><WhatIfSimulatorPanel controls={controls} report={report} /></Staggered>
      <Staggered i={2}><OptimizerPanel controls={controls} /></Staggered>
      <Staggered i={3}><SavedPortfoliosPanel controls={controls} setControls={setControls} activePortfolioName={activePortfolioName} setActivePortfolioName={setActivePortfolioName} isDirty={isDirty} markClean={markClean} /></Staggered>
    </div>
  );
}
