"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LineChart, Line, Legend,
} from "recharts";
import { Sigma, TrendingDown } from "lucide-react";
import type { DerivativesAnalysis } from "@/lib/var/types";
import { fmtUSD, fmtNum } from "@/lib/format";

const METHOD_COLOR = {
  deltaOnly: "var(--chart-3)",
  deltaGamma: "var(--chart-2)",
  fullReval: "var(--chart-1)",
};

export function DerivativesPanel() {
  const [data, setData] = React.useState<DerivativesAnalysis | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    fetch("/api/var/derivatives?confidence=0.99")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.analysis); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  if (loading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sigma className="h-4 w-4 text-chart-4" /> Derivatives &amp; Greeks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] rounded-md bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const varData = [
    { method: "Delta-only", value: data.varComparison.deltaOnly, color: METHOD_COLOR.deltaOnly },
    { method: "Delta-Gamma", value: data.varComparison.deltaGamma, color: METHOD_COLOR.deltaGamma },
    { method: "Full Reval", value: data.varComparison.fullReval, color: METHOD_COLOR.fullReval },
  ];

  // Build sensitivity chart data for the first underlying (or all combined).
  const sensitivityChart = data.sensitivities.length > 0
    ? data.sensitivities[0].moves.map((m, i) => {
        const row: Record<string, number> = { pct: m.pct };
        for (const s of data.sensitivities) {
          row[s.underlying + " (full)"] = s.moves[i].fullPnl;
        }
        return row;
      })
    : [];

  const gammaAdj = data.varComparison.gammaAdjustPct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sigma className="h-4 w-4 text-chart-4" />
              Derivatives &amp; Greeks
            </CardTitle>
            <CardDescription>
              {data.positions.length} option positions · Black-Scholes pricing · delta-gamma VaR vs full revaluation
            </CardDescription>
          </div>
          <Badge variant="outline" className={gammaAdj < 0 ? "border-emerald-500/40 text-emerald-500" : "border-rose-500/40 text-rose-500"}>
            <TrendingDown className="h-3 w-3 mr-1" />
            gamma adj {gammaAdj >= 0 ? "+" : ""}{gammaAdj.toFixed(1)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portfolio Greeks summary */}
        <div className="grid grid-cols-5 gap-2">
          <GreekStat label="Delta" value={fmtNum(data.portfolioGreeks.delta, 0)} sub="∂V/∂S" />
          <GreekStat label="Gamma" value={fmtNum(data.portfolioGreeks.gamma, 1)} sub="∂²V/∂S²" />
          <GreekStat label="Vega" value={fmtUSD(data.portfolioGreeks.vega / 100)} sub="per 1% vol" />
          <GreekStat label="Theta" value={fmtUSD(data.portfolioGreeks.theta)} sub="per day" />
          <GreekStat label="Rho" value={fmtUSD(data.portfolioGreeks.rho)} sub="per 1% rate" />
        </div>

        {/* VaR comparison chart */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">VaR Method Comparison</div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={varData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={56} />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="value" name="VaR" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {varData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Delta-only VaR misses convexity. Delta-gamma adds ½Γ·dS² — capturing how gamma reduces risk for short options and increases it for long options. Full revaluation is the ground truth.
          </p>
        </div>

        {/* Positions table */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Option Positions</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Symbol</TableHead>
                  <TableHead className="h-8 text-xs">Type</TableHead>
                  <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                  <TableHead className="h-8 text-xs text-right">Strike</TableHead>
                  <TableHead className="h-8 text-xs text-right">Mat (y)</TableHead>
                  <TableHead className="h-8 text-xs text-right">IV</TableHead>
                  <TableHead className="h-8 text-xs text-right">Delta</TableHead>
                  <TableHead className="h-8 text-xs text-right">Gamma</TableHead>
                  <TableHead className="h-8 text-xs text-right">Vega</TableHead>
                  <TableHead className="h-8 text-xs text-right">Price</TableHead>
                  <TableHead className="h-8 text-xs text-right">MV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.positions.map((p) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold">{p.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">{p.underlying} · {p.direction}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      <Badge variant="outline" className={p.type === "call" ? "text-emerald-500 border-emerald-500/40" : "text-rose-500 border-rose-500/40"}>
                        {p.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.quantity}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.strike.toFixed(2)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.maturity.toFixed(2)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{(p.impliedVol * 100).toFixed(0)}%</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.delta.toFixed(3)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.gamma.toFixed(4)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.vega.toFixed(1)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">${p.greeks.price.toFixed(2)}</TableCell>
                    <TableCell className={`py-2 text-xs text-right tabular-nums ${p.marketValue < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {fmtUSD(p.marketValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Sensitivity profile */}
        {data.sensitivities.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              P&amp;L Sensitivity to Underlying Moves (full revaluation)
            </div>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sensitivityChart} margin={{ top: 4, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="pct" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={56} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    labelFormatter={(v) => `${v}% move`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
                  {data.sensitivities.map((s, i) => (
                    <Line
                      key={s.underlying}
                      type="monotone"
                      dataKey={`${s.underlying} (full)`}
                      stroke={["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"][i % 3]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GreekStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}
