"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShieldX, ShieldAlert, BellRing, Activity } from "lucide-react";
import { fmtUSD, fmtDate, fmtTime } from "@/lib/format";

interface FeedItem {
  id: string;
  date: string;
  scope: string;
  method: string;
  confidence: number;
  horizon: number;
  var: number;
  limit: number;
  utilization: number;
  severity: "breach" | "warning";
}

const SCOPE_LABEL: Record<string, string> = {
  "portfolio:default": "Portfolio",
  "desk:equities": "Equities Desk",
  "desk:crypto": "Crypto Desk",
  "desk:rates": "Rates Desk",
};

export function BreachFeedPanel() {
  const [feed, setFeed] = React.useState<FeedItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = () => {
    fetch("/api/var/audit?action=feed&limit=40")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setFeed(d.feed); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => {
    load();
    // Refresh every 30s to pick up new readings.
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const breachCount = feed.filter((f) => f.severity === "breach").length;
  const warningCount = feed.filter((f) => f.severity === "warning").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="h-4 w-4 text-rose-500" />
              Breach Alert Feed
            </CardTitle>
            <CardDescription>
              Real-time limit breaches &amp; warnings across all desks · auto-refreshes every 30s
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            {breachCount > 0 && (
              <Badge variant="outline" className="bg-rose-500/15 text-rose-500 border-rose-500/40">
                <ShieldX className="h-3 w-3 mr-1" />{breachCount} breach{breachCount > 1 ? "es" : ""}
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/40">
                <ShieldAlert className="h-3 w-3 mr-1" />{warningCount} warning{warningCount > 1 ? "s" : ""}
              </Badge>
            )}
            {breachCount === 0 && warningCount === 0 && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-500 border-emerald-500/40">
                <Activity className="h-3 w-3 mr-1" />all clear
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-md bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-2">
              <Activity className="h-6 w-6 text-emerald-500" />
            </div>
            <p className="text-sm font-medium">No breaches or warnings</p>
            <p className="text-xs text-muted-foreground mt-1">All limits are within tolerance. Limits above 80% utilization will appear here.</p>
          </div>
        ) : (
          <ScrollArea className="h-[340px] pr-3">
            <div className="space-y-1.5">
              {feed.map((item) => {
                const isBreach = item.severity === "breach";
                const overBy = Math.max(0, item.var - item.limit);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition-smooth hover:scale-[1.01] ${
                      isBreach
                        ? "border-rose-500/40 bg-rose-500/5"
                        : "border-amber-500/40 bg-amber-500/5"
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      isBreach ? "bg-rose-500/15" : "bg-amber-500/15"
                    }`}>
                      {isBreach ? (
                        <ShieldX className="h-4 w-4 text-rose-500" />
                      ) : (
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">
                          {SCOPE_LABEL[item.scope] ?? item.scope}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {fmtTime(item.date)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-sm font-bold tabular-nums ${isBreach ? "text-rose-500" : "text-amber-500"}`}>
                          {(item.utilization * 100).toFixed(0)}%
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          VaR {fmtUSD(item.var)} / {fmtUSD(item.limit)}
                        </span>
                        {isBreach && overBy > 0 && (
                          <Badge variant="destructive" className="h-4 text-[9px] px-1 py-0">
                            +{fmtUSD(overBy)} over
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {item.method} · {(item.confidence * 100).toFixed(0)}% · {item.horizon}d · {fmtDate(item.date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
