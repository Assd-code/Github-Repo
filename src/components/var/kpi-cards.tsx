"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingDown, AlertTriangle, Shield, Wallet, Gauge, Layers } from "lucide-react";
import type { FullReport, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const METHOD_LABEL: Record<Methodology, string> = {
  parametric: "Parametric",
  historical: "Historical Sim",
  montecarlo: "Monte Carlo",
  filtered: "Filtered HS",
  evt: "EVT (GPD)",
};

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

  const cards = [
    {
      title: "Value at Risk",
      value: fmtUSD(r.var),
      sub: `${fmtPct(r.varPct)} of book · ${METHOD_LABEL[method]}`,
      icon: TrendingDown,
      accent: "text-rose-500",
      ring: "from-rose-500/20",
    },
    {
      title: "Expected Shortfall",
      value: fmtUSD(r.es),
      sub: `${fmtPct(r.esPct)} · ES/VaR ${esToVar.toFixed(2)}×`,
      icon: AlertTriangle,
      accent: "text-amber-500",
      ring: "from-amber-500/20",
    },
    {
      title: "Portfolio Value",
      value: fmtUSD(report.portfolio.totalValue),
      sub: `${report.portfolio.positions.length} positions`,
      icon: Wallet,
      accent: "text-emerald-500",
      ring: "from-emerald-500/20",
    },
    {
      title: "Method Spread",
      value: fmtUSD(spread),
      sub: `min ${fmtUSD(minVar)} → max ${fmtUSD(maxVar)}`,
      icon: Layers,
      accent: "text-sky-500",
      ring: "from-sky-500/20",
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
      ring: "from-emerald-500/20",
    },
    {
      title: "Worst Stress",
      value: fmtUSD(worstStress.pnl),
      sub: worstStress.scenario.name,
      icon: Gauge,
      accent: "text-rose-500",
      ring: "from-rose-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <Card key={c.title} className="relative overflow-hidden">
          <div className={`absolute inset-0 bg-gradient-to-br ${c.ring} to-transparent opacity-60`} />
          <CardHeader className="relative pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {c.title}
              </CardTitle>
              <c.icon className={`h-4 w-4 ${c.accent}`} />
            </div>
          </CardHeader>
          <CardContent className="relative px-4 pb-3">
            <div className={`text-xl font-bold tabular-nums ${c.accent}`}>{c.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
