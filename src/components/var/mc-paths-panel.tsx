"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

export function McPathsPanel({
  report,
  method,
}: {
  report: FullReport;
  method: Methodology;
}) {
  const r = report.results.montecarlo;
  const paths = r.paths ?? [];

  if (method !== "montecarlo" || paths.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Monte Carlo Paths</CardTitle>
          <CardDescription className="text-muted-foreground">
            Select the <span className="font-medium text-foreground">Monte Carlo</span> methodology to visualize simulated portfolio value paths.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
            {paths.length === 0 && method === "montecarlo"
              ? "No path data available."
              : "Switch to Monte Carlo to view paths."}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Build chart data: each x = step index, y values = path values per sampled path.
  const horizon = report.results.montecarlo.horizon;
  const steps = horizon;
  const data: { step: number; [k: string]: number }[] = [];
  for (let h = 0; h <= steps; h++) {
    const row: { step: number; [k: string]: number } = { step: h };
    paths.forEach((p, i) => {
      const v = p.values[h] ?? p.values[p.values.length - 1] ?? 1;
      row[`p${i}`] = v;
    });
    data.push(row);
  }

  // percentile bands across paths at final step
  const finalVals = paths.map((p) => p.values[p.values.length - 1] ?? 1).sort((a, b) => a - b);
  const p1 = finalVals[Math.floor(finalVals.length * 0.01)] ?? 0;
  const p99 = finalVals[Math.floor(finalVals.length * 0.99)] ?? 0;
  const median = finalVals[Math.floor(finalVals.length * 0.5)] ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Monte Carlo Simulated Paths</CardTitle>
        <CardDescription>
          {paths.length} sampled paths of the portfolio value over {horizon} day{horizon > 1 ? "s" : ""}, correlated via Cholesky decomposition of the covariance matrix.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="step" tick={{ fontSize: 10 }} className="fill-muted-foreground" label={{ value: "Day", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--muted-foreground)" }} />
              <YAxis
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                width={56}
                domain={["auto", "auto"]}
                tickFormatter={(v) => fmtUSD(v * r.portfolioValue)}
              />
              <Tooltip
                labelFormatter={(v) => `Day ${v}`}
                formatter={(v: number) => fmtUSD(v * r.portfolioValue)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={1} stroke="var(--border)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "Initial", position: "right", fill: "var(--muted-foreground)", fontSize: 10 }} />
              {paths.map((_, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={`p${i}`}
                  stroke="var(--chart-3)"
                  strokeWidth={0.8}
                  strokeOpacity={0.25}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3 text-xs">
          <PathStat label="1st %ile" value={fmtUSD(p1 * r.portfolioValue)} tone="neg" />
          <PathStat label="Median" value={fmtUSD(median * r.portfolioValue)} />
          <PathStat label="99th %ile" value={fmtUSD(p99 * r.portfolioValue)} tone="pos" />
          <PathStat label="MC VaR" value={fmtUSD(r.var)} tone="neg" />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Each path is a joint simulation of all {report.market.assets.length} risk factors. The dispersion at the horizon directly produces the VaR quantile ({fmtPct(r.varPct)} of book).
        </p>
      </CardContent>
    </Card>
  );
}

function PathStat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : ""}`}>{value}</div>
    </div>
  );
}
