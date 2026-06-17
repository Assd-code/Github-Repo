"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ScatterChart,
  Scatter,
  Line,
  ComposedChart,
  ReferenceDot,
} from "recharts";
import { Target, TrendingUp, Minimize2, Award, Check, Loader2 } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD, fmtPct } from "@/lib/format";

interface OptAsset {
  symbol: string;
  name: string;
  assetClass: string;
  weight: number;
  marketValue: number;
}

interface OptResult {
  objective: "risk-parity" | "min-variance" | "max-sharpe";
  weights: OptAsset[];
  expectedReturn: number;
  expectedVol: number;
  sharpe: number;
  var: number;
  es: number;
  varPct: number;
  iterations: number;
  converged: boolean;
  riskContributions: { symbol: string; name: string; contribution: number; share: number }[];
}

interface FullOpt {
  riskParity: OptResult;
  minVariance: OptResult;
  maxSharpe: OptResult;
  current: {
    weights: OptAsset[];
    expectedReturn: number;
    expectedVol: number;
    sharpe: number;
    var: number;
    es: number;
  };
  frontier: { return: number; vol: number; sharpe: number; var: number }[];
  riskFreeRate: number;
}

const ASSET_COLORS: Record<string, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-3)",
  rate: "var(--chart-4)",
  crypto: "var(--chart-5)",
};

const OBJECTIVE_META: Record<
  OptResult["objective"],
  { label: string; icon: React.ElementType; color: string; bg: string; ring: string; desc: string }
> = {
  "risk-parity": {
    label: "Risk Parity",
    icon: Target,
    color: "text-chart-4",
    bg: "bg-chart-4/10",
    ring: "border-chart-4/30",
    desc: "Equal risk contribution per asset — diversified by risk, not capital",
  },
  "min-variance": {
    label: "Min Variance",
    icon: Minimize2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    ring: "border-emerald-500/30",
    desc: "Lowest portfolio volatility — favours low-vol & diversifying assets",
  },
  "max-sharpe": {
    label: "Max Sharpe",
    icon: Award,
    color: "text-chart-2",
    bg: "bg-chart-2/10",
    ring: "border-chart-2/30",
    desc: "Tangency portfolio — maximum return-per-unit-risk (capital allocation line)",
  },
};

export function OptimizerPanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<FullOpt | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<OptResult["objective"]>("max-sharpe");

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/optimizer?seed=${controls.seed}&confidence=${controls.confidence}&horizon=${controls.horizon}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.optimization);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.seed, controls.confidence, controls.horizon, controls.totalValue, positionsStr]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-chart-2" />
            Portfolio Optimizer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
            Optimizing…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Map UI objective key to API response key (API uses camelCase, no hyphens)
  const apiKeyMap: Record<OptResult["objective"], "riskParity" | "minVariance" | "maxSharpe"> = {
    "risk-parity": "riskParity",
    "min-variance": "minVariance",
    "max-sharpe": "maxSharpe",
  };
  const selectedResult = data[apiKeyMap[selected]];
  const meta = OBJECTIVE_META[selected];

  // Comparison data: current vs selected
  const comparison = [
    {
      label: "Vol",
      current: +(data.current.expectedVol * 100).toFixed(2),
      optimal: +(selectedResult.expectedVol * 100).toFixed(2),
    },
    {
      label: "Return",
      current: +(data.current.expectedReturn * 100).toFixed(2),
      optimal: +(selectedResult.expectedReturn * 100).toFixed(2),
    },
    {
      label: "Sharpe",
      current: +data.current.sharpe.toFixed(3),
      optimal: +selectedResult.sharpe.toFixed(3),
    },
    {
      label: "VaR ($K)",
      current: +(data.current.var / 1000).toFixed(1),
      optimal: +(selectedResult.var / 1000).toFixed(1),
    },
  ];

  // Weight comparison: current vs optimal
  const weightData = (() => {
    const map = new Map<string, { symbol: string; current: number; optimal: number; assetClass: string }>();
    for (const w of data.current.weights) {
      map.set(w.symbol, { symbol: w.symbol, current: +(w.weight * 100).toFixed(2), optimal: 0, assetClass: w.assetClass });
    }
    for (const w of selectedResult.weights) {
      const existing = map.get(w.symbol);
      if (existing) existing.optimal = +(w.weight * 100).toFixed(2);
      else map.set(w.symbol, { symbol: w.symbol, current: 0, optimal: +(w.weight * 100).toFixed(2), assetClass: w.assetClass });
    }
    return Array.from(map.values()).sort((a, b) => b.optimal + b.current - a.optimal - a.current);
  })();

  // Frontier scatter data
  const frontierData = data.frontier.map((p, i) => ({
    vol: +(p.vol * 100).toFixed(2),
    return: +(p.return * 100).toFixed(2),
    sharpe: +p.sharpe.toFixed(3),
  }));
  // Add current portfolio point
  const currentPoint = {
    vol: +(data.current.expectedVol * 100).toFixed(2),
    return: +(data.current.expectedReturn * 100).toFixed(2),
    sharpe: +data.current.sharpe.toFixed(3),
  };
  const optimalPoint = {
    vol: +(selectedResult.expectedVol * 100).toFixed(2),
    return: +(selectedResult.expectedReturn * 100).toFixed(2),
    sharpe: +selectedResult.sharpe.toFixed(3),
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-chart-2" />
              Portfolio Optimizer
            </CardTitle>
            <CardDescription>
              Mean-variance optimization · risk parity · tangency portfolio · efficient frontier
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${meta.color} ${meta.ring} ${meta.bg}`}>
            <meta.icon className="h-3 w-3 mr-1" />
            {meta.label}
            {selectedResult.converged && <Check className="h-3 w-3 ml-1" />}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Objective selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {(Object.keys(OBJECTIVE_META) as OptResult["objective"][]).map((obj) => {
            const m = OBJECTIVE_META[obj];
            const r = data[apiKeyMap[obj]];
            const isActive = selected === obj;
            return (
              <button
                key={obj}
                onClick={() => setSelected(obj)}
                className={`text-left rounded-lg border p-2.5 transition-all ${isActive ? `${m.bg} ${m.ring} border` : "bg-card hover:bg-muted/30 border-border"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className={`flex items-center gap-1.5 text-xs font-semibold ${isActive ? m.color : ""}`}>
                    <m.icon className="h-3.5 w-3.5" />
                    {m.label}
                  </div>
                  {r.converged ? (
                    <Check className={`h-3 w-3 ${isActive ? m.color : "text-emerald-500"}`} />
                  ) : (
                    <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight mb-1.5">{m.desc}</div>
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div>
                    <div className="text-muted-foreground">Sharpe</div>
                    <div className={`font-semibold tabular-nums ${r.sharpe > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {r.sharpe.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Vol</div>
                    <div className="font-semibold tabular-nums">{(r.expectedVol * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Two-column: efficient frontier + weight comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Efficient frontier scatter */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>Efficient frontier (return vs vol)</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/60" /> frontier
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-chart-1" /> current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-chart-2" /> optimal
              </span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    type="number"
                    dataKey="vol"
                    name="Volatility"
                    unit="%"
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    label={{ value: "Annualized Vol", position: "insideBottom", offset: -2, fontSize: 9, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="return"
                    name="Return"
                    unit="%"
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    width={44}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(v: number, name) => name === "sharpe" ? v.toFixed(3) : `${v.toFixed(2)}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Scatter data={frontierData} fill="var(--muted-foreground)" fillOpacity={0.4} shape="circle" />
                  <ReferenceDot x={currentPoint.vol} y={currentPoint.return} r={6} fill="var(--chart-1)" stroke="var(--background)" strokeWidth={2} />
                  <ReferenceDot x={optimalPoint.vol} y={optimalPoint.return} r={6} fill="var(--chart-2)" stroke="var(--background)" strokeWidth={2} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weight comparison bars */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>Weight allocation: current vs optimal</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-muted" /> current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-2" /> optimal ({meta.label})
              </span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weightData} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="current" name="Current" radius={[3, 3, 0, 0]} maxBarSize={20} fill="var(--muted)" fillOpacity={0.7} />
                  <Bar dataKey="optimal" name="Optimal" radius={[3, 3, 0, 0]} maxBarSize={20}>
                    {weightData.map((d, i) => (
                      <Cell key={i} fill={ASSET_COLORS[d.assetClass] || "var(--chart-2)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Comparison stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {comparison.map((row) => {
            const better =
              row.label === "Vol" || row.label === "VaR ($K)"
                ? row.optimal < row.current
                : row.optimal > row.current;
            const delta = row.optimal - row.current;
            return (
              <div key={row.label} className="rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
                <div className="text-muted-foreground text-[10px]">{row.label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold tabular-nums">{row.optimal}</span>
                  <span className={`text-[10px] tabular-nums ${delta === 0 ? "text-muted-foreground" : better ? "text-emerald-500" : "text-rose-500"}`}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(row.label === "Sharpe" ? 3 : 2)}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">cur {row.current}</div>
              </div>
            );
          })}
        </div>

        {/* Risk contributions for selected strategy */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">
            Risk contributions at the {meta.label} optimum (should be ~equal for risk parity)
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {selectedResult.riskContributions.map((rc) => (
              <div key={rc.symbol} className="rounded-md border bg-muted/20 px-2 py-1 text-[10px]">
                <span className="font-mono font-medium">{rc.symbol}</span>{" "}
                <span className="tabular-nums text-muted-foreground">
                  {(rc.share * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Risk parity</span> balances risk contributions (each asset adds the same marginal risk) — robust when vol estimates are noisy. <span className="font-medium text-foreground">Min variance</span> minimizes total volatility, often concentrating in low-vol assets. <span className="font-medium text-foreground">Max Sharpe</span> finds the tangency portfolio — the point where the capital allocation line from rf is tangent to the efficient frontier. The efficient frontier shows all achievable risk/return combinations; portfolios below it are sub-optimal.
        </p>
      </CardContent>
    </Card>
  );
}
// cache-bust
