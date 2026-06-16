"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from "recharts";
import { TrendingUp, Award, Activity, TrendingDown } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

interface PerfData {
  days: number;
  annualReturn: number;
  annualVol: number;
  downsideDev: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  calmar: number;
  informationRatio: number;
  trackingError: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestDay: number;
  worstDay: number;
  upDays: number;
  downDays: number;
  cumulative: { date: string; pnl: number; drawdown: number }[];
  benchmarkCumulative: { date: string; pnl: number }[];
}

function ratingBadge(value: number, thresholds: [number, number, number], labels: ["poor", "fair", "good", "excellent"]): { label: string; color: string; bg: string; ring: string } {
  let i: number;
  if (value < thresholds[0]) i = 0;
  else if (value < thresholds[1]) i = 1;
  else if (value < thresholds[2]) i = 2;
  else i = 3;
  const colors = ["text-rose-500", "text-amber-500", "text-chart-3", "text-emerald-500"];
  const bgs = ["bg-rose-500/10", "bg-amber-500/10", "bg-chart-3/10", "bg-emerald-500/10"];
  const rings = ["border-rose-500/30", "border-amber-500/30", "border-chart-3/30", "border-emerald-500/30"];
  return { label: labels[i], color: colors[i], bg: bgs[i], ring: rings[i] };
}

export function PerformancePanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<PerfData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/performance?seed=${controls.seed}&method=${controls.method}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.performance);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.seed, controls.method, controls.totalValue, positionsStr]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-chart-2" />
            Risk-Adjusted Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-chart-2" />
            Risk-Adjusted Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-rose-500">{error || "No data"}</div>
        </CardContent>
      </Card>
    );
  }

  // Chart data: cumulative P&L + benchmark + drawdown (sampled every 4 days for perf)
  const sampleStep = Math.max(1, Math.floor(data.cumulative.length / 120));
  const chartData = data.cumulative
    .filter((_, i) => i % sampleStep === 0 || i === data.cumulative.length - 1)
    .map((p, i) => ({
      date: fmtDate(p.date),
      pnl: Math.round(p.pnl),
      benchmark: Math.round(data.benchmarkCumulative.filter((_, j) => j % sampleStep === 0)[i]?.pnl || 0),
      drawdown: Math.round(p.drawdown),
    }));

  const sharpeBadge = ratingBadge(data.sharpe, [0, 1, 2], ["poor", "fair", "good", "excellent"]);
  const sortinoBadge = ratingBadge(data.sortino, [0, 1.5, 3], ["poor", "fair", "good", "excellent"]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-chart-2" />
              Risk-Adjusted Performance
            </CardTitle>
            <CardDescription>
              {data.days}-day historical track · Sharpe · Sortino · Calmar · max drawdown · win rate
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${sharpeBadge.color} ${sharpeBadge.ring}`}>
            Sharpe: {sharpeBadge.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-2/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Annual Return</div>
            <div className={`text-lg font-bold tabular-nums ${data.annualReturn >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
              {fmtPct(data.annualReturn, 1)}
            </div>
            <div className="text-[10px] text-muted-foreground">vol {fmtPct(data.annualVol, 1)}</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sharpe</div>
            <div className="text-lg font-bold tabular-nums text-emerald-500">{data.sharpe.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">rf 2.0%</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sortino</div>
            <div className="text-lg font-bold tabular-nums text-chart-3">{data.sortino.toFixed(2)}</div>
            <div className="text-[10px] text-muted-foreground">downside-only</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Max Drawdown</div>
            <div className="text-lg font-bold tabular-nums text-rose-500">{fmtPct(data.maxDrawdown, 1)}</div>
            <div className="text-[10px] text-muted-foreground">Calmar {data.calmar.toFixed(2)}</div>
          </div>
        </div>

        {/* Secondary metrics strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Information Ratio</div>
            <div className="font-semibold tabular-nums">{data.informationRatio.toFixed(2)}</div>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Tracking Error</div>
            <div className="font-semibold tabular-nums">{fmtPct(data.trackingError, 1)}</div>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Win Rate</div>
            <div className="font-semibold tabular-nums">{fmtPct(data.winRate, 1)}</div>
          </div>
          <div className="rounded-md border bg-muted/20 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Profit Factor</div>
            <div className="font-semibold tabular-nums">
              {Number.isFinite(data.profitFactor) ? data.profitFactor.toFixed(2) : "∞"}
            </div>
          </div>
        </div>

        {/* Cumulative P&L vs benchmark */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-chart-2" /> Cumulative P&L vs benchmark (equal-weighted)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-chart-2" /> Portfolio
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-muted-foreground/50" /> Benchmark
            </span>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={50} />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                <Area type="monotone" dataKey="benchmark" name="Benchmark" stroke="var(--muted-foreground)" strokeWidth={1} strokeDasharray="3 2" fill="none" />
                <Area type="monotone" dataKey="pnl" name="Portfolio" stroke="var(--chart-2)" strokeWidth={2} fill="url(#pnlGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Drawdown chart */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-rose-500" /> Drawdown series (peak-to-trough)
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--rose-500)" stopOpacity={0} />
                    <stop offset="100%" stopColor="var(--rose-500)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={50} />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                <Area type="monotone" dataKey="drawdown" name="Drawdown" stroke="var(--rose-500)" strokeWidth={1.5} fill="url(#ddGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-md border bg-emerald-500/5 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Avg Win</div>
            <div className="font-semibold tabular-nums text-emerald-500">{fmtUSD(data.avgWin)}</div>
          </div>
          <div className="rounded-md border bg-rose-500/5 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Avg Loss</div>
            <div className="font-semibold tabular-nums text-rose-500">{fmtUSD(data.avgLoss)}</div>
          </div>
          <div className="rounded-md border bg-emerald-500/5 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Best Day</div>
            <div className="font-semibold tabular-nums text-emerald-500">{fmtUSD(data.bestDay)}</div>
          </div>
          <div className="rounded-md border bg-rose-500/5 px-2.5 py-1.5">
            <div className="text-muted-foreground text-[10px]">Worst Day</div>
            <div className="font-semibold tabular-nums text-rose-500">{fmtUSD(data.worstDay)}</div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Sharpe</span> rewards return per unit of total volatility; <span className="font-medium text-foreground">Sortino</span> only penalizes downside deviation (favours strategies with rare, small losses). <span className="font-medium text-foreground">Calmar</span> = annual return / max drawdown, the preferred ratio for asymmetric return profiles. <span className="font-medium text-foreground">Information ratio</span> measures active return vs an equal-weighted benchmark per unit of tracking error.
        </p>
      </CardContent>
    </Card>
  );
}
