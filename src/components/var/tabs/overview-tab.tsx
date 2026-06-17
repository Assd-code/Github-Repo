"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MethodologyComparison } from "../methodology-comparison";
import { PnlDistribution } from "../pnl-distribution";
import { PortfolioPanel } from "../portfolio-panel";
import { MarketPanel } from "../market-panel";
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

export function OverviewTab({ report, market, controls }: TabProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Section i={1}><MethodologyComparison report={report} activeMethod={controls.method} /></Section>
        <Section i={2}><PnlDistribution report={report} method={controls.method} /></Section>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Section i={3}><PortfolioPanel report={report} /></Section>
        <Section i={4}><MarketPanel market={market} /></Section>
      </div>
    </div>
  );
}
