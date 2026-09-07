"use client";

import * as React from "react";
import { AlertCircle, ArrowDownUp, Download, Loader2, Radar, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtPct, fmtUSD, fmtUSDfull } from "@/lib/format";
import { MARKET_UNIVERSE_OPTIONS, type MarketUniverseId } from "@/lib/var/market-universe";
import type { MarketScreenerMethod, MarketScreenerResult } from "@/lib/var/market-screener";

interface ScreenerResponse {
  ok: boolean;
  universe: MarketUniverseId;
  results: MarketScreenerResult[];
  failures: { symbol: string; error: string }[];
  requested: number;
  succeeded: number;
  method: MarketScreenerMethod;
  confidence: number;
  horizon: number;
  notional: number;
  generatedAt: string;
  provider: string;
  rankingBasis: string;
  coverageNotice: string;
  error?: string;
}
type SortKey = "rank" | "symbol" | "varPct" | "esPct" | "annualizedVol" | "dailyChange";
type SortDirection = "asc" | "desc";

const RISK_BADGE: Record<MarketScreenerResult["riskBand"], string> = {
  extreme: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  moderate: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  lower: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: "Equity",
  rate: "Rates / credit",
  fx: "FX",
  commodity: "Commodity",
  crypto: "Crypto",
};

function parseCustomSymbols(value: string): string[] {
  return [...new Set(value.toUpperCase().split(/[\s,;]+/).map((symbol) => symbol.trim()).filter(Boolean))];
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function SortableHead({
  label,
  column,
  sortKey,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  onSort: (column: SortKey) => void;
  className?: string;
}) {
  return (
    <TableHead className={`h-9 text-[11px] ${className}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(column)}
      >
        {label}
        <ArrowDownUp className={`h-3 w-3 ${sortKey === column ? "text-primary" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

export function MarketScreenerPanel({
  defaultConfidence,
  defaultHorizon,
}: {
  defaultConfidence: number;
  defaultHorizon: number;
}) {
  const [universe, setUniverse] = React.useState<MarketUniverseId>("global");
  const [method, setMethod] = React.useState<MarketScreenerMethod>("historical");
  const [confidence, setConfidence] = React.useState(String(defaultConfidence));
  const [horizon, setHorizon] = React.useState(String(defaultHorizon));
  const [notional, setNotional] = React.useState("100000");
  const [customSymbols, setCustomSymbols] = React.useState("AAPL, MSFT, NVDA, SPY, TLT, GLD, BTC-USD");
  const [data, setData] = React.useState<ScreenerResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [assetClass, setAssetClass] = React.useState("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("varPct");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const selectedUniverse = MARKET_UNIVERSE_OPTIONS.find((option) => option.id === universe);
  const customList = React.useMemo(() => parseCustomSymbols(customSymbols), [customSymbols]);

  const runScan = async () => {
    if (universe === "custom" && (customList.length === 0 || customList.length > 200)) {
      setError("Enter between 1 and 200 symbols for a custom scan.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/var/market-screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe,
          symbols: universe === "custom" ? customList : undefined,
          method,
          confidence: Number(confidence),
          horizon: Number(horizon),
          notional: Number(notional),
        }),
      });
      const payload = await response.json() as ScreenerResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Market scan failed");
      setData(payload);
      setSearch("");
      setAssetClass("all");
      setSortKey("varPct");
      setSortDirection("desc");
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Market scan failed");
    } finally {
      setLoading(false);
    }
  };

  const displayedResults = React.useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    const filtered = data.results.filter((result) => {
      const matchesClass = assetClass === "all" || result.assetClass === assetClass;
      const matchesSearch = !query || result.symbol.toLowerCase().includes(query) || result.name.toLowerCase().includes(query);
      return matchesClass && matchesSearch;
    });
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      if (sortKey === "symbol") return direction * left.symbol.localeCompare(right.symbol);
      return direction * (left[sortKey] - right[sortKey]);
    });
  }, [assetClass, data, search, sortDirection, sortKey]);

  const handleSort = (column: SortKey) => {
    if (sortKey === column) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(column);
      setSortDirection(column === "symbol" || column === "rank" ? "asc" : "desc");
    }
  };

  const exportCsv = () => {
    if (!data || displayedResults.length === 0) return;
    const header = [
      "Rank", "Symbol", "Name", "Asset class", "Spot", "Daily change", "VaR percent",
      "VaR amount", "Expected shortfall percent", "Expected shortfall amount", "Annualized volatility",
      "Observations", "History start", "History end", "Risk band",
    ];
    const rows = displayedResults.map((result) => [
      result.rank, result.symbol, result.name, result.assetClass, result.spot, result.dailyChange,
      result.varPct, result.varAmount, result.esPct, result.esAmount, result.annualizedVol,
      result.observations, result.historyStart, result.historyEnd, result.riskBand,
    ]);
    const csv = [header, ...rows].map((row) => row.map((value) => csvCell(value)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `var-market-ranking-${data.generatedAt.slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const medianResult = data?.results[Math.floor(data.results.length / 2)];
  const classes = data ? [...new Set(data.results.map((result) => result.assetClass))].sort() : [];

  return (
    <Card data-testid="market-screener-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radar className="h-4 w-4 text-primary" />
              Market VaR Screener
            </CardTitle>
            <CardDescription className="mt-1 max-w-4xl">
              Rank equal-sized long positions by standalone Value at Risk. This compares price risk fairly; it is not a return forecast or a portfolio recommendation.
            </CardDescription>
          </div>
          {data && (
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={displayedResults.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export list
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 rounded-lg border bg-muted/15 p-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-1.5 xl:col-span-2">
            <Label className="text-xs">Market universe</Label>
            <Select value={universe} onValueChange={(value) => setUniverse(value as MarketUniverseId)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MARKET_UNIVERSE_OPTIONS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}{option.count > 0 ? ` (${option.count})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] leading-snug text-muted-foreground">{selectedUniverse?.description}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">VaR model</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as MarketScreenerMethod)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="historical">Historical</SelectItem>
                <SelectItem value="parametric">Parametric</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confidence</Label>
            <Select value={confidence} onValueChange={setConfidence}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0.95">95%</SelectItem>
                <SelectItem value="0.99">99%</SelectItem>
                <SelectItem value="0.995">99.5%</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Horizon</Label>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="5">5 days</SelectItem>
                <SelectItem value="10">10 days</SelectItem>
                <SelectItem value="20">20 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="screener-notional" className="text-xs">Equal notional (USD)</Label>
            <Input
              id="screener-notional"
              type="number"
              min={1}
              max={1_000_000_000_000}
              value={notional}
              onChange={(event) => setNotional(event.target.value)}
            />
          </div>
          {universe === "custom" && (
            <div className="space-y-1.5 md:col-span-2 xl:col-span-6">
              <Label htmlFor="screener-symbols" className="text-xs">Symbols ({customList.length}/200)</Label>
              <Textarea
                id="screener-symbols"
                value={customSymbols}
                onChange={(event) => setCustomSymbols(event.target.value)}
                rows={3}
                placeholder="AAPL, MSFT, 0700.HK, EURUSD=X, BTC-USD"
              />
            </div>
          )}
          <div className="flex items-end md:col-span-2 xl:col-span-6">
            <Button data-testid="run-market-scan" onClick={runScan} disabled={loading} className="min-w-44">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
              {loading ? "Computing market VaR…" : "Run market scan"}
            </Button>
            <span className="ml-3 text-[11px] text-muted-foreground">
              {loading
                ? `Fetching real history for ${universe === "custom" ? customList.length : selectedUniverse?.count || 0} assets. Large scans can take a minute.`
                : "Uses two years of provider history; live failures are excluded and reported."}
            </span>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Market scan failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{data.succeeded}/{data.requested}</div>
                <div className="text-[10px] text-muted-foreground">real histories ranked</div>
              </div>
              <div className="rounded-lg border bg-rose-500/5 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Highest VaR</div>
                <div className="mt-1 text-lg font-semibold text-rose-500 tabular-nums">{data.results[0] ? fmtPct(data.results[0].varPct) : "—"}</div>
                <div className="truncate text-[10px] text-muted-foreground">{data.results[0]?.symbol || "No result"}</div>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Median VaR</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{medianResult ? fmtPct(medianResult.varPct) : "—"}</div>
                <div className="text-[10px] text-muted-foreground">equal-notional standalone loss</div>
              </div>
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Model basis</div>
                <div className="mt-1 text-sm font-semibold capitalize">{data.method} · {fmtPct(data.confidence, 1)}</div>
                <div className="text-[10px] text-muted-foreground">{data.horizon}-day · {fmtUSD(data.notional)} each</div>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row">
                <div className="relative max-w-md flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search market ranking"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search symbol or asset name"
                    className="pl-8"
                  />
                </div>
                <Select value={assetClass} onValueChange={setAssetClass}>
                  <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All asset classes</SelectItem>
                    {classes.map((item) => (
                      <SelectItem key={item} value={item}>{ASSET_CLASS_LABELS[item] || item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Showing {displayedResults.length} · updated {new Date(data.generatedAt).toLocaleString()}
              </div>
            </div>

            <div className="max-h-[620px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <SortableHead label="Rank" column="rank" sortKey={sortKey} onSort={handleSort} />
                    <SortableHead label="Asset" column="symbol" sortKey={sortKey} onSort={handleSort} />
                    <TableHead className="h-9 text-[11px]">Class</TableHead>
                    <TableHead className="h-9 text-right text-[11px]">Spot</TableHead>
                    <SortableHead label="1D" column="dailyChange" sortKey={sortKey} onSort={handleSort} className="text-right" />
                    <SortableHead label="VaR %" column="varPct" sortKey={sortKey} onSort={handleSort} className="text-right" />
                    <TableHead className="h-9 text-right text-[11px]">VaR amount</TableHead>
                    <SortableHead label="ES %" column="esPct" sortKey={sortKey} onSort={handleSort} className="text-right" />
                    <SortableHead label="Ann. vol" column="annualizedVol" sortKey={sortKey} onSort={handleSort} className="text-right" />
                    <TableHead className="h-9 text-right text-[11px]">Samples</TableHead>
                    <TableHead className="h-9 text-[11px]">Risk tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedResults.map((result) => (
                    <TableRow key={result.symbol} data-testid={`market-rank-${result.symbol}`}>
                      <TableCell className="py-2 text-xs font-semibold tabular-nums">#{result.rank}</TableCell>
                      <TableCell className="min-w-44 py-2">
                        <div className="text-xs font-semibold">{result.symbol}</div>
                        <div className="max-w-52 truncate text-[10px] text-muted-foreground" title={result.name}>{result.name}</div>
                      </TableCell>
                      <TableCell className="py-2 text-[10px] uppercase text-muted-foreground">{ASSET_CLASS_LABELS[result.assetClass] || result.assetClass}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{fmtUSDfull(result.spot, result.spot < 10 ? 4 : 2)}</TableCell>
                      <TableCell className={`py-2 text-right text-xs tabular-nums ${result.dailyChange >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{fmtPct(result.dailyChange)}</TableCell>
                      <TableCell className="py-2 text-right text-xs font-bold text-rose-500 tabular-nums">{fmtPct(result.varPct)}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{fmtUSD(result.varAmount)}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{fmtPct(result.esPct)}</TableCell>
                      <TableCell className="py-2 text-right text-xs tabular-nums">{fmtPct(result.annualizedVol, 1)}</TableCell>
                      <TableCell className="py-2 text-right text-xs text-muted-foreground tabular-nums">{result.observations}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant="outline" className={`text-[9px] uppercase ${RISK_BADGE[result.riskBand]}`}>{result.riskBand}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {displayedResults.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="h-28 text-center text-sm text-muted-foreground">No assets match the current filters.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <p><span className="font-medium text-foreground">How to read it:</span> VaR estimates the loss threshold that should only be exceeded {(100 * (1 - data.confidence)).toFixed(1)}% of the time under the selected model. Expected Shortfall is the average loss beyond that threshold.</p>
              <p>{data.coverageNotice} Results use provider history, not synthetic fallback. Different currencies are comparable by percentage risk; the displayed dollar amount applies the same USD notional to every row.</p>
            </div>

            {data.failures.length > 0 && (
              <details className="rounded-lg border bg-muted/10 px-3 py-2 text-xs">
                <summary className="cursor-pointer font-medium">Unavailable symbols ({data.failures.length})</summary>
                <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                  {data.failures.map((failure) => (
                    <div key={failure.symbol}><span className="font-medium text-foreground">{failure.symbol}</span> — {failure.error}</div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}

        {!data && !loading && !error && (
          <div className="rounded-lg border border-dashed py-14 text-center">
            <Radar className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Choose a universe and run the market scan</p>
            <p className="mx-auto mt-1 max-w-2xl text-xs text-muted-foreground">
              “Global multi-asset” covers the full built-in liquid universe. Use Custom symbols for provider-supported assets that are not included in the presets.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
