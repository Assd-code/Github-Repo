"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  YAxis,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ComposedChart,
  Line,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtSci, fmtDate } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric",
  historical: "Historical Sim",
  montecarlo: "Monte Carlo",
  filtered: "Filtered HS",
  evt: "EVT",
};

const ZONE_STYLE = {
  green: { bg: "bg-emerald-500/15", text: "text-emerald-500", border: "border-emerald-500/40", label: "GREEN ZONE", desc: "Model adequately calibrated. Standard capital multiplier applies." },
  yellow: { bg: "bg-amber-500/15", text: "text-amber-500", border: "border-amber-500/40", label: "YELLOW ZONE", desc: "Exceptions in the warning band — multiplier scaled up, review triggered." },
  red: { bg: "bg-rose-500/15", text: "text-rose-500", border: "border-rose-500/40", label: "RED ZONE", desc: "Too many exceptions — model rejected, desk moves to Standardized Approach." },
};

export function BacktestPanel({
  report,
  method,
}: {
  report: FullReport;
  method: Methodology;
}) {
  const bt = report.backtest;
  const zone = ZONE_STYLE[bt.zone];

  // Build chart data: realized P&L (negative area), -VaR line, exception scatter.
  // Downsample to ~120 points for performance.
  const data = bt.exceptions.map((e, i) => ({
    i,
    date: fmtDate(e.date),
    pnl: Math.round(e.pnl),
    negVar: -Math.round(e.var),
    exception: e.exception ? Math.round(e.pnl) : null,
  }));
  const step = Math.max(1, Math.floor(data.length / 120));
  const sampled = data.filter((_, i) => i % step === 0 || data[i].exception !== null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">Backtesting — {METHOD_LABEL[method]}</CardTitle>
            <CardDescription>
              Rolling 250-day VaR vs. realized P&amp;L over {bt.window} trading days
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${zone.bg} ${zone.text} ${zone.border}`}>
            {zone.label} · {bt.zoneMultiplier}× mult
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={sampled} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} className="fill-muted-foreground" interval={Math.floor(sampled.length / 6)} />
              <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={54} />
              <Tooltip
                formatter={(v: number, name: string) => [fmtUSD(v), name === "exception" ? "Exception P&L" : name === "negVar" ? "−VaR limit" : "Realized P&L"]}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1.5} />
              <Area dataKey="pnl" name="pnl" stroke="var(--chart-2)" strokeWidth={1} fill="url(#pnlGrad)" />
              <Line dataKey="negVar" name="negVar" stroke="var(--chart-1)" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              <Scatter dataKey="exception" name="exception" fill="var(--chart-1)" fillOpacity={0.9} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className={`rounded-lg border ${zone.border} ${zone.bg} px-3 py-2.5`}>
          <div className={`text-sm font-semibold ${zone.text}`}>{zone.label} — {bt.exceptionCount} exceptions</div>
          <div className="text-xs text-muted-foreground mt-0.5">{zone.desc}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <TestCard
            name="Kupiec POF"
            stat={`${bt.exceptionCount} / ${bt.expectedExceptions.toFixed(1)}`}
            pValue={bt.kupiec.pValue}
            reject={bt.kupiec.reject}
            desc="Unconditional coverage: is the exception rate consistent with the confidence level?"
          />
          <TestCard
            name="Christoffersen"
            stat={`LR ${bt.christoffersen.ccLR.toFixed(2)}`}
            pValue={bt.christoffersen.ccP}
            reject={bt.christoffersen.reject}
            desc="Conditional coverage: exceptions must also be independent (no clustering)."
          />
          <MiniStat label="Exception Rate" value={`${(bt.exceptionRate * 100).toFixed(2)}%`} target={`vs ${(1 - bt.confidence) * 100}%`} />
          <MiniStat label="Avg Exception Size" value={fmtUSD(bt.avgExceptionMagnitude)} target="excess over VaR" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <ZoneBand label="GREEN" range="0–4" mult="3.0×" active={bt.zone === "green"} className="border-emerald-500/40 bg-emerald-500/5 text-emerald-600" />
          <ZoneBand label="YELLOW" range="5–9" mult="3.4–4.0×" active={bt.zone === "yellow"} className="border-amber-500/40 bg-amber-500/5 text-amber-600" />
          <ZoneBand label="RED" range="≥10" mult="4.0×" active={bt.zone === "red"} className="border-rose-500/40 bg-rose-500/5 text-rose-600" />
        </div>
      </CardContent>
    </Card>
  );
}

function TestCard({ name, stat, pValue, reject, desc }: { name: string; stat: string; pValue: number; reject: boolean; desc: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">{name}</span>
        <Badge variant={reject ? "destructive" : "secondary"} className="h-5 text-[10px]">
          {reject ? "REJECT" : "PASS"}
        </Badge>
      </div>
      <div className="text-sm font-semibold tabular-nums mt-1">{stat}</div>
      <div className="text-[10px] text-muted-foreground">p = {fmtSci(pValue)}</div>
      <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{desc}</div>
    </div>
  );
}

function MiniStat({ label, value, target }: { label: string; value: string; target: string }) {
  return (
    <div className="rounded-md border bg-muted/30 px-2.5 py-2">
      <div className="text-[11px] font-medium text-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground">{target}</div>
    </div>
  );
}

function ZoneBand({ label, range, mult, active, className }: { label: string; range: string; mult: string; active: boolean; className: string }) {
  return (
    <div className={`rounded-md border px-2 py-1.5 text-center ${className} ${active ? "ring-2 ring-offset-1 ring-offset-background" : "opacity-60"}`}>
      <div className="text-[11px] font-bold">{label}</div>
      <div className="text-[10px]">{range} exc</div>
      <div className="text-[10px] font-medium">{mult}</div>
    </div>
  );
}
