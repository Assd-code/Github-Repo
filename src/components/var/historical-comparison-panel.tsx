"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LabelList,
} from "recharts";
import { Gauge, History } from "lucide-react";
import type { HistoricalVarComparison } from "@/lib/var/types";
import { fmtUSD } from "@/lib/format";

const REGIME_STYLE = {
  low: { color: "text-emerald-500", bg: "bg-emerald-500/15", border: "border-emerald-500/40", label: "LOW — risk well below typical" },
  normal: { color: "text-chart-2", bg: "bg-chart-2/15", border: "border-chart-2/40", label: "NORMAL — within typical range" },
  elevated: { color: "text-amber-500", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "ELEVATED — approaching high-risk regime" },
  high: { color: "text-rose-500", bg: "bg-rose-500/15", border: "border-rose-500/40", label: "HIGH — crisis-level risk estimate" },
};

export function HistoricalComparisonPanel() {
  const [data, setData] = React.useState<HistoricalVarComparison | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    fetch("/api/var/historical-comparison?method=historical&confidence=0.99")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.comparison); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4 text-chart-5" /> Historical VaR Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] rounded-md bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const regime = REGIME_STYLE[data.regime];
  const histData = data.histogram.map((h) => ({
    x: h.x,
    count: h.count,
    fill: h.isCurrent ? "var(--chart-1)" : "var(--chart-3)",
    opacity: h.isCurrent ? 1 : 0.5,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-chart-5" />
              Historical VaR Comparison
            </CardTitle>
            <CardDescription>
              Where does today&apos;s VaR sit vs. the 150-day rolling distribution?
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${regime.bg} ${regime.color} ${regime.border}`}>
            <Gauge className="h-3 w-3 mr-1" />
            {data.regime.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current VaR + percentile */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-5/10 to-transparent p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Today&apos;s VaR</div>
            <div className="text-xl font-bold tabular-nums text-chart-5">{fmtUSD(data.currentVar)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{(data.confidence * 100).toFixed(0)}% · {data.methodology}</div>
          </div>
          <div className={`rounded-lg border ${regime.border} ${regime.bg} p-3`}>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Percentile Rank</div>
            <div className={`text-xl font-bold tabular-nums ${regime.color}`}>{data.currentPercentile.toFixed(0)}th</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{regime.label}</div>
          </div>
        </div>

        {/* Histogram */}
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="x" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} interval={Math.floor(histData.length / 5)} />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" width={36} />
              <Tooltip
                formatter={(v: number) => [`${v} days`, "Count"]}
                labelFormatter={(v: number) => `VaR ≈ ${fmtUSD(v)}`}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine x={data.currentVar} stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 3"
                label={{ value: "today", position: "top", fill: "var(--chart-1)", fontSize: 10, fontWeight: 600 }} />
              <Bar dataKey="count" name="days" radius={[3, 3, 0, 0]} maxBarSize={32}>
                {histData.map((d, i) => (
                  <Cell key={i} fill={d.fill} fillOpacity={d.opacity} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribution stats */}
        <div className="grid grid-cols-4 gap-2">
          <Stat label="P5" value={fmtUSD(data.stats.p5)} sub="quiet regime" />
          <Stat label="Median" value={fmtUSD(data.stats.median)} sub="typical" />
          <Stat label="P95" value={fmtUSD(data.stats.p95)} sub="stress regime" />
          <Stat label="Std Dev" value={fmtUSD(data.stats.std)} sub="VaR volatility" />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          A VaR in the low percentile (below 25th) may signal complacency and under-pricing of risk. A high percentile (above 90th) indicates the model is in crisis territory — either markets are genuinely stressed or the model is over-conservative. The histogram highlights where today&apos;s estimate falls within its own recent history.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}
