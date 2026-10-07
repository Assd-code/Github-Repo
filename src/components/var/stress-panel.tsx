"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  LabelList,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, CheckCircle2 } from "lucide-react";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

export function StressPanel({ report }: { report: FullReport }) {
  const varRef = report.results.historical.var;
  const data = report.stress
    .map((s) => ({
      name: s.scenario.name,
      shortName: s.scenario.name.length > 22 ? s.scenario.name.slice(0, 20) + "…" : s.scenario.name,
      pnl: Math.round(s.pnl),
      type: s.scenario.type,
      breaches: s.breachesVar,
    }))
    .sort((a, b) => a.pnl - b.pnl);

  const breachCount = report.stress.filter((s) => s.breachesVar).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Stress Testing &amp; Scenario Analysis</CardTitle>
            <CardDescription>
              P&amp;L under historical crises &amp; hypothetical shocks vs. the 99% VaR limit of {fmtUSD(varRef)}.
            </CardDescription>
          </div>
          <Badge variant="outline" className={breachCount > report.stress.length / 2 ? "border-rose-500/40 text-rose-500" : "border-amber-500/40 text-amber-500"}>
            {breachCount}/{report.stress.length} breach VaR
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10 }} className="fill-muted-foreground" width={118} />
              <Tooltip
                formatter={(v: number) => fmtUSD(v)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine x={-varRef} stroke="var(--chart-1)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: "−VaR", position: "top", fill: "var(--chart-1)", fontSize: 10 }} />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
              <Bar dataKey="pnl" name="P&L" radius={[0, 3, 3, 0]} maxBarSize={20}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.pnl < -varRef ? "var(--chart-1)" : d.pnl < 0 ? "var(--chart-5)" : "var(--chart-2)"} />
                ))}
                <LabelList
                  dataKey="pnl"
                  position="right"
                  formatter={(v: number) => fmtUSD(v)}
                  style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {report.stressedVar && (
          <div className="rounded-md border bg-muted/20 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">Stressed VaR (worst {report.stressedVar.windowDays}-day window)</span>
              <span className="text-xs font-semibold tabular-nums text-rose-500">
                {fmtUSD(report.stressedVar.var)} · {report.stressedVar.ratio.toFixed(2)}× current
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Historical VaR of today&apos;s book calibrated to {fmtDate(report.stressedVar.windowStart)} – {fmtDate(report.stressedVar.windowEnd)}.
              Current-window VaR {fmtUSD(report.stressedVar.currentVar)}; stressed ES {fmtUSD(report.stressedVar.es)}.
            </div>
          </div>
        )}
        <div className="space-y-2">
          {report.stress.map((s) => (
            <div key={s.scenario.id} className="flex items-start gap-3 rounded-md border bg-muted/20 px-3 py-2">
              <div className="mt-0.5">
                {s.breachesVar ? (
                  <AlertOctagon className="h-4 w-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{s.scenario.name}</span>
                  <span className={`text-xs font-semibold tabular-nums ${s.pnl < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {fmtUSD(s.pnl)} ({fmtPct(s.pnlPct)})
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{s.scenario.description}</div>
                {s.breachesVar && (
                  <div className="text-[10px] text-rose-500 mt-1">
                    Breaches VaR by {fmtUSD(Math.abs(s.pnl) - varRef)} · worst contributor: {s.worstContributor.symbol}
                  </div>
                )}
              </div>
              <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                {s.scenario.type}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
