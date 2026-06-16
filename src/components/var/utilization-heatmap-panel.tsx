"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Grid3x3 } from "lucide-react";

interface HeatmapRow {
  scope: string;
  label: string;
  values: (number | null)[];
}

function cellColor(v: number | null): { bg: string; text: string } {
  if (v === null) return { bg: "bg-muted/30", text: "text-muted-foreground" };
  if (v >= 1.0) return { bg: "bg-rose-500", text: "text-white" };
  if (v >= 0.8) return { bg: "bg-amber-500", text: "text-white" };
  if (v >= 0.6) return { bg: "bg-yellow-500/60", text: "text-foreground" };
  if (v >= 0.4) return { bg: "bg-emerald-500/40", text: "text-foreground" };
  return { bg: "bg-emerald-500/20", text: "text-muted-foreground" };
}

export function UtilizationHeatmapPanel() {
  const [matrix, setMatrix] = React.useState<HeatmapRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    fetch("/api/var/audit?action=heatmap&slots=12")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setMatrix(d.matrix); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const maxSlots = matrix.length > 0 ? matrix[0].values.length : 12;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Grid3x3 className="h-4 w-4 text-chart-3" />
              Limit Utilization Heatmap
            </CardTitle>
            <CardDescription>
              Desk × time-slot utilization matrix · darker red = more breached · auto-refreshes 30s
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="h-[200px] rounded-md bg-muted/30 animate-pulse" />
        ) : matrix.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-2">
              <Grid3x3 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No utilization history yet</p>
            <p className="text-xs text-muted-foreground mt-1">Readings accumulate as the limit monitor runs. Check back shortly.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-1 w-full">
                <thead>
                  <tr>
                    <th className="w-28" />
                    {Array.from({ length: maxSlots }).map((_, i) => (
                      <th key={i} className="text-[9px] font-medium text-muted-foreground px-0.5 pb-1 text-center">
                        {i === maxSlots - 1 ? "now" : `−${maxSlots - 1 - i}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.scope}>
                      <td className="text-[10px] font-medium text-foreground pr-1 text-right truncate max-w-[7rem]">
                        {row.label}
                      </td>
                      {row.values.map((v, i) => {
                        const c = cellColor(v);
                        return (
                          <td
                            key={i}
                            className={`h-9 w-9 text-center text-[9px] font-semibold tabular-nums rounded ${c.bg} ${c.text} transition-all hover:scale-110 hover:z-10 hover:ring-2 hover:ring-foreground/20 cursor-default`}
                            title={`${row.label} · slot ${i + 1}: ${v !== null ? (v * 100).toFixed(0) + "%" : "no data"}`}
                          >
                            {v !== null ? Math.round(v * 100) : "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500/20" /> &lt;40%</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500/40" /> 40–60%</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-yellow-500/60" /> 60–80%</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-500" /> 80–100% (warning)</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-rose-500" /> &gt;100% (breach)</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Each cell shows VaR as a percentage of the limit. The heatmap reveals which desks consistently run hot — a persistent red row signals a desk that needs to either reduce risk or request a limit increase.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
