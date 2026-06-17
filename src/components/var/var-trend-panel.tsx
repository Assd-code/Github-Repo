"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Activity, Zap, Layers } from "lucide-react";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric",
  historical: "Historical Sim",
  montecarlo: "Monte Carlo",
  filtered: "Filtered HS",
  evt: "EVT",
};

const METHOD_COLOR: Record<Methodology, string> = {
  parametric: "var(--chart-3)",
  historical: "var(--chart-1)",
  montecarlo: "var(--chart-2)",
  filtered: "var(--chart-5)",
  evt: "var(--chart-4)",
};

export function VarTrendPanel({
  report,
  method,
}: {
  report: FullReport;
  method: Methodology;
}) {
  const t = report.trend;
  const [showOverlay, setShowOverlay] = React.useState(false);
  const allMethods: Methodology[] = ["parametric", "historical", "montecarlo", "filtered", "evt"];
  const hasOverlay = t.points.some((p) => p.byMethod && Object.keys(p.byMethod).length > 1);

  const data = t.points.map((p) => ({
    date: fmtDate(p.date),
    var: p.var,
    pnl: p.pnl,
    exception: p.exception ? p.pnl : null,
    parametric: p.byMethod?.parametric,
    historical: p.byMethod?.historical,
    montecarlo: p.byMethod?.montecarlo,
    filtered: p.byMethod?.filtered,
    evt: p.byMethod?.evt,
  }));

  const procyclicalityRisk =
    t.stats.spikeDays > 15 ? "high" : t.stats.spikeDays > 5 ? "moderate" : "low";
  const procColor =
    procyclicalityRisk === "high" ? "text-rose-500" : procyclicalityRisk === "moderate" ? "text-amber-500" : "text-emerald-500";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-chart-2" />
              VaR Trend &amp; Procyclicality
            </CardTitle>
            <CardDescription>
              Rolling 250-day {METHOD_LABEL[method]} VaR vs. realized P&amp;L over {t.window} trading days
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasOverlay && (
              <Button
                variant={showOverlay ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowOverlay((v) => !v)}
              >
                <Layers className="h-3 w-3 mr-1" />
                {showOverlay ? "Hide" : "Show"} all methods
              </Button>
            )}
            <Badge variant="outline" className={procColor}>
              <Zap className="h-3 w-3 mr-1" />
              {procyclicalityRisk} procyclicality
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="varGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="pnlGradTrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.15} />
                  <stop offset="50%" stopColor="var(--chart-2)" stopOpacity={0} />
                  <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={Math.floor(data.length / 6)} />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={54} />
              <Tooltip
                formatter={(v: number, name) => [fmtUSD(v), name === "exception" ? "Exception P&L" : name === "var" ? "VaR limit" : "Realized P&L"]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
              <ReferenceLine y={t.stats.meanVar} stroke="var(--chart-4)" strokeWidth={1} strokeDasharray="2 4" label={{ value: `mean ${fmtUSD(t.stats.meanVar)}`, position: "right", fill: "var(--chart-4)", fontSize: 10 }} />
              <Area dataKey="var" name="var" stroke="var(--chart-1)" strokeWidth={1.5} fill="url(#varGrad)" />
              <Area dataKey="pnl" name="pnl" stroke="var(--chart-2)" strokeWidth={1} fill="url(#pnlGradTrend)" />
              <Scatter dataKey="exception" name="exception" fill="var(--chart-1)" fillOpacity={0.9} />
              {showOverlay && hasOverlay && allMethods
                .filter((m) => m !== method)
                .map((m) => (
                  <Line
                    key={m}
                    type="monotone"
                    dataKey={m}
                    name={m}
                    stroke={METHOD_COLOR[m]}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <TrendStat label="Current VaR" value={fmtUSD(t.stats.currentVar)} icon={<Activity className="h-3 w-3" />} />
          <TrendStat label="Mean VaR" value={fmtUSD(t.stats.meanVar)} />
          <TrendStat label="Max VaR" value={fmtUSD(t.stats.maxVar)} tone="neg" />
          <TrendStat label="Min VaR" value={fmtUSD(t.stats.minVar)} tone="pos" />
          <TrendStat label="VaR Volatility" value={fmtUSD(t.stats.varVolatility)} sub={`${fmtPct(t.stats.spikeDays / 100, 1)} spike days`} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Procyclicality risk: when VaR spikes during stress, forced deleveraging can amplify downturns. Regulators require counter-cyclical buffers (stressed VaR, long-horizon data). The shaded VaR area shows how quickly the model reacts to volatility regimes.
        </p>
      </CardContent>
    </Card>
  );
}

function TrendStat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: "pos" | "neg"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`font-semibold tabular-nums ${tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
