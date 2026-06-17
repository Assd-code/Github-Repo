"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PieChart, TrendingDown, Layers, Gauge } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD, fmtPct } from "@/lib/format";

interface AssetRow {
  symbol: string;
  name: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  hhiContribution: number;
  hhiShare: number;
  standaloneVar: number;
  componentVar: number;
}

interface ConcentrationData {
  totalValue: number;
  positionCount: number;
  hhi: number;
  hhiScaled: number;
  effectiveN: number;
  classification: "low" | "moderate" | "high" | "extreme";
  top1: number;
  top3: number;
  top5: number;
  gini: number;
  diversificationRatio: number;
  diversificationBenefit: number;
  perAsset: AssetRow[];
  lorenz: { x: number; y: number }[];
}

const CLASSIFICATION_STYLE: Record<
  ConcentrationData["classification"],
  { label: string; color: string; bg: string; ring: string }
> = {
  low: {
    label: "Low Concentration",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    ring: "border-emerald-500/30",
  },
  moderate: {
    label: "Moderate Concentration",
    color: "text-chart-3",
    bg: "bg-chart-3/10",
    ring: "border-chart-3/30",
  },
  high: {
    label: "High Concentration",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    ring: "border-amber-500/30",
  },
  extreme: {
    label: "Extreme Concentration",
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    ring: "border-rose-500/30",
  },
};

const ASSET_COLORS: Record<string, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-3)",
  rate: "var(--chart-4)",
  crypto: "var(--chart-5)",
};

export function ConcentrationPanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<ConcentrationData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/concentration?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.concentration);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.confidence, controls.horizon, controls.method, controls.seed, controls.totalValue, positionsStr]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-chart-4" />
            Concentration Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4 text-chart-4" />
            Concentration Risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-rose-500">{error || "No data"}</div>
        </CardContent>
      </Card>
    );
  }

  const cls = CLASSIFICATION_STYLE[data.classification];

  // Bar chart of per-asset weight
  const weightData = data.perAsset
    .map((a) => ({
      symbol: a.symbol,
      weight: +(a.weight * 100).toFixed(2),
      hhi: +(a.hhiContribution * 10000).toFixed(1),
      assetClass: a.assetClass,
    }))
    .sort((a, b) => b.weight - a.weight);

  // Lorenz curve data with the equality reference
  const lorenzData = data.lorenz.map((p) => ({ x: +(p.x * 100).toFixed(1), y: +(p.y * 100).toFixed(1) }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="h-4 w-4 text-chart-4" />
              Concentration Risk Analysis
            </CardTitle>
            <CardDescription>
              HHI · effective number of positions · diversification ratio · Lorenz curve
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${cls.color} ${cls.ring}`}>
            {cls.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-4/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">HHI</div>
            <div className="text-lg font-bold tabular-nums text-chart-4">
              {data.hhiScaled.toFixed(0)}
            </div>
            <div className="text-[10px] text-muted-foreground">/ 10,000 scale</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Effective N</div>
            <div className="text-lg font-bold tabular-nums text-chart-3">
              {data.effectiveN.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">of {data.positionCount} positions</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Diversification Ratio</div>
            <div className="text-lg font-bold tabular-nums text-emerald-500">
              {data.diversificationRatio.toFixed(2)}×
            </div>
            <div className="text-[10px] text-muted-foreground">{fmtPct(data.diversificationBenefit, 1)} benefit</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gini Coefficient</div>
            <div className="text-lg font-bold tabular-nums text-amber-500">
              {data.gini.toFixed(3)}
            </div>
            <div className="text-[10px] text-muted-foreground">0=equal, 1=concentrated</div>
          </div>
        </div>

        {/* Top-N concentration strip */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            { label: "Top 1", value: data.top1, icon: Layers },
            { label: "Top 3", value: data.top3, icon: TrendingDown },
            { label: "Top 5", value: data.top5, icon: Gauge },
          ].map((row) => (
            <div key={row.label} className="rounded-md border bg-muted/20 px-2.5 py-1.5 flex items-center gap-2">
              <row.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{row.label}</span>
              <span className="ml-auto font-semibold tabular-nums">{fmtPct(row.value, 1)}</span>
            </div>
          ))}
        </div>

        {/* Two-column chart: weight bars + Lorenz curve */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Weight per asset */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Per-asset weight & HHI contribution</div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weightData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="weight" name="Weight %" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {weightData.map((d, i) => (
                      <Cell key={i} fill={ASSET_COLORS[d.assetClass] || "var(--chart-1)"} />
                    ))}
                    <LabelList dataKey="weight" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Lorenz curve */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">Lorenz curve (equality vs concentration)</div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lorenzData} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="x"
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    label={{ value: "Cumulative positions %", position: "insideBottom", offset: -2, fontSize: 9, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 10 }}
                    className="fill-muted-foreground"
                    tickFormatter={(v) => `${v}%`}
                    width={36}
                  />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 3"
                    strokeWidth={1}
                  />
                  <Line
                    type="monotone"
                    dataKey="y"
                    name="Cumulative weight %"
                    stroke="var(--chart-4)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-asset table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Asset</TableHead>
                <TableHead className="h-8 text-xs text-right">Weight</TableHead>
                <TableHead className="h-8 text-xs text-right">Mkt Value</TableHead>
                <TableHead className="h-8 text-xs text-right">HHI Contrib</TableHead>
                <TableHead className="h-8 text-xs text-right">Standalone VaR</TableHead>
                <TableHead className="h-8 text-xs text-right">Component VaR</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.perAsset.map((a) => (
                <TableRow key={a.symbol}>
                  <TableCell className="py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: ASSET_COLORS[a.assetClass] || "var(--chart-1)" }}
                      />
                      <span className="font-medium">{a.symbol}</span>
                      <span className="text-muted-foreground">{a.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{fmtPct(a.weight, 1)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{fmtUSD(a.marketValue)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-chart-4">
                    {(a.hhiContribution * 10000).toFixed(1)}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-amber-500">
                    {fmtUSD(a.standaloneVar)}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-rose-500">
                    {fmtUSD(a.componentVar)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          HHI sums squared weights (1/<span className="font-medium text-foreground">N</span> for an equally-weighted book, 1 for a single name). The <span className="font-medium text-foreground">diversification ratio</span> measures how much risk is reduced by combining assets — a ratio of 2× means the diversified book has half the VaR of the sum of standalone VaRs. The Lorenz curve shows inequality: the further below the diagonal, the more concentrated the book.
        </p>
      </CardContent>
    </Card>
  );
}
