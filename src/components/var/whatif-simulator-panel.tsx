"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
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
} from "recharts";
import { Sliders, Zap, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import type { VarControls } from "./use-var-data";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

interface WhatIfResult {
  weights: { symbol: string; name: string; weight: number; marketValue: number }[];
  totalValue: number;
  parametric: { var: number; es: number; varPct: number; esPct: number; expectedPnl: number; stdPnl: number };
  historical: { var: number; es: number; varPct: number; esPct: number };
  contributions: { symbol: string; name: string; componentVar: number; componentShare: number }[];
  marginalVar: { symbol: string; name: string; marginalVar: number }[];
  delta: {
    varDelta: number;
    esDelta: number;
    varDeltaPct: number;
    direction: "lower" | "higher" | "unchanged";
  };
}

const SYMBOLS = ["SPX", "AAPL", "XOM", "TLT", "EURUSD", "GOLD", "BTC"];
const PRESETS: { id: "risk-off" | "risk-on" | "equal-weight" | "concentrate-btc" | "concentrate-spx"; label: string }[] = [
  { id: "risk-off", label: "Risk-Off" },
  { id: "risk-on", label: "Risk-On" },
  { id: "equal-weight", label: "Equal Weight" },
  { id: "concentrate-btc", label: "BTC 50%" },
  { id: "concentrate-spx", label: "SPX 60%" },
];

export function WhatIfSimulatorPanel({
  controls,
  report,
}: {
  controls: VarControls;
  report: FullReport;
}) {
  // Initialize weights from the current portfolio
  const baselineWeights = React.useMemo(() => {
    const map: Record<string, number> = {};
    let total = 0;
    // Compute from report portfolio weights (already provided)
    for (const p of report.portfolio.positions) {
      map[p.symbol] = p.weight;
      total += p.weight;
    }
    // Normalize for safety
    if (total > 0) {
      for (const k of Object.keys(map)) map[k] = map[k] / total;
    }
    return map;
  }, [report]);

  const [weights, setWeights] = React.useState<Record<string, number>>(baselineWeights);
  const [result, setResult] = React.useState<WhatIfResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [autoMode, setAutoMode] = React.useState(true);

  // Sync when baseline changes
  React.useEffect(() => {
    setWeights(baselineWeights);
  }, [baselineWeights]);

  // Baseline VaR/ES (from current report, parametric)
  const baselineVar = report.results.parametric.var;
  const baselineEs = report.results.parametric.es;

  // Debounced what-if fetch
  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    if (!autoMode) return;
    const t = setTimeout(() => {
      setLoading(true);
      const weightsParam = Object.entries(weights)
        .filter(([_, w]) => w > 0.0001)
        .map(([s, w]) => `${s}:${w.toFixed(4)}`)
        .join(",");
      const url = `/api/var/whatif?confidence=${controls.confidence}&horizon=${controls.horizon}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}&weights=${encodeURIComponent(weightsParam)}&baselineVar=${baselineVar}&baselineEs=${baselineEs}`;
      fetch(url)
        .then((r) => r.json())
        .then((j) => {
          if (j.ok) setResult(j.whatif);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [weights, autoMode, controls.confidence, controls.horizon, controls.seed, controls.totalValue, positionsStr, baselineVar, baselineEs]);

  const runManual = () => {
    setLoading(true);
    const weightsParam = Object.entries(weights)
      .filter(([_, w]) => w > 0.0001)
      .map(([s, w]) => `${s}:${w.toFixed(4)}`)
      .join(",");
    const url = `/api/var/whatif?confidence=${controls.confidence}&horizon=${controls.horizon}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}&weights=${encodeURIComponent(weightsParam)}&baselineVar=${baselineVar}&baselineEs=${baselineEs}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setResult(j.whatif);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const applyPreset = (preset: "risk-off" | "risk-on" | "equal-weight" | "concentrate-btc" | "concentrate-spx") => {
    const presetMap: Record<string, Record<string, number>> = {
      "risk-off": { TLT: 0.45, GOLD: 0.25, EURUSD: 0.1, SPX: 0.1, AAPL: 0.05, XOM: 0.03, BTC: 0.02 },
      "risk-on": { BTC: 0.25, AAPL: 0.25, SPX: 0.25, XOM: 0.15, GOLD: 0.05, TLT: 0.02, EURUSD: 0.03 },
      "equal-weight": { SPX: 1 / 7, AAPL: 1 / 7, XOM: 1 / 7, TLT: 1 / 7, EURUSD: 1 / 7, GOLD: 1 / 7, BTC: 1 / 7 },
      "concentrate-btc": { BTC: 0.5, SPX: 0.15, AAPL: 0.1, XOM: 0.08, TLT: 0.05, EURUSD: 0.07, GOLD: 0.05 },
      "concentrate-spx": { SPX: 0.6, AAPL: 0.12, XOM: 0.08, TLT: 0.08, EURUSD: 0.04, GOLD: 0.04, BTC: 0.04 },
    };
    setWeights(presetMap[preset]);
  };

  const reset = () => setWeights(baselineWeights);

  const weightSum = SYMBOLS.reduce((s, k) => s + (weights[k] || 0), 0);

  // Comparison chart data: baseline vs what-if VaR/ES
  const comparisonData = result
    ? [
        {
          label: "VaR",
          baseline: Math.round(baselineVar),
          whatif: Math.round(result.parametric.var),
          hist: Math.round(result.historical.var),
        },
        {
          label: "ES",
          baseline: Math.round(baselineEs),
          whatif: Math.round(result.parametric.es),
          hist: Math.round(result.historical.es),
        },
      ]
    : [];

  const delta = result?.delta;
  const deltaColor =
    delta?.direction === "lower"
      ? "text-emerald-500"
      : delta?.direction === "higher"
      ? "text-rose-500"
      : "text-muted-foreground";
  const DeltaIcon = delta?.direction === "lower" ? ArrowDown : delta?.direction === "higher" ? ArrowUp : RotateCcw;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sliders className="h-4 w-4 text-chart-5" />
              What-If Portfolio Simulator
            </CardTitle>
            <CardDescription>
              Drag weights to instantly see projected VaR / ES · live parametric + historical cross-check
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${deltaColor} border-current/30`}>
            <DeltaIcon className="h-3 w-3 mr-1" />
            {delta ? `${delta.direction} by ${fmtUSD(Math.abs(delta.varDelta))}` : "—"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">Presets:</span>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              className="h-7 text-[11px] px-2"
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </Button>
          ))}
          <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={reset}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>

        {/* Weight sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {SYMBOLS.map((sym) => {
            const w = weights[sym] || 0;
            const base = baselineWeights[sym] || 0;
            const diff = w - base;
            return (
              <div key={sym} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium font-mono">{sym}</span>
                    <span className="text-muted-foreground tabular-nums">{(w * 100).toFixed(1)}%</span>
                    {Math.abs(diff) > 0.001 && (
                      <span className={`text-[10px] tabular-nums ${diff > 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        ({diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}pp)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{fmtUSD(w * controls.totalValue)}</span>
                </div>
                <Slider
                  value={[Math.round(w * 1000)]}
                  min={0}
                  max={1000}
                  step={5}
                  onValueChange={(v) => setWeights((prev) => ({ ...prev, [sym]: v[0] / 1000 }))}
                  className="py-1"
                />
              </div>
            );
          })}
        </div>

        {/* Weight sum warning */}
        {Math.abs(weightSum - 1) > 0.005 && (
          <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-2.5 py-1.5">
            Weights sum to {(weightSum * 100).toFixed(1)}% — the simulator will renormalize to 100% on compute.
          </div>
        )}

        {/* Comparison chart */}
        {result && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>Baseline vs What-If</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-muted" /> Baseline
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-5" /> What-If (parametric)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-3" /> What-If (historical)
              </span>
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonData} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={50} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="baseline" name="Baseline" radius={[3, 3, 0, 0]} maxBarSize={36} fill="var(--muted)" fillOpacity={0.6} />
                  <Bar dataKey="whatif" name="What-If (param)" radius={[3, 3, 0, 0]} maxBarSize={36} fill="var(--chart-5)">
                    <LabelList dataKey="whatif" position="top" formatter={(v: number) => fmtUSD(v)} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                  <Bar dataKey="hist" name="What-If (hist)" radius={[3, 3, 0, 0]} maxBarSize={36} fill="var(--chart-3)" fillOpacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Stat cards */}
        {result && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="rounded-lg border bg-gradient-to-br from-chart-5/10 to-transparent p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">What-If VaR</div>
              <div className="text-lg font-bold tabular-nums text-chart-5">{fmtUSD(result.parametric.var)}</div>
              <div className="text-[10px] text-muted-foreground">{fmtPct(result.parametric.varPct)} of book</div>
            </div>
            <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-transparent p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">What-If ES</div>
              <div className="text-lg font-bold tabular-nums text-amber-500">{fmtUSD(result.parametric.es)}</div>
              <div className="text-[10px] text-muted-foreground">{fmtPct(result.parametric.esPct)} of book</div>
            </div>
            <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Historical VaR</div>
              <div className="text-lg font-bold tabular-nums text-chart-3">{fmtUSD(result.historical.var)}</div>
              <div className="text-[10px] text-muted-foreground">cross-check</div>
            </div>
            <div className={`rounded-lg border bg-gradient-to-br ${delta?.direction === "lower" ? "from-emerald-500/10" : delta?.direction === "higher" ? "from-rose-500/10" : "from-muted/10"} to-transparent p-2.5`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Δ VaR vs baseline</div>
              <div className={`text-lg font-bold tabular-nums ${deltaColor}`}>
                {delta && delta.varDelta >= 0 ? "+" : ""}{fmtUSD(delta?.varDelta || 0)}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {delta && (delta.varDeltaPct * 100).toFixed(1)}% change
              </div>
            </div>
          </div>
        )}

        {/* Marginal VaR strip */}
        {result && result.marginalVar.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              Marginal VaR — sensitivity to a 1% weight increase (per asset)
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {result.marginalVar.slice(0, 7).map((m) => (
                <div key={m.symbol} className="rounded-md border bg-muted/20 px-2 py-1 text-[10px]">
                  <span className="font-mono font-medium">{m.symbol}</span>{" "}
                  <span className="tabular-nums text-muted-foreground">
                    {m.marginalVar >= 0 ? "+" : ""}{fmtUSD(m.marginalVar)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoMode}
              onChange={(e) => setAutoMode(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-muted-foreground"
            />
            Auto-recompute (250ms debounce)
          </label>
          <Button size="sm" variant="default" onClick={runManual} disabled={loading || autoMode}>
            <Zap className="h-3.5 w-3.5 mr-1" />
            {loading ? "Computing…" : "Run What-If"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The simulator uses analytic parametric VaR for instant feedback (covariance matrix unchanged from the live market data) plus a historical-simulation cross-check by re-valuing your what-if weights under every historical return. <span className="font-medium text-foreground">Marginal VaR</span> = ∂VaR/∂w — the change in total VaR for a 1-unit (100%) increase in that asset's weight.
        </p>
      </CardContent>
    </Card>
  );
}
