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
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Microscope, AlertOctagon, Clock, Layers } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD, fmtPct, fmtDate } from "@/lib/format";

interface ExceptionDetail {
  date: string;
  pnl: number;
  var: number;
  excess: number;
  excessPct: number;
  runLength: number;
  runIndex: number;
  regime: "calm" | "buildup" | "crisis" | "recovery";
  topContributors: { symbol: string; name: string; contribution: number; assetClass: string }[];
  severity: "minor" | "moderate" | "severe" | "extreme";
}

interface DeepDive {
  exceptions: ExceptionDetail[];
  clusters: {
    index: number;
    startDate: string;
    endDate: string;
    length: number;
    totalExcess: number;
    regime: string;
  }[];
  stats: {
    totalExceptions: number;
    expectedExceptions: number;
    exceptionRate: number;
    maxRunLength: number;
    clusterCount: number;
    avgExcess: number;
    worstExcess: number;
    clusteringRatio: number;
    byRegime: { regime: string; count: number; share: number }[];
    bySeverity: { severity: string; count: number }[];
  };
  baselZone: "green" | "yellow" | "red";
  interpretation: string;
}

const SEVERITY_STYLE: Record<ExceptionDetail["severity"], { color: string; bg: string; label: string }> = {
  minor: { color: "text-chart-3", bg: "bg-chart-3/10", label: "Minor" },
  moderate: { color: "text-amber-500", bg: "bg-amber-500/10", label: "Moderate" },
  severe: { color: "text-rose-500", bg: "bg-rose-500/10", label: "Severe" },
  extreme: { color: "text-rose-700 dark:text-rose-400", bg: "bg-rose-700/15", label: "Extreme" },
};

const REGIME_COLOR: Record<string, string> = {
  calm: "var(--chart-3)",
  buildup: "var(--chart-2)",
  crisis: "var(--rose-500)",
  recovery: "var(--chart-5)",
};

const REGIME_LABEL: Record<string, string> = {
  calm: "Calm",
  buildup: "Buildup",
  crisis: "Crisis",
  recovery: "Recovery",
};

export function ExceptionDeepDivePanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<DeepDive | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedExc, setSelectedExc] = React.useState<number | null>(null);

  const positionsStr = React.useMemo(
    () => controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(","),
    [controls.positions]
  );

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/exception-deepdive?seed=${controls.seed}&confidence=${controls.confidence}&method=${controls.method}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.deepdive);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.seed, controls.confidence, controls.method, controls.totalValue, positionsStr]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Microscope className="h-4 w-4 text-rose-500" />
            Backtest Exception Deep-Dive
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Analyzing…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  // Exception timeline data: per-day pnl, var, exception flag
  const timeline = data.exceptions.map((e, i) => ({
    idx: i + 1,
    date: fmtDate(e.date),
    pnl: Math.round(e.pnl),
    var: Math.round(e.var),
    excess: Math.round(e.excess),
    severity: e.severity,
    regime: e.regime,
    run: e.runIndex,
  }));

  // Regime breakdown chart
  const regimeData = data.stats.byRegime.map((r) => ({
    regime: REGIME_LABEL[r.regime] || r.regime,
    count: r.count,
    share: +(r.share * 100).toFixed(1),
    color: REGIME_COLOR[r.regime] || "var(--muted)",
  }));

  // Severity breakdown chart
  const severityOrder = ["minor", "moderate", "severe", "extreme"];
  const severityData = severityOrder
    .map((s) => {
      const found = data.stats.bySeverity.find((b) => b.severity === s);
      return {
        severity: SEVERITY_STYLE[s as ExceptionDetail["severity"]].label,
        count: found?.count || 0,
        color:
          s === "minor"
            ? "var(--chart-3)"
            : s === "moderate"
            ? "var(--amber-500)"
            : s === "severe"
            ? "var(--rose-500)"
            : "var(--rose-700)",
      };
    })
    .filter((d) => d.count > 0);

  const sel = selectedExc != null ? data.exceptions[selectedExc] : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Microscope className="h-4 w-4 text-rose-500" />
              Backtest Exception Deep-Dive
            </CardTitle>
            <CardDescription>
              Clustering · severity · regime attribution · per-exception contributors
            </CardDescription>
          </div>
          <Badge variant="outline" className={data.baselZone === "green" ? "border-emerald-500/40 text-emerald-500" : data.baselZone === "yellow" ? "border-amber-500/40 text-amber-500" : "border-rose-500/40 text-rose-500"}>
            Basel {data.baselZone.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Exceptions</div>
            <div className="text-lg font-bold tabular-nums text-rose-500">{data.stats.totalExceptions}</div>
            <div className="text-[10px] text-muted-foreground">exp {data.stats.expectedExceptions.toFixed(1)}</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-amber-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clusters</div>
            <div className="text-lg font-bold tabular-nums text-amber-500">{data.stats.clusterCount}</div>
            <div className="text-[10px] text-muted-foreground">max run {data.stats.maxRunLength}d</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-chart-3/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clustering Ratio</div>
            <div className={`text-lg font-bold tabular-nums ${data.stats.clusteringRatio > 1.5 ? "text-rose-500" : data.stats.clusteringRatio > 1 ? "text-amber-500" : "text-emerald-500"}`}>
              {data.stats.clusteringRatio.toFixed(2)}
            </div>
            <div className="text-[10px] text-muted-foreground">iid=1, &gt;1 clustered</div>
          </div>
          <div className="rounded-lg border bg-gradient-to-br from-rose-500/10 to-transparent p-2.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Worst Excess</div>
            <div className="text-lg font-bold tabular-nums text-rose-500">{fmtUSD(data.stats.worstExcess)}</div>
            <div className="text-[10px] text-muted-foreground">avg {fmtUSD(data.stats.avgExcess)}</div>
          </div>
        </div>

        {/* Interpretation banner */}
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
          <Microscope className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
          {data.interpretation}
        </div>

        {/* Exception timeline: pnl + var lines, exception scatter colored by severity */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">
            Exception timeline — P&L vs VaR with severity coloring (click a point for details)
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={timeline} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="idx" tick={{ fontSize: 10 }} className="fill-muted-foreground" label={{ value: "Exception #", position: "insideBottom", offset: -2, fontSize: 9, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={50} />
                <Tooltip
                  formatter={(v: number, name) => name === "P&L" || name === "VaR" || name === "Excess" ? fmtUSD(v) : v}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                <Bar dataKey="var" name="VaR" fill="var(--muted)" fillOpacity={0.3} maxBarSize={18} radius={[2, 2, 0, 0]} />
                <Bar dataKey="pnl" name="P&L" radius={[2, 2, 0, 0]} maxBarSize={18}>
                  {timeline.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.severity === "extreme"
                          ? "var(--rose-700)"
                          : d.severity === "severe"
                          ? "var(--rose-500)"
                          : d.severity === "moderate"
                          ? "var(--amber-500)"
                          : "var(--chart-3)"
                      }
                      fillOpacity={selectedExc === i ? 1 : 0.7}
                      stroke={selectedExc === i ? "var(--foreground)" : "none"}
                      strokeWidth={selectedExc === i ? 1.5 : 0}
                      onClick={() => setSelectedExc(selectedExc === i ? null : i)}
                      className="cursor-pointer"
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Two-column: regime breakdown + severity breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3 w-3" /> Exceptions by market regime
            </div>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={regimeData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="regime" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} width={28} />
                  <Tooltip
                    formatter={(v: number) => [v, "Exceptions"]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="count" name="Exceptions" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {regimeData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <AlertOctagon className="h-3 w-3" /> Exceptions by severity
            </div>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={severityData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="severity" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" allowDecimals={false} width={28} />
                  <Tooltip
                    formatter={(v: number) => [v, "Exceptions"]}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="count" name="Exceptions" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {severityData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Exception detail table OR selected exception panel */}
        {sel ? (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs font-semibold flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" />
                {fmtDate(sel.date)}
                <Badge variant="outline" className={`text-[10px] h-5 ${SEVERITY_STYLE[sel.severity].color} ${SEVERITY_STYLE[sel.severity].bg}`}>
                  {SEVERITY_STYLE[sel.severity].label}
                </Badge>
                <Badge variant="outline" className="text-[10px] h-5" style={{ color: REGIME_COLOR[sel.regime], borderColor: REGIME_COLOR[sel.regime] }}>
                  {REGIME_LABEL[sel.regime]}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  run #{sel.runIndex + 1}, length {sel.runLength}d
                </span>
              </div>
              <button onClick={() => setSelectedExc(null)} className="text-[10px] text-muted-foreground hover:text-foreground">
                ✕ close
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-md border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">P&L</div>
                <div className="font-semibold tabular-nums text-rose-500">{fmtUSD(sel.pnl)}</div>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">VaR</div>
                <div className="font-semibold tabular-nums">{fmtUSD(sel.var)}</div>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">Excess</div>
                <div className="font-semibold tabular-nums text-rose-500">{fmtUSD(sel.excess)}</div>
              </div>
              <div className="rounded-md border bg-card px-2 py-1.5">
                <div className="text-[10px] text-muted-foreground">Excess %</div>
                <div className="font-semibold tabular-nums text-rose-500">{fmtPct(sel.excessPct, 1)}</div>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted-foreground">Top 3 loss contributors that day</div>
              <div className="flex flex-wrap gap-1.5">
                {sel.topContributors.map((c) => (
                  <div key={c.symbol} className="rounded-md border bg-card px-2 py-1 text-[10px]">
                    <span className="font-mono font-semibold">{c.symbol}</span>{" "}
                    <span className="text-muted-foreground">{c.name}</span>{" "}
                    <span className="tabular-nums text-rose-500">{fmtUSD(c.contribution)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              All exceptions — click a row to see per-day breakdown
            </div>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8 text-xs">Date</TableHead>
                    <TableHead className="h-8 text-xs text-right">P&L</TableHead>
                    <TableHead className="h-8 text-xs text-right">VaR</TableHead>
                    <TableHead className="h-8 text-xs text-right">Excess</TableHead>
                    <TableHead className="h-8 text-xs">Severity</TableHead>
                    <TableHead className="h-8 text-xs">Regime</TableHead>
                    <TableHead className="h-8 text-xs text-right">Run</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.exceptions.map((e, i) => (
                    <TableRow
                      key={e.date}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => setSelectedExc(i)}
                    >
                      <TableCell className="py-1.5 text-xs">{fmtDate(e.date)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-right tabular-nums text-rose-500">{fmtUSD(e.pnl)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-right tabular-nums">{fmtUSD(e.var)}</TableCell>
                      <TableCell className="py-1.5 text-xs text-right tabular-nums text-rose-500">{fmtUSD(e.excess)}</TableCell>
                      <TableCell className="py-1.5 text-xs">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${SEVERITY_STYLE[e.severity].bg} ${SEVERITY_STYLE[e.severity].color}`}>
                          {SEVERITY_STYLE[e.severity].label}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-xs" style={{ color: REGIME_COLOR[e.regime] }}>
                        {REGIME_LABEL[e.regime]}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs text-right tabular-nums text-muted-foreground">
                        {e.runLength}d (#{e.runIndex + 1})
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Clustering</span> (consecutive exceptions) is more concerning than scattered ones — it indicates the model is slow to react to vol-regime shifts. The <span className="font-medium text-foreground">clustering ratio</span> compares actual clusters to what iid exceptions would produce; values &gt;1.5 trigger regulatory concern. Click any exception row or timeline bar to drill into per-asset loss contributors.
        </p>
      </CardContent>
    </Card>
  );
}
