"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MarketSeries } from "./use-var-data";
import { fmtDate } from "@/lib/format";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#a855f7",
  "#06b6d4",
];

export function MarketPanel({ market }: { market: MarketSeries | null }) {
  if (!market) return null;

  const symbols = market.assets.map((a) => a.symbol);
  // Normalize each series to start at 100 for comparison.
  const chartData = market.dates.map((date, i) => {
    const row: Record<string, number | string> = { date };
    for (const sym of symbols) {
      const series = market.series[sym];
      const base = series[0] || 1;
      row[sym] = ((series[i] || base) / base) * 100;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Market Data &amp; Correlation Structure</CardTitle>
        <CardDescription>
          {market.windowDays} trading days of simulated price history across {market.assets.length} assets with regime-switching volatility.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="prices">
          <TabsList className="mb-3 overflow-x-auto max-w-full">
            <TabsTrigger value="prices" className="text-xs shrink-0">Normalized Prices</TabsTrigger>
            <TabsTrigger value="correlation" className="text-xs shrink-0">Correlation</TabsTrigger>
            <TabsTrigger value="assets" className="text-xs shrink-0">Asset Universe</TabsTrigger>
          </TabsList>

          <TabsContent value="prices" className="mt-0">
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={fmtDate} interval={Math.floor(chartData.length / 6)} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" width={40} />
                  <Tooltip
                    labelFormatter={(v) => fmtDate(String(v))}
                    formatter={(v: number, name) => [v.toFixed(1), name]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />
                  {symbols.map((sym, i) => (
                    <Line
                      key={sym}
                      type="monotone"
                      dataKey={sym}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              All series rebased to 100 at the start of the window. The crisis regime (≈70–85% of the timeline) produces the visible drawdown in risk assets and rally in Treasuries.
            </p>
          </TabsContent>

          <TabsContent value="correlation" className="mt-0">
            <CorrelationHeatmap symbols={symbols} matrix={market.correlation} />
          </TabsContent>

          <TabsContent value="assets" className="mt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {market.assets.map((a, i) => (
                <div key={a.symbol} className="flex items-center gap-3 rounded-md border bg-muted/20 px-3 py-2">
                  <span className="h-8 w-1 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{a.symbol}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{a.assetClass}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{a.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Ann. Vol</div>
                    <div className="text-xs font-semibold tabular-nums">{(a.vol * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Drift</div>
                    <div className={`text-xs font-semibold tabular-nums ${a.drift >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                      {(a.drift * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function CorrelationHeatmap({ symbols, matrix }: { symbols: string[]; matrix: number[][] }) {
  const cellColor = (v: number) => {
    // -1 (cool) .. 1 (warm)
    if (v > 0) {
      const a = Math.min(0.85, 0.15 + v * 0.7);
      return `rgba(244, 63, 94, ${a})`; // rose for positive corr
    }
    const a = Math.min(0.85, 0.15 + Math.abs(v) * 0.7);
    return `rgba(16, 185, 129, ${a})`; // emerald for negative corr
  };
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 mx-auto">
        <thead>
          <tr>
            <th className="w-16" />
            {symbols.map((s) => (
              <th key={s} className="text-[10px] font-medium text-muted-foreground px-1 pb-1">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="text-[10px] font-medium text-muted-foreground pr-1 text-right">{symbols[i]}</td>
              {row.map((v, j) => (
                <td
                  key={j}
                  className="h-9 w-12 text-center text-[10px] font-semibold tabular-nums rounded"
                  style={{ background: cellColor(v), color: Math.abs(v) > 0.5 ? "white" : "var(--foreground)" }}
                  title={`${symbols[i]} ↔ ${symbols[j]}: ${v.toFixed(3)}`}
                >
                  {v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "rgba(16,185,129,0.7)" }} /> negative (diversifying)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: "rgba(244,63,94,0.7)" }} /> positive (concentrating)</span>
      </div>
    </div>
  );
}
