"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "recharts";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const ASSET_CLASS_COLOR: Record<string, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-5)",
  rate: "var(--chart-3)",
  crypto: "var(--chart-4)",
};

export function DecompositionPanel({ report }: { report: FullReport }) {
  const d = report.decomposition;
  const chartData = [...d.perAsset]
    .sort((a, b) => b.componentVar - a.componentVar)
    .map((a) => ({
      symbol: a.symbol,
      componentVar: Math.round(a.componentVar),
      incrementalVar: Math.round(a.incrementalVar),
      standaloneVar: Math.round(a.standaloneVar),
      assetClass: report.portfolio.positions.find((p) => p.symbol === a.symbol)?.assetClass ?? "equity",
    }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Risk Decomposition</CardTitle>
        <CardDescription>
          Marginal · Component · Incremental · Standalone VaR per position — what actually drives the book&apos;s risk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[230px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} />
              <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={56} />
              <Tooltip
                formatter={(v: number) => fmtUSD(v)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine x={0} stroke="var(--border)" />
              <Bar dataKey="componentVar" name="Component VaR" radius={[0, 3, 3, 0]} maxBarSize={22}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={ASSET_CLASS_COLOR[d.assetClass] ?? "var(--chart-1)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          {Object.entries(ASSET_CLASS_COLOR).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: v }} /> {k}
            </span>
          ))}
          <span className="ml-auto">
            Σ component VaR = <span className="font-semibold text-foreground">{fmtUSD(d.perAsset.reduce((a, b) => a + b.componentVar, 0))}</span> (parametric total)
          </span>
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-xs">Position</TableHead>
              <TableHead className="h-8 text-xs text-right">Weight</TableHead>
              <TableHead className="h-8 text-xs text-right">Marginal VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">Component VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">Share</TableHead>
              <TableHead className="h-8 text-xs text-right">Incremental VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">Standalone VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">Component ES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.perAsset
              .slice()
              .sort((a, b) => b.componentVar - a.componentVar)
              .map((a) => (
                <TableRow key={a.symbol}>
                  <TableCell className="py-2 text-xs font-medium">
                    <div className="flex flex-col">
                      <span>{a.symbol}</span>
                      <span className="text-[10px] text-muted-foreground">{a.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtPct(a.weight, 1)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtUSD(a.marginalVar)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums font-medium">{fmtUSD(a.componentVar)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtPct(a.componentShare, 1)}</TableCell>
                  <TableCell className={`py-2 text-xs text-right tabular-nums ${a.incrementalVar < 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    {fmtUSD(a.incrementalVar)}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-muted-foreground">{fmtUSD(a.standaloneVar)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{a.componentEs !== undefined ? fmtUSD(a.componentEs) : "—"}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Marginal VaR</span> = ∂VaR/∂wᵢ (sensitivity of total risk to a small weight increase).{" "}
          <span className="font-medium text-foreground">Component VaR</span> = wᵢ × marginal (sums to total VaR).{" "}
          <span className="font-medium text-foreground">Incremental VaR</span> = VaR(full) − VaR(without asset, rescaled) — negative values mark diversifiers.{" "}
          <span className="font-medium text-foreground">Standalone VaR</span> = the asset held alone at its market value.{" "}
          <span className="font-medium text-foreground">Component ES</span> = the position&apos;s average loss in the portfolio&apos;s historical tail scenarios (sums to historical ES
          {d.totalEs !== undefined ? <> of {fmtUSD(d.totalEs)}</> : null}).
        </p>
      </CardContent>
    </Card>
  );
}
