"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric (Variance-Covariance)",
  historical: "Historical Simulation",
  montecarlo: "Monte Carlo Simulation",
  filtered: "Filtered Historical Simulation",
  evt: "Extreme Value Theory (GPD)",
};

export function PnlDistribution({
  report,
  method,
}: {
  report: FullReport;
  method: Methodology;
}) {
  const r = report.results[method];
  const bins = r.distribution.bins;
  const varLine = -r.var;
  const esLine = -r.es;
  const meanLine = r.meanPnl;

  const maxCount = Math.max(...bins.map((b) => b.count));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">P&amp;L Distribution — {METHOD_LABEL[method]}</CardTitle>
            <CardDescription>
              {(report.market.windowDays).toLocaleString()}-day sample · {bins.length} bins · VaR & ES mark the loss tail
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                tickFormatter={(v) => fmtUSD(v)}
                interval={Math.floor(bins.length / 8)}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(v: number) => [`${v} outcomes`, "Count"]}
                labelFormatter={(v: number) => `P&L: ${fmtUSD(v)}`}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" maxBarSize={28}>
                {bins.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.x <= varLine
                        ? "var(--chart-1)"
                        : b.x <= 0
                        ? "var(--chart-5)"
                        : "var(--chart-2)"
                    }
                    fillOpacity={b.x <= varLine ? 0.9 : 0.55}
                  />
                ))}
              </Bar>
              <ReferenceLine
                x={varLine}
                stroke="var(--chart-1)"
                strokeWidth={2}
                strokeDasharray="5 3"
                label={{ value: `VaR ${fmtUSD(r.var)}`, position: "top", fill: "var(--chart-1)", fontSize: 11, fontWeight: 600 }}
              />
              <ReferenceLine
                x={esLine}
                stroke="var(--chart-4)"
                strokeWidth={1.5}
                strokeDasharray="2 2"
                label={{ value: `ES ${fmtUSD(r.es)}`, position: "top", fill: "var(--chart-4)", fontSize: 11 }}
              />
              <ReferenceLine x={meanLine} stroke="var(--muted-foreground)" strokeWidth={1} />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-3 text-xs">
          <Stat label="Mean P&L" value={fmtUSD(r.meanPnl)} tone={r.meanPnl >= 0 ? "pos" : "neg"} />
          <Stat label="Std Dev" value={fmtUSD(r.stdPnl)} />
          <Stat label="5th %ile" value={fmtUSD(r.p5)} tone="neg" />
          <Stat label="95th %ile" value={fmtUSD(r.p95)} tone="pos" />
          <Stat label="Worst" value={fmtUSD(r.worst)} tone="neg" />
          <Stat label="Best" value={fmtUSD(r.best)} tone="pos" />
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" /> tail beyond VaR</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-5)]" /> losses within VaR</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-2)]" /> gains</span>
          <span className="ml-auto">VaR {fmtPct(r.varPct)} · ES {fmtPct(r.esPct)} of book</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`font-semibold tabular-nums ${
          tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
