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
}

const DEFAULT_CONTROLS: VarControls = {
  confidence: 0.99,
  horizon: 1,
  method: "historical",
  seed: 42,
  totalValue: 10_000_000,
  positions: [
    { symbol: "SPX", quantity: 800 },
    { symbol: "AAPL", quantity: 12000 },
    { symbol: "XOM", quantity: 18000 },
    { symbol: "TLT", quantity: 45000 },
    { symbol: "EURUSD", quantity: 4_000_000 },
    { symbol: "GOLD", quantity: 1400 },
    { symbol: "BTC", quantity: 45 },
  ],
};

export function useVarData(): VarData {
  const [controls, setControls] = React.useState<VarControls>(DEFAULT_CONTROLS);
  const [report, setReport] = React.useState<FullReport | null>(null);
  const [market, setMarket] = React.useState<MarketSeries | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<string | null>(null);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const reportUrl = `/api/var/report?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    const marketUrl = `/api/var/market?seed=${controls.seed}`;

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
  }, [controls.confidence, controls.horizon, controls.method, controls.seed, controls.totalValue, positionsStr]);

  return { report, market, loading, error, controls, setControls, lastUpdated };
}
