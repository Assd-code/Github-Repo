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
  ComposedChart,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, Crosshair, TrendingUp, Layers } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD, fmtPct } from "@/lib/format";

interface FactorSens {
  symbol: string;
  name: string;
  assetClass: string;
  weight: number;
  marketValue: number;
  deltaUp1pct: number;
  deltaDown1pct: number;
  dv01: number;
  gamma: number;
  asymmetry: number;
  varContribution: number;
  varContributionPct: number;
  vol: number;
  standaloneVar: number;
}

interface SensData {
  factors: FactorSens[];
  summary: {
    totalValue: number;
    grossExposure: number;
    netExposure: number;
    longExposure: number;
    shortExposure: number;
    parallelUp1pct: number;
    parallelDown1pct: number;
    parallelUp100bp: number;
    parallelDown100bp: number;
    netDelta: number;
    netGamma: number;
    mostSensitive: { symbol: string; dv01: number };
    topLong: { symbol: string; marketValue: number };
    topShort: { symbol: string; marketValue: number };
  };
  parallelShockCurve: { shockPct: number; pnl: number }[];
  heatmap: { factor: string; moves: { pct: number; pnl: number }[] }[];
}

const ASSET_COLORS: Record<string, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-3)",
  rate: "var(--chart-4)",
  crypto: "var(--chart-5)",
};

export function SensitivityPanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<SensData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/sensitivity?confidence=${controls.confidence}&horizon=${controls.horizon}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.sensitivity);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.confidence, controls.horizon, controls.seed, controls.totalValue, positionsStr]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-chart-1" />
            Risk Factor Sensitivity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Computing sensitivities…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const s = data.summary;

  // DV01 bar chart data (per factor, sorted by |dv01|)
  const dv01Data = data.factors.map((f) => ({
    symbol: f.symbol,
    dv01: Math.round(f.dv01),
    assetClass: f.assetClass,
  }));

  // Parallel shock curve
  const shockData = data.parallelShockCurve.map((p) => ({
    shock: p.shockPct,
    pnl: p.pnl,
  }));

  // Heatmap: per-factor P&L for ±5% shocks
  const heatmapData = data.heatmap.map((h) => {
    const row: Record<string, number | string> = { factor: h.factor };
    for (const m of h.moves) {
      row[`${m.pct}%`] = m.pnl;
    }
    return row;
  });
  const heatmapPcts = data.heatmap[0]?.moves.map((m) => `${m.pct}%`) || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-chart-1" />
              Risk Factor Sensitivity
            </CardTitle>
            <CardDescription>
              DV01 · ±1% shocks · parallel shift curve · factor decomposition
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-chart-1 border-chart-1/30 bg-chart-1/10">
            <Activity className="h-3 w-3 mr-1" />
            Net Delta {fmtUSD(s.netDelta)}/1%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-chart-1/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">DV01 (most sensitive)</div>
            <div className="text-lg font-bold tabular-nums text-chart-1">
              {fmtUSD(s.mostSensitive.dv01)}
            </div>
            <div className="text-[10px] text-muted-foreground">{s.mostSensitive.symbol} per +1bp</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-emerald-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Parallel +100bp</div>
            <div className="text-lg font-bold tabular-nums text-emerald-500">{fmtUSD(s.parallelUp100bp)}</div>
            <div className="text-[10px] text-muted-foreground">+1% market-wide</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Parallel -100bp</div>
            <div className="text-lg font-bold tabular-nums text-rose-500">{fmtUSD(s.parallelDown100bp)}</div>
            <div className="text-[10px] text-muted-foreground">-1% market-wide</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Gross / Net Exposure</div>
            <div className="text-lg font-bold tabular-nums text-chart-3">{fmtUSD(s.grossExposure)}</div>
            <div className="text-[10px] text-muted-foreground">net {fmtUSD(s.netExposure)}</div>
          </div>
        </div>

        {/* Two-column: parallel shock curve + DV01 per factor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Parallel shock curve */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Parallel shock curve (P&L for -5% to +5%)
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={shockData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="shockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                      <stop offset="50%" stopColor="var(--chart-1)" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="var(--rose-500)" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="shock" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={50} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    labelFormatter={(l) => `Shock: ${l}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                  <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                  <Area type="monotone" dataKey="pnl" name="P&L" stroke="var(--chart-1)" strokeWidth={2} fill="url(#shockGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* DV01 per factor */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3 w-3" /> DV01 per risk factor (P&L per +1bp)
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dv01Data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `$${v}`} width={40} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" />
                  <Bar dataKey="dv01" name="DV01" radius={[3, 3, 0, 0]} maxBarSize={36}>
                    {dv01Data.map((d, i) => (
                      <Cell key={i} fill={ASSET_COLORS[d.assetClass] || "var(--chart-1)"} />
                    ))}
                    <LabelList dataKey="dv01" position="top" formatter={(v: number) => `$${Math.round(v)}`} style={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-factor table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Factor</TableHead>
                <TableHead className="h-8 text-xs text-right">Weight</TableHead>
                <TableHead className="h-8 text-xs text-right">Mkt Value</TableHead>
                <TableHead className="h-8 text-xs text-right">DV01</TableHead>
                <TableHead className="h-8 text-xs text-right">+1% P&L</TableHead>
                <TableHead className="h-8 text-xs text-right">-1% P&L</TableHead>
                <TableHead className="h-8 text-xs text-right">Gamma</TableHead>
                <TableHead className="h-8 text-xs text-right">VaR Contrib</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.factors.map((f) => (
                <TableRow key={f.symbol} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: ASSET_COLORS[f.assetClass] || "var(--chart-1)" }} />
                      <span className="font-medium">{f.symbol}</span>
                      <span className="text-muted-foreground hidden sm:inline">{f.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{fmtPct(f.weight, 1)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{fmtUSD(f.marketValue)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-chart-1">{fmtUSD(f.dv01)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-emerald-500">{fmtUSD(f.deltaUp1pct)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-rose-500">{fmtUSD(f.deltaDown1pct)}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums text-muted-foreground">
                    {Math.abs(f.gamma) > 0.01 ? fmtUSD(f.gamma) : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">
                    <span className="font-medium">{fmtPct(f.varContributionPct, 1)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">DV01</span> is the P&L impact of a 1 basis point (0.01%) move in the factor — the standard interest-rate sensitivity measure. <span className="font-medium text-foreground">Gamma</span> measures convexity: positive for long options (benefit from moves either direction), near-zero for linear positions. The <span className="font-medium text-foreground">parallel shock curve</span> shows total book P&L across a synchronized ±5% market move — the slope is the net delta, any curvature is net gamma.
        </p>
      </CardContent>
    </Card>
  );
}
