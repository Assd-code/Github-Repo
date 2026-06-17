"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  Area,
  AreaChart,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
  Legend,
} from "recharts";
import { Waves, TrendingDown, Gauge, Clock } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtPct } from "@/lib/format";

interface AssetForecast {
  symbol: string;
  name: string;
  assetClass: string;
  currentVol: number;
  longRunVol: number;
  omega: number;
  alpha: number;
  beta: number;
  halfLife: number;
  persistence: number;
  volOfVol: number;
  volPercentile: number;
  regime: "calm" | "normal" | "elevated" | "stress";
  forecasts: { horizon: number; vol: number }[];
  volSeries: { date: string; vol: number }[];
}

interface VolData {
  assets: AssetForecast[];
  portfolioVolSeries: { date: string; vol: number }[];
  portfolioCurrentVol: number;
  portfolioLongRunVol: number;
  portfolioVolPercentile: number;
  portfolioRegime: "calm" | "normal" | "elevated" | "stress";
  portfolioTermStructure: { horizon: number; vol: number; label: string }[];
  assessment: "calm" | "normal" | "elevated" | "stress";
  summary: string;
  stressedAssets: string[];
}

const REGIME_STYLE: Record<string, { color: string; bg: string; ring: string; label: string }> = {
  calm: { color: "text-emerald-500", bg: "bg-emerald-500/10", ring: "border-emerald-500/30", label: "Calm" },
  normal: { color: "text-chart-3", bg: "bg-chart-3/10", ring: "border-chart-3/30", label: "Normal" },
  elevated: { color: "text-amber-500", bg: "bg-amber-500/10", ring: "border-amber-500/30", label: "Elevated" },
  stress: { color: "text-rose-500", bg: "bg-rose-500/10", ring: "border-rose-500/30", label: "Stress" },
};

const ASSET_COLORS: Record<string, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-3)",
  rate: "var(--chart-4)",
  crypto: "var(--chart-5)",
};

export function VolatilityRegimePanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<VolData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/volatility-regime?seed=${controls.seed}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.analysis);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.seed]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Waves className="h-4 w-4 text-chart-3" />
            Volatility Regime & GARCH Forecast
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Fitting GARCH(1,1)…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const pRegime = REGIME_STYLE[data.portfolioRegime];
  const assess = REGIME_STYLE[data.assessment];

  // Portfolio vol series for charting
  const portfolioVolData = data.portfolioVolSeries.map((p) => ({
    date: p.date,
    vol: p.vol,
    longRun: +(data.portfolioLongRunVol * 100).toFixed(2),
  }));

  // Term structure chart data
  const termStructureData = data.portfolioTermStructure.map((t) => ({
    label: t.label,
    vol: +(t.vol * 100).toFixed(2),
    longRun: +(data.portfolioLongRunVol * 100).toFixed(2),
  }));

  // Per-asset current vol bar chart
  const assetVolData = data.assets.map((a) => ({
    symbol: a.symbol,
    current: +(a.currentVol * 100).toFixed(1),
    longRun: +(a.longRunVol * 100).toFixed(1),
    percentile: Math.round(a.volPercentile),
    regime: a.regime,
    assetClass: a.assetClass,
  })).sort((a, b) => b.current - a.current);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Waves className="h-4 w-4 text-chart-3" />
              Volatility Regime & GARCH Forecast
            </CardTitle>
            <CardDescription>
              EWMA vol · GARCH(1,1) fit · forward vol forecast · regime classification
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${assess.color} ${assess.ring} ${assess.bg}`}>
            <Gauge className="h-3 w-3 mr-1" />
            {assess.label} ({data.portfolioVolPercentile.toFixed(0)}th %ile)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary banner */}
        <div className={`rounded-lg border ${assess.bg} ${assess.ring} px-3 py-2.5`}>
          <div className="text-[11px] text-muted-foreground leading-relaxed">{data.summary}</div>
          {data.stressedAssets.length > 0 && (
            <div className="text-[10px] text-rose-500 mt-1.5">
              ⚠ Assets under stress: {data.stressedAssets.join(", ")}
            </div>
          )}
        </div>

        {/* Portfolio vol stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current Vol</div>
            <div className={`text-lg font-bold tabular-nums ${pRegime.color}`}>
              {fmtPct(data.portfolioCurrentVol, 1)}
            </div>
            <div className="text-[10px] text-muted-foreground">annualized</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-muted/20 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Long-Run Vol</div>
            <div className="text-lg font-bold tabular-nums text-muted-foreground">
              {fmtPct(data.portfolioLongRunVol, 1)}
            </div>
            <div className="text-[10px] text-muted-foreground">GARCH unconditional</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-chart-2/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vol Percentile</div>
            <div className="text-lg font-bold tabular-nums text-chart-2">
              {data.portfolioVolPercentile.toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground">vs 252-day history</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Regime</div>
            <div className={`text-lg font-bold tabular-nums ${pRegime.color}`}>
              {pRegime.label}
            </div>
            <div className="text-[10px] text-muted-foreground">{data.stressedAssets.length} stressed</div>
          </div>
        </div>

        {/* Two-column: portfolio vol history + term structure */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Portfolio vol history with long-run reference */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-3 flex-wrap">
              <span>Portfolio EWMA vol (annualized)</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-chart-3" /> current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-muted-foreground" /> long-run
              </span>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={portfolioVolData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" minTickGap={40} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <ReferenceLine y={data.portfolioLongRunVol * 100} stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1} label={{ value: `long-run ${fmtPct(data.portfolioLongRunVol, 1)}`, position: "right", fontSize: 9, fill: "var(--muted-foreground)" }} />
                  <Area type="monotone" dataKey="vol" name="Vol" stroke="var(--chart-3)" strokeWidth={1.5} fill="url(#volGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Vol term structure (forward forecast) */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> Forward vol forecast (GARCH term structure)
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={termStructureData} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <ReferenceLine y={data.portfolioLongRunVol * 100} stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1} />
                  <Bar dataKey="vol" name="Forecast Vol" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {termStructureData.map((d, i) => {
                      // Color gradient: high vol = rose, low vol = emerald
                      const v = d.vol;
                      const max = Math.max(...termStructureData.map((t) => t.vol));
                      const ratio = v / max;
                      const color = ratio > 0.7 ? "var(--rose-500)" : ratio > 0.4 ? "var(--amber-500)" : "var(--emerald-500)";
                      return <Cell key={i} fill={color} />;
                    })}
                    <LabelList dataKey="vol" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-asset vol comparison: current vs long-run */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">
            Per-asset vol: current vs GARCH long-run (percentile shown)
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={assetVolData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="symbol" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                <Tooltip
                  formatter={(v: number, name) => name === "current" || name === "longRun" ? `${v}%` : v}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <Bar dataKey="longRun" name="longRun" fill="var(--muted)" fillOpacity={0.4} radius={[3, 3, 0, 0]} maxBarSize={20} />
                <Bar dataKey="current" name="current" radius={[3, 3, 0, 0]} maxBarSize={20}>
                  {assetVolData.map((d, i) => (
                    <Cell key={i} fill={REGIME_STYLE[d.regime].color.includes("emerald") ? "var(--emerald-500)" : REGIME_STYLE[d.regime].color.includes("amber") ? "var(--amber-500)" : REGIME_STYLE[d.regime].color.includes("rose") ? "var(--rose-500)" : "var(--chart-3)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* GARCH parameters table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Asset</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">α</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">β</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Persistence</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Half-life</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Vol-of-Vol</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">%ile</th>
                <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Regime</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.map((a) => {
                const reg = REGIME_STYLE[a.regime];
                return (
                  <tr key={a.symbol} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: ASSET_COLORS[a.assetClass] || "var(--chart-1)" }} />
                        <span className="font-medium">{a.symbol}</span>
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{a.alpha.toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{a.beta.toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{a.persistence.toFixed(3)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                      {Number.isFinite(a.halfLife) ? `${a.halfLife.toFixed(1)}d` : "∞"}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmtPct(a.volOfVol, 1)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{a.volPercentile.toFixed(0)}%</td>
                    <td className={`py-1.5 px-2 text-right ${reg.color} font-medium`}>{reg.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">GARCH(1,1)</span> models volatility clustering: σ²_t = ω + α·r²_{"{t-1}"} + β·σ²_{"{t-1}"}. <span className="font-medium text-foreground">Persistence</span> (α+β) near 1 means vol shocks are long-lasting; the <span className="font-medium text-foreground">half-life</span> is how many days for a vol shock to decay by half. The <span className="font-medium text-foreground">term structure</span> shows the forward vol forecast mean-reverting toward the long-run unconditional variance. <span className="font-medium text-foreground">Vol-of-vol</span> measures the volatility of volatility itself — a meta-risk measure.
        </p>
      </CardContent>
    </Card>
  );
}
