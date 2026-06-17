"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
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

// Staggered mount: only shows children after a delay, preventing all panels
// from making API calls simultaneously.
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

export function StressTab({ report, controls }: TabProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={0}><ReverseStressPanel report={report} controls={controls} /></StaggeredSection>
        <StaggeredSection i={1}><PnlAttributionPanel report={report} /></StaggeredSection>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={2}><LimitMonitoringPanel controls={controls} /></StaggeredSection>
        <StaggeredSection i={3}><ScenarioBuilderPanel controls={controls} /></StaggeredSection>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <StaggeredSection i={4}><BreachFeedPanel /></StaggeredSection>
        <StaggeredSection i={5}><UtilizationHeatmapPanel /></StaggeredSection>
      </div>
    </div>
  );
}
