"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
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
import { AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";
import type { FullReport, AssetClass } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const CLASS_COLOR: Record<AssetClass, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-5)",
  rate: "var(--chart-3)",
  crypto: "var(--chart-4)",
};

export function ReverseStressPanel({ report }: { report: FullReport }) {
  const [targetPct, setTargetPct] = React.useState(20);

  // The reverse stress is computed server-side at 20% — we interpolate the
  // shock factor linearly for the slider (the relationship is near-linear
  // for moderate losses). This keeps the interaction client-side & instant.
  const rs = report.reverseStress;
  const baseTarget = rs.targetLossPct * 100;
  const baseShock = rs.shockFactor;
  // Linear scaling from origin: shockFactor(t) ≈ 1 + (baseShock-1) * (t/baseTarget)
  const scaledShock = 1 + (baseShock - 1) * (targetPct / baseTarget);
  const scaledLoss = -targetPct * report.portfolio.totalValue / 100;
  const equityDrop = Math.max(0, (1 - scaledShock) * 100);

  const chartData = rs.perAssetClass
    .map((a) => ({
      assetClass: a.assetClass,
      shock: Math.round(a.shock * (targetPct / baseTarget) * 1000) / 10,
      pnl: Math.round(a.pnl * (targetPct / baseTarget)),
    }))
    .sort((a, b) => a.pnl - b.pnl);

  const worseThanLehman = equityDrop > 32;
  const worseThanCovid = equityDrop > 34;
  const ruinFloor = rs.marginToRuin >= 1;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertOctagon className="h-4 w-4 text-rose-500" />
              Reverse Stress Testing
            </CardTitle>
            <CardDescription>
              What shock magnitude would break the book? Drag the target loss to find the breaking scenario.
            </CardDescription>
          </div>
          <Badge variant="outline" className={ruinFloor ? "border-emerald-500/40 text-emerald-500" : "border-rose-500/40 text-rose-500"}>
            {ruinFloor ? <ShieldCheck className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
            {ruinFloor ? "ruin unreachable" : `margin to ruin ${fmtPct(rs.marginToRuin, 1)}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Target loss slider */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Target portfolio loss</span>
            <span className="text-lg font-bold tabular-nums text-rose-500">
              −{targetPct}% <span className="text-xs text-muted-foreground font-normal">({fmtUSD(scaledLoss)})</span>
            </span>
          </div>
          <Slider
            value={[targetPct]}
            onValueChange={(v) => setTargetPct(v[0])}
            min={5}
            max={80}
            step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>5%</span><span>20%</span><span>40%</span><span>60%</span><span>80%</span>
          </div>
        </div>

        {/* Shock summary */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Equity drop needed</div>
            <div className="text-base font-bold tabular-nums text-rose-500">−{equityDrop.toFixed(1)}%</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs Lehman (−32%)</div>
            <div className={`text-base font-bold tabular-nums ${worseThanLehman ? "text-rose-500" : "text-emerald-500"}`}>
              {worseThanLehman ? "worse" : "milder"}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">vs COVID (−34%)</div>
            <div className={`text-base font-bold tabular-nums ${worseThanCovid ? "text-rose-500" : "text-emerald-500"}`}>
              {worseThanCovid ? "worse" : "milder"}
            </div>
          </div>
        </div>

        {/* Per-asset-class shock chart */}
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} unit="%" />
              <YAxis type="category" dataKey="assetClass" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={72} />
              <Tooltip
                formatter={(v: number, name) => name === "pnl" ? [fmtUSD(v), "P&L"] : [`${v}%`, "Shock"]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
              <Bar dataKey="shock" name="shock" radius={[0, 3, 3, 0]} maxBarSize={18}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={CLASS_COLOR[d.assetClass as AssetClass] ?? "var(--chart-1)"} />
                ))}
                <LabelList dataKey="shock" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-md border bg-gradient-to-br from-rose-500/10 to-transparent px-3 py-2">
          <div className="text-xs font-semibold text-rose-500">Scenario probability</div>
          <div className="text-sm font-medium mt-0.5">{rs.comparison.probability}</div>
          {ruinFloor && (
            <div className="text-[11px] text-emerald-600 mt-1.5 flex items-start gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>The portfolio&apos;s Treasury allocation (flight-to-safety hedge) floors the book: even extreme uniform stress cannot fully wipe it out under this shock model.</span>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Reverse stress testing asks the inverse question: rather than estimating loss for a given scenario, it finds the scenario that produces an unacceptable loss. Regulators require it to ensure management understands what could break the firm.
        </p>
      </CardContent>
    </Card>
  );
}
