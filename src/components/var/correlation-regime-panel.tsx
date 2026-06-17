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
  Legend,
} from "recharts";
import { Waves, AlertTriangle, TrendingUp } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtPct } from "@/lib/format";

interface RegimeStat {
  label: string;
  description: string;
  dayCount: number;
  dayShare: number;
  avgCorrelation: number;
  avgVol: number;
  byClass: { assetClass: string; avgCorrelation: number; avgVol: number }[];
  crossClass: { pair: string; correlation: number }[];
  perAsset: { symbol: string; name: string; assetClass: string; vol: number }[];
  tighteningVsCalm: number;
  color: string;
}

interface Analysis {
  regimes: RegimeStat[];
  systemicTightening: number;
  topTighteners: { pair: string; calmCorr: number; crisisCorr: number; delta: number }[];
  assessment: "stable" | "moderate-stress" | "high-stress" | "breakdown";
  summary: string;
  assets: { symbol: string; name: string; assetClass: string }[];
}

const ASSESSMENT_STYLE: Record<
  Analysis["assessment"],
  { label: string; color: string; bg: string; ring: string }
> = {
  stable: { label: "Stable", color: "text-emerald-500", bg: "bg-emerald-500/10", ring: "border-emerald-500/30" },
  "moderate-stress": { label: "Moderate Stress", color: "text-chart-3", bg: "bg-chart-3/10", ring: "border-chart-3/30" },
  "high-stress": { label: "High Stress", color: "text-amber-500", bg: "bg-amber-500/10", ring: "border-amber-500/30" },
  breakdown: { label: "Breakdown", color: "text-rose-500", bg: "bg-rose-500/10", ring: "border-rose-500/30" },
};

const REGIME_ICON: Record<string, React.ElementType> = {
  Calm: Waves,
  Buildup: TrendingUp,
  Crisis: AlertTriangle,
  Recovery: Waves,
};

export function CorrelationRegimePanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<Analysis | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/var/correlation-regime?seed=${controls.seed}`;
    fetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (!j.ok) throw new Error(j.error || "Failed");
        setData(j.analysis);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [controls.seed]);

  if (loading && !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Waves className="h-4 w-4 text-chart-3" />
            Correlation Regime Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Loading…</div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const assess = ASSESSMENT_STYLE[data.assessment];

  // Bar chart: avg correlation per regime
  const corrByRegime = data.regimes.map((r) => ({
    regime: r.label,
    avgCorr: +(r.avgCorrelation * 100).toFixed(1),
    avgVol: +(r.avgVol * 100).toFixed(1),
    color: r.color,
    dayShare: +(r.dayShare * 100).toFixed(1),
  }));

  // Top tighteners chart
  const tightenersData = data.topTighteners.map((t) => ({
    pair: t.pair,
    calm: +(t.calmCorr * 100).toFixed(1),
    crisis: +(t.crisisCorr * 100).toFixed(1),
    delta: +(t.delta * 100).toFixed(1),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Waves className="h-4 w-4 text-chart-3" />
              Correlation Regime Analysis
            </CardTitle>
            <CardDescription>
              How asset correlations shift across calm / buildup / crisis / recovery regimes
            </CardDescription>
          </div>
          <Badge variant="outline" className={`${assess.color} ${assess.ring} ${assess.bg}`}>
            {assess.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Systemic tightening stat banner */}
        <div className={`rounded-lg border ${assess.bg} ${assess.ring} px-3 py-2.5`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${assess.color}`} />
            <div className="flex-1">
              <div className={`text-xs font-semibold ${assess.color}`}>
                Systemic tightening: {(data.systemicTightening * 100).toFixed(1)}pp
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{data.summary}</div>
            </div>
          </div>
        </div>

        {/* Two-column charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Avg correlation per regime */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              Average pairwise correlation by regime
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={corrByRegime} margin={{ top: 14, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="regime" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} width={36} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="avgCorr" name="Avg Correlation" radius={[3, 3, 0, 0]} maxBarSize={48}>
                    {corrByRegime.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                    <LabelList dataKey="avgCorr" position="top" formatter={(v: number) => `${v}%`} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top tighteners */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">
              Top correlation tighteners (calm → crisis)
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tightenersData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="pair" tick={{ fontSize: 10 }} className="fill-muted-foreground" width={90} />
                  <Tooltip
                    formatter={(v: number) => `${v}%`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="calm" name="Calm" fill="var(--chart-3)" fillOpacity={0.5} radius={[0, 2, 2, 0]} maxBarSize={14} />
                  <Bar dataKey="crisis" name="Crisis" fill="var(--rose-500)" fillOpacity={0.7} radius={[0, 2, 2, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Per-regime detail cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {data.regimes.map((r) => {
            const Icon = REGIME_ICON[r.label] || Waves;
            return (
              <div key={r.label} className="rounded-lg border bg-muted/20 px-2.5 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3" style={{ color: r.color }} />
                    <span className="text-xs font-semibold">{r.label}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{(r.dayShare * 100).toFixed(0)}%</span>
                </div>
                <div className="text-[10px] text-muted-foreground leading-tight">{r.description}</div>
                <div className="grid grid-cols-2 gap-1 pt-1">
                  <div>
                    <div className="text-[9px] uppercase text-muted-foreground">Avg Corr</div>
                    <div className="text-xs font-semibold tabular-nums" style={{ color: r.color }}>
                      {(r.avgCorrelation * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase text-muted-foreground">Avg Vol</div>
                    <div className="text-xs font-semibold tabular-nums">
                      {(r.avgVol * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                {Math.abs(r.tighteningVsCalm) > 0.001 && (
                  <div className={`text-[10px] tabular-nums ${r.tighteningVsCalm > 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    Δ {(r.tighteningVsCalm * 100).toFixed(1)}pp vs calm
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Per-asset vol comparison: calm vs crisis */}
        {data.regimes.length >= 3 && (() => {
          const calm = data.regimes.find((r) => r.label === "Calm");
          const crisis = data.regimes.find((r) => r.label === "Crisis");
          if (!calm || !crisis) return null;
          const volData = calm.perAsset.map((a) => {
            const c = crisis.perAsset.find((p) => p.symbol === a.symbol);
            return {
              symbol: a.symbol,
              calm: +(a.vol * 100).toFixed(1),
              crisis: +((c?.vol || 0) * 100).toFixed(1),
              ratio: c && a.vol > 0 ? (c.vol / a.vol).toFixed(2) : "—",
            };
          }).sort((a, b) => b.crisis - a.crisis);
          return (
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                Per-asset annualized volatility: calm vs crisis (vol multiplier shown)
              </div>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-7 gap-1 text-[10px] font-medium text-muted-foreground px-1 py-1 min-w-[480px]">
                  <span className="col-span-1">Asset</span>
                  <span className="text-right">Calm Vol</span>
                  <span className="text-right">Crisis Vol</span>
                  <span className="text-right">Multiplier</span>
                  <span className="col-span-3 text-center">Calm → Crisis vol change</span>
                </div>
                <div className="space-y-1 min-w-[480px]">
                  {volData.map((d) => {
                    const maxVol = Math.max(...volData.map((v) => Math.max(v.calm, v.crisis)), 1);
                    return (
                      <div key={d.symbol} className="grid grid-cols-7 gap-1 items-center text-[10px] px-1 py-1 rounded hover:bg-muted/30">
                        <span className="font-mono font-semibold">{d.symbol}</span>
                        <span className="text-right tabular-nums">{d.calm}%</span>
                        <span className="text-right tabular-nums text-rose-500">{d.crisis}%</span>
                        <span className="text-right tabular-nums font-semibold text-amber-500">{d.ratio}×</span>
                        <div className="col-span-3 flex items-center gap-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-chart-3/60" style={{ width: `${(d.calm / maxVol) * 100}%` }} />
                          </div>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-rose-500/70" style={{ width: `${(d.crisis / maxVol) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Diversification is regime-dependent. In calm markets, asset correlations are typically low and the portfolio benefits from risk reduction. In crisis periods, correlations spike toward 1 — assets move together, diversification benefits vanish, and the realized portfolio risk can be much higher than the calm-period VaR suggests. This is why regulators require <span className="font-medium text-foreground">stressed VaR</span> (FRTB SES) alongside the modellable risk-factor VaR.
        </p>
      </CardContent>
    </Card>
  );
}
