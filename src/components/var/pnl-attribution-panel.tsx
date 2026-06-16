"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { GitCompareArrows, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

const ZONE_STYLE = {
  green: { bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/40", label: "GREEN — IMA retained", Icon: CheckCircle2 },
  amber: { bg: "bg-amber-500/15", text: "text-amber-500", border: "border-amber-500/40", label: "AMBER — enhanced monitoring", Icon: AlertCircle },
  red: { bg: "bg-rose-500/15", text: "text-rose-500", border: "border-rose-500/40", label: "RED — lose IMA", Icon: XCircle },
};

export function PnlAttributionPanel({ report }: { report: FullReport }) {
  const pla = report.pnlAttribution;
  const z = ZONE_STYLE[pla.zone];

  const data = pla.points.map((p) => ({
    date: fmtDate(p.date),
    rtpl: p.riskTheoretical,
    hpl: p.hypothetical,
    residual: p.residual,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4 text-chart-2" />
              P&amp;L Attribution (FRTB PLA)
            </CardTitle>
            <CardDescription>
              Risk-theoretical vs. hypothetical P&amp;L over {pla.window} days — the desk&apos;s licence to use Internal Models
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${z.bg} ${z.text} ${z.border}`}>
            <z.Icon className="h-3 w-3 mr-1" />
            {z.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* PLA metrics */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Spearman ρ</div>
            <div className={`text-base font-bold tabular-nums ${pla.spearmanCorrelation >= 0.8 ? "text-emerald-500" : pla.spearmanCorrelation >= 0.7 ? "text-amber-500" : "text-rose-500"}`}>
              {pla.spearmanCorrelation.toFixed(4)}
            </div>
            <div className="text-[10px] text-muted-foreground">FRTB ≥ 0.80</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mean |residual|</div>
            <div className={`text-base font-bold tabular-nums ${pla.meanAbsResidualPct < 0.1 ? "text-emerald-500" : pla.meanAbsResidualPct < 0.2 ? "text-amber-500" : "text-rose-500"}`}>
              {fmtPct(pla.meanAbsResidualPct, 3)}
            </div>
            <div className="text-[10px] text-muted-foreground">FRTB &lt; 10%</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Test window</div>
            <div className="text-base font-bold tabular-nums">{pla.window}d</div>
            <div className="text-[10px] text-muted-foreground">rolling</div>
          </div>
        </div>

        {/* RTPL vs HPL chart */}
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={Math.floor(data.length / 5)} />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={54} />
              <Tooltip
                formatter={(v: number, name) => [fmtUSD(v), name === "rtpl" ? "Risk-theoretical P&L" : name === "hpl" ? "Hypothetical P&L" : "Residual"]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
              <ReferenceArea y1={0} y2={Infinity} fill="var(--chart-2)" fillOpacity={0.04} />
              <ReferenceArea y1={-Infinity} y2={0} fill="var(--chart-1)" fillOpacity={0.04} />
              <Line dataKey="rtpl" name="rtpl" stroke="var(--chart-3)" strokeWidth={1.5} dot={false} />
              <Line dataKey="hpl" name="hpl" stroke="var(--chart-2)" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Scatter dataKey="residual" name="residual" fill="var(--chart-5)" fillOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm bg-chart-3" /> Risk-theoretical P&L (RTPL)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-3 rounded-sm bg-chart-2 opacity-70" style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--chart-2) 0 4px, transparent 4px 8px)" }} /> Hypothetical P&L (HPL)</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-chart-5" /> residual</span>
        </div>

        <div className={`rounded-md border ${z.border} ${z.bg} px-3 py-2`}>
          <div className="text-xs font-semibold">{z.label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{pla.notes}</div>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          The P&amp;L Attribution test is FRTB&apos;s gatekeeper for the Internal Models Approach. RTPL uses only the desk&apos;s modeled risk factors; HPL uses full front-office revaluation. Large divergences signal that the risk model is missing material price drivers — and the desk is demoted to the Standardized Approach (higher capital, less flexibility).
        </p>
      </CardContent>
    </Card>
  );
}
