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
  LabelList,
  ReferenceLine,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Landmark, Clock } from "lucide-react";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

export function LiquidityPanel({ report }: { report: FullReport }) {
  const l = report.liquidity;
  const data = l.horizons.map((h) => ({
    horizon: `${h.horizon}d`,
    es: Math.round(h.es),
    ratio: h.ratio,
    capital: Math.round(h.capital),
  }));

  const capitalPct = report.portfolio.totalValue > 0 ? l.regulatoryCapital / report.portfolio.totalValue : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4 text-chart-3" />
              Liquidity-Adjusted VaR (FRTB)
            </CardTitle>
            <CardDescription>
              97.5% Expected Shortfall scaled across 5 FRTB liquidity horizons (10/20/40/60/120 days)
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-chart-3 border-chart-3/40">
            <Clock className="h-3 w-3 mr-1" />
            FRTB MAR33
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aggregated ES</div>
            <div className="text-xl font-bold tabular-nums text-chart-3">{fmtUSD(l.aggregatedEs)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">liquidity-weighted combination</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-transparent p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Regulatory Capital</div>
            <div className="text-xl font-bold tabular-nums text-rose-500">{fmtUSD(l.regulatoryCapital)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{fmtPct(capitalPct, 1)} of book · 3.0× multiplier</div>
          </div>
        </div>

        <div className="h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="horizon" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={54} />
              <Tooltip
                formatter={(v: number) => fmtUSD(v)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={l.aggregatedEs} stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 3" label={{ value: `aggregated ${fmtUSD(l.aggregatedEs)}`, position: "top", fill: "var(--chart-3)", fontSize: 10 }} />
              <Bar dataKey="es" name="ES" radius={[4, 4, 0, 0]} maxBarSize={56}>
                {data.map((_, i) => (
                  <Cell key={i} fill="var(--chart-3)" fillOpacity={0.4 + i * 0.13} />
                ))}
                <LabelList dataKey="es" position="top" formatter={(v: number) => fmtUSD(v)} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-1.5">
          {l.horizons.map((h) => (
            <div key={h.horizon} className="flex items-center gap-3 text-xs rounded-md border bg-muted/20 px-2.5 py-1.5">
              <span className="font-mono font-semibold w-12">{h.horizon}d</span>
              <div className="flex-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-chart-3" style={{ width: `${Math.min(100, h.ratio * 28)}%` }} />
                </div>
                <span className="text-muted-foreground w-10 text-right">{h.ratio.toFixed(2)}×</span>
              </div>
              <span className="tabular-nums w-20 text-right font-medium">{fmtUSD(h.es)}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Risk cannot be unwound instantly. FRTB assigns each risk factor a liquidity horizon reflecting the time to exit. ES is scaled by √(horizon/10) and aggregated across horizons — longer-horizon risks (rates, crypto) attract proportionally more capital.
        </p>
      </CardContent>
    </Card>
  );
}
