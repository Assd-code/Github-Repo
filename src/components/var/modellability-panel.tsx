"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ShieldCheck, ShieldAlert, ShieldX, Database, CheckCircle2, XCircle } from "lucide-react";
import type { ModellabilityReport, RiskFactorAssessment, AssetClass } from "@/lib/var/types";
import { fmtUSD } from "@/lib/format";

const ASSESSMENT_STYLE = {
  excellent: { color: "text-emerald-500", bg: "bg-emerald-500/15", border: "border-emerald-500/40", label: "EXCELLENT", desc: "All risk factors are modellable — full Internal Models Approach available." },
  good: { color: "text-chart-2", bg: "bg-chart-2/15", border: "border-chart-2/40", label: "GOOD", desc: "Most risk factors are modellable. Minor NMRF surcharges apply." },
  warning: { color: "text-amber-500", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "WARNING", desc: "Several non-modellable factors attract capital surcharges." },
  poor: { color: "text-rose-500", bg: "bg-rose-500/15", border: "border-rose-500/40", label: "POOR", desc: "Majority of factors non-modellable — standardized approach preferred." },
};

const CLASS_COLOR: Record<AssetClass, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-5)",
  rate: "var(--chart-3)",
  crypto: "var(--chart-4)",
};

export function ModellabilityPanel() {
  const [data, setData] = React.useState<ModellabilityReport | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    fetch("/api/var/modellability")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.report); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-chart-3" /> Risk Factor Modellability (FRTB NMRF)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] rounded-md bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const style = ASSESSMENT_STYLE[data.assessment];
  const modellablePct = data.modellablePct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4 text-chart-3" />
              Risk Factor Modellability (FRTB NMRF)
            </CardTitle>
            <CardDescription>
              FRTB MAR33: each risk factor needs ≥ 24 real-price observations / 12 months with ≤ 1-month gaps
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${style.bg} ${style.color} ${style.border}`}>
            {style.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-lg border bg-muted/30 px-2.5 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Factors</div>
            <div className="text-lg font-bold tabular-nums">{data.totalFactors}</div>
          </div>
          <div className="rounded-lg border bg-emerald-500/10 px-2.5 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Modellable</div>
            <div className="text-lg font-bold tabular-nums text-emerald-500">{data.modellableCount}</div>
          </div>
          <div className={`rounded-lg border px-2.5 py-2 text-center ${data.nonModellableCount > 0 ? "bg-rose-500/10" : "bg-muted/30"}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Non-Modellable</div>
            <div className={`text-lg font-bold tabular-nums ${data.nonModellableCount > 0 ? "text-rose-500" : ""}`}>{data.nonModellableCount}</div>
          </div>
          <div className={`rounded-lg border px-2.5 py-2 text-center ${data.totalNmrfSurcharge > 0 ? "bg-amber-500/10" : "bg-muted/30"}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">NMRF Surcharge</div>
            <div className={`text-lg font-bold tabular-nums ${data.totalNmrfSurcharge > 0 ? "text-amber-500" : ""}`}>{fmtUSD(data.totalNmrfSurcharge)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-muted-foreground">Modellable risk factors</span>
            <span className={`text-xs font-semibold tabular-nums ${style.color}`}>{modellablePct.toFixed(0)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${modellablePct}%`,
                background: modellablePct >= 80 ? "var(--chart-2)" : modellablePct >= 60 ? "var(--chart-5)" : "var(--chart-1)",
              }}
            />
          </div>
        </div>

        {/* Assessment note */}
        <div className={`rounded-md border ${style.border} ${style.bg} px-3 py-2`}>
          <div className="text-xs font-semibold">{style.label}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{style.desc}</div>
        </div>

        {/* Factors table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Risk Factor</TableHead>
                <TableHead className="h-8 text-xs">Class</TableHead>
                <TableHead className="h-8 text-xs text-right">Observations</TableHead>
                <TableHead className="h-8 text-xs text-right">Largest Gap</TableHead>
                <TableHead className="h-8 text-xs text-right">Liq. Horizon</TableHead>
                <TableHead className="h-8 text-xs">Status</TableHead>
                <TableHead className="h-8 text-xs text-right">NMRF Surcharge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.factors.map((f) => (
                <TableRow key={f.symbol}>
                  <TableCell className="py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[f.assetClass] }} />
                      <div className="flex flex-col">
                        <span className="font-semibold">{f.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">{f.name}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    <Badge variant="outline" className="text-[10px] h-5">{f.assetClass}</Badge>
                  </TableCell>
                  <TableCell className={`py-2 text-xs text-right tabular-nums ${f.observationCount >= 24 ? "text-emerald-500" : "text-rose-500"}`}>
                    {f.observationCount}
                  </TableCell>
                  <TableCell className={`py-2 text-xs text-right tabular-nums ${f.largestGap <= 21 ? "text-emerald-500" : "text-rose-500"}`}>
                    {f.largestGap}d
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{f.liquidityHorizon}d</TableCell>
                  <TableCell className="py-2 text-xs">
                    {f.modellable ? (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Modellable
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-rose-500" title={f.reason}>
                        <XCircle className="h-3.5 w-3.5" /> NMRF
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={`py-2 text-xs text-right tabular-nums ${f.nmrfSurcharge > 0 ? "text-amber-500 font-semibold" : "text-muted-foreground"}`}>
                    {f.nmrfSurcharge > 0 ? fmtUSD(f.nmrfSurcharge) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Under FRTB, a risk factor is &quot;modellable&quot; only if it has sufficient real-price observations (≥ 24 per year, no gap &gt; 1 month). Non-Modellable Risk Factors (NMRFs) cannot use the Internal Models Approach and attract a capital surcharge based on stressed expected shortfall. This assessment determines whether a desk can use IMA or must fall back to the Standardized Approach.
        </p>
      </CardContent>
    </Card>
  );
}
