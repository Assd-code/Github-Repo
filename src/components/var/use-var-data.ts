"use client";

import * as React from "react";
import type {
  FullReport,
  Methodology,
} from "@/lib/var/types";

export interface MarketSeries {
  ok: boolean;
  assets: { symbol: string; name: string; assetClass: string; drift: number; vol: number; spot: number }[];
  dates: string[];
  series: Record<string, number[]>;
  correlation: number[][];
  windowDays: number;
  dataSource?: { dataSource?: string; fetched?: { symbol: string; name: string; assetClass: string; spot: number; prices: number }[]; failed?: { symbol: string; error: string }[] };
}

export interface VarControls {
  confidence: number;
  horizon: number;
  method: Methodology;
  seed: number;
  totalValue: number;
  positions: { symbol: string; quantity: number }[];
}

export interface VarData {
  report: FullReport | null;
  market: MarketSeries | null;
  loading: boolean;
  error: string | null;
  controls: VarControls;
  setControls: React.Dispatch<React.SetStateAction<VarControls>>;
  lastUpdated: string | null;
  useRealData: boolean;
  setUseRealData: React.Dispatch<React.SetStateAction<boolean>>;
  dataSource: { dataSource?: string; fetched?: { symbol: string; name: string; assetClass: string; spot: number; prices: number }[]; failed?: { symbol: string; error: string }[] } | null;
  // Multi-portfolio support
  activePortfolioName: string | null;
  setActivePortfolioName: React.Dispatch<React.SetStateAction<string | null>>;
  isDirty: boolean;
  markClean: () => void;
}

const DEFAULT_CONTROLS: VarControls = {
  confidence: 0.99,
  horizon: 1,
  method: "historical",
  seed: 42,
  totalValue: 10_000_000,
  positions: [
    { symbol: "SPY", quantity: 800 },
    { symbol: "AAPL", quantity: 12000 },
    { symbol: "XOM", quantity: 18000 },
    { symbol: "TLT", quantity: 45000 },
    { symbol: "EURUSD=X", quantity: 4_000_000 },
    { symbol: "GLD", quantity: 1400 },
    { symbol: "BTC-USD", quantity: 45 },
  ],
};

export function useVarData(): VarData {
  const [controls, setControls] = React.useState<VarControls>(DEFAULT_CONTROLS);
  const [report, setReport] = React.useState<FullReport | null>(null);
  const [market, setMarket] = React.useState<MarketSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);
  const [useRealData, setUseRealData] = React.useState<boolean>(true);
  const [dataSource, setDataSource] = React.useState<VarData["dataSource"]>(null);
  const [activePortfolioName, setActivePortfolioName] = React.useState<string | null>(null);
  const [isDirty, setIsDirty] = React.useState<boolean>(false);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  // Track when controls change after a portfolio is loaded (dirty state)
  const lastLoaded = React.useRef<string>("");
  React.useEffect(() => {
    const sig = `${positionsStr}|${controls.totalValue}`;
    if (lastLoaded.current && lastLoaded.current !== sig) {
      setIsDirty(true);
    }
  }, [positionsStr, controls.totalValue]);

  const markClean = React.useCallback(() => {
    const sig = `${positionsStr}|${controls.totalValue}`;
    lastLoaded.current = sig;
    setIsDirty(false);
  }, [positionsStr, controls.totalValue]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Choose endpoint based on data source toggle
    const reportBase = useRealData ? "/api/var/real-report" : "/api/var/report";
    const marketBase = useRealData ? "/api/var/real-market" : "/api/var/market";

    // For real data, pass symbols; for synthetic, pass seed
    const symbolsParam = controls.positions.map((p) => p.symbol).join(",");
    const reportUrl = useRealData
      ? `${reportBase}?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`
      : `${reportBase}?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    const marketUrl = useRealData
      ? `${marketBase}?symbols=${encodeURIComponent(symbolsParam)}`
      : `${marketBase}?seed=${controls.seed}`;

    Promise.all([
      fetch(reportUrl).then((r) => r.json()),
      fetch(marketUrl).then((r) => r.json()),
    ])
      .then(([rep, mkt]) => {
        if (cancelled) return;
        if (!rep.ok) throw new Error(rep.error || "Failed to load VaR report");
        if (!mkt.ok) throw new Error(mkt.error || "Failed to load market data");
        setReport(rep.report as FullReport);
        setMarket(mkt as MarketSeries);
        // Capture data source info from real-report
        if (useRealData && rep.dataSource) {
          setDataSource(rep.dataSource);
        } else {
          setDataSource(null);
        }
        setLastUpdated(new Date().toISOString());
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Unknown error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [controls.confidence, controls.horizon, controls.method, controls.seed, controls.totalValue, positionsStr, useRealData]);

  return { report, market, loading, error, controls, setControls, lastUpdated, useRealData, setUseRealData, dataSource, activePortfolioName, setActivePortfolioName, isDirty, markClean };
}
