"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, AlertTriangle, Shield, Wallet, Gauge, Layers } from "lucide-react";
import {
  ResponsiveContainer,
  Area,
  AreaChart,
  Line,
  LineChart,
  Bar,
  BarChart,
} from "recharts";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric",
  historical: "Historical Sim",
  montecarlo: "Monte Carlo",
  filtered: "Filtered HS",
  evt: "EVT (GPD)",
};

// Downsample a series to N points for the sparkline.
function downsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}

export function KpiCards({
  report,
  method,
}: {
  report: FullReport;
  method: Methodology;
}) {
  const r = report.results[method];
  const minVar = Math.min(...Object.values(report.results).map((x) => x.var));
  const maxVar = Math.max(...Object.values(report.results).map((x) => x.var));
  const spread = maxVar - minVar;
  const esToVar = r.var > 0 ? r.es / r.var : 0;
  const worstStress = report.stress.reduce(
    (acc, s) => (s.pnl < acc.pnl ? s : acc),
    report.stress[0]
  );

  // Sparkline data: VaR trend (downsampled to 30 points for the sparkline)
  const trendData = downsample(report.trend.points, 30).map((p) => ({
    v: Math.round(p.var),
  }));
  // Sparkline data: P&L distribution (downsampled bins)
  const distData = downsample(r.distribution.bins, 24).map((b) => ({
    x: b.x,
    c: b.count,
  }));
  // Sparkline data: methodology spread (5 methods)
  const methodData = (Object.keys(report.results) as Methodology[]).map((m) => ({
    m,
    v: Math.round(report.results[m].var),
  }));
  // Sparkline data: backtest exceptions timeline
  const btData = downsample(report.backtest.exceptions, 30).map((e) => ({
    e: e.exception ? 1 : 0,
    pnl: Math.round(e.pnl),
  }));
  // Sparkline data: stress scenarios sorted worst to best
  const stressData = [...report.stress]
    .sort((a, b) => a.pnl - b.pnl)
    .map((s) => ({ pnl: Math.round(s.pnl) }));

  const cards = [
    {
      title: "Value at Risk",
      value: fmtUSD(r.var),
      sub: `${fmtPct(r.varPct)} of book · ${METHOD_LABEL[method]}`,
      icon: TrendingDown,
      accent: "text-rose-500",
      ring: "from-rose-500/20",
      spark: (
        <AreaChart data={trendData}>
          <defs>
            <linearGradient id="sparkVar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--rose-500)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--rose-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="var(--rose-500)" strokeWidth={1.5} fill="url(#sparkVar)" />
        </AreaChart>
      ),
    },
    {
      title: "Expected Shortfall",
      value: fmtUSD(r.es),
      sub: `${fmtPct(r.esPct)} · ES/VaR ${esToVar.toFixed(2)}×`,
      icon: AlertTriangle,
      accent: "text-amber-500",
      ring: "from-amber-500/20",
      spark: (
        <BarChart data={distData}>
          <Bar dataKey="c" fill="var(--amber-500)" fillOpacity={0.5} radius={[1, 1, 0, 0]} />
        </BarChart>
      ),
    },
    {
      title: "Portfolio Value",
      value: fmtUSD(report.portfolio.totalValue),
      sub: `${report.portfolio.positions.length} positions`,
      icon: Wallet,
      accent: "text-emerald-500",
      ring: "from-emerald-500/20",
      spark: (
        <BarChart data={methodData}>
          <Bar dataKey="v" fill="var(--emerald-500)" fillOpacity={0.5} radius={[1, 1, 0, 0]} />
        </BarChart>
      ),
    },
    {
      title: "Method Spread",
      value: fmtUSD(spread),
      sub: `min ${fmtUSD(minVar)} → max ${fmtUSD(maxVar)}`,
      icon: Layers,
      accent: "text-sky-500",
      ring: "from-sky-500/20",
      spark: (
        <BarChart data={methodData}>
          <Bar dataKey="v" fill="var(--sky-500)" fillOpacity={0.5} radius={[1, 1, 0, 0]} />
        </BarChart>
      ),
    },
    {
      title: "Backtest Zone",
      value: report.backtest.zone.toUpperCase(),
      sub: `${report.backtest.exceptionCount} exc · exp ${report.backtest.expectedExceptions.toFixed(1)}`,
      icon: Shield,
      accent:
        report.backtest.zone === "green"
          ? "text-emerald-500"
          : report.backtest.zone === "yellow"
          ? "text-amber-500"
          : "text-rose-500",
      ring:
        report.backtest.zone === "green"
          ? "from-emerald-500/20"
          : report.backtest.zone === "yellow"
          ? "from-amber-500/20"
          : "from-rose-500/20",
      spark: (
        <BarChart data={btData}>
          <Bar dataKey="e" fill="var(--rose-500)" fillOpacity={0.6} radius={[1, 1, 0, 0]} />
        </BarChart>
      ),
    },
    {
      title: "Worst Stress",
      value: fmtUSD(worstStress.pnl),
      sub: worstStress.scenario.name,
      icon: Gauge,
      accent: "text-rose-500",
      ring: "from-rose-500/20",
      spark: (
        <BarChart data={stressData}>
          <Bar dataKey="pnl" fill="var(--rose-500)" fillOpacity={0.5} radius={[1, 1, 0, 0]} />
        </BarChart>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {cards.map((c, idx) => (
        <Card
          key={c.title}
          className="relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 hover:border-primary/30 group"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${c.ring} via-transparent to-transparent opacity-70`} />
          <div className="absolute top-0 right-0 h-20 w-20 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" style={{ background: "var(--primary)" }} />
          <CardHeader className="relative pb-2 pt-3 px-3 sm:px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-[10px] sm:text-[11px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
                {c.title}
              </CardTitle>
              <div className={`flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-md bg-background/50 ${c.accent} shrink-0`}>
                <c.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative px-3 sm:px-4 pb-3">
            <div className={`text-base sm:text-xl font-bold tabular-nums ${c.accent}`}>{c.value}</div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">{c.sub}</div>
            {/* Sparkline */}
            <div className="mt-2 h-7 sm:h-8 w-full -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                {c.spark}
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
