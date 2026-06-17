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
} from "recharts";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric",
  historical: "Historical",
  montecarlo: "Monte Carlo",
  filtered: "Filtered HS",
  evt: "EVT",
};

const METHOD_COLOR: Record<Methodology, string> = {
  parametric: "var(--chart-3)",
  historical: "var(--chart-1)",
  montecarlo: "var(--chart-2)",
  filtered: "var(--chart-5)",
  evt: "var(--chart-4)",
};

export function MethodologyComparison({
  report,
  activeMethod,
}: {
  report: FullReport;
  activeMethod: Methodology;
}) {
  const methods = Object.keys(report.results) as Methodology[];
  const chartData = methods.map((m) => ({
    method: METHOD_LABEL[m],
    var: Math.round(report.results[m].var),
    es: Math.round(report.results[m].es),
    color: METHOD_COLOR[m],
    active: m === activeMethod,
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Methodology Comparison</CardTitle>
        <CardDescription>
          Same portfolio, same confidence — the spread between methods is a direct measure of model risk.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="method" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickFormatter={(v) => fmtUSD(v)}
                width={56}
              />
              <Tooltip
                formatter={(v: number) => fmtUSD(v)}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="var" name="VaR" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.color}
                    opacity={d.active ? 1 : 0.45}
                    stroke={d.active ? d.color : "none"}
                    strokeWidth={d.active ? 2 : 0}
                  />
                ))}
                <LabelList
                  dataKey="var"
                  position="top"
                  formatter={(v: number) => fmtUSD(v)}
                  style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                />
              </Bar>
              <Bar dataKey="es" name="ES" radius={[4, 4, 0, 0]} maxBarSize={48} fill="var(--muted)" fillOpacity={0.35} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--chart-1)]" /> VaR (solid = active)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted opacity-40" /> Expected Shortfall
          </span>
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-xs">Methodology</TableHead>
              <TableHead className="h-8 text-xs text-right">VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">VaR %</TableHead>
              <TableHead className="h-8 text-xs text-right">ES</TableHead>
              <TableHead className="h-8 text-xs text-right">ES/VaR</TableHead>
              <TableHead className="h-8 text-xs text-right">Worst</TableHead>
              <TableHead className="h-8 text-xs text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map((m) => {
              const r = report.results[m];
              return (
                <TableRow key={m} className={m === activeMethod ? "bg-muted/40" : ""}>
                  <TableCell className="py-2 text-xs font-medium">
                    <div className="flex items-center gap-2">
                      {m === activeMethod && <Badge className="h-1.5 w-1.5 rounded-full bg-primary p-0" />}
                      {METHOD_LABEL[m]}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtUSD(r.var)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtPct(r.varPct)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">{fmtUSD(r.es)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums">
                    {(r.var > 0 ? r.es / r.var : 0).toFixed(2)}×
                  </TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-rose-500">{fmtUSD(r.worst)}</TableCell>
                  <TableCell className="py-2 text-xs text-right tabular-nums text-muted-foreground">{r.elapsedMs}ms</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
