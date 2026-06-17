"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw, Settings2, Activity, Download, Search, Loader2, Check, X, TrendingUp } from "lucide-react";
import type { VarControls } from "./use-var-data";
import type { Methodology } from "@/lib/var/types";
import { fmtUSD } from "@/lib/format";

const METHODS: { id: Methodology; label: string }[] = [
  { id: "historical", label: "Historical Simulation" },
  { id: "parametric", label: "Parametric (Var-Cov)" },
  { id: "montecarlo", label: "Monte Carlo" },
  { id: "filtered", label: "Filtered HS (EWMA)" },
  { id: "evt", label: "Extreme Value Theory" },
];

const CONFIDENCES = [0.95, 0.99, 0.995];
const HORIZONS = [1, 5, 10, 20];

// Popular tickers for quick-add suggestions
const POPULAR_TICKERS = [
  { symbol: "SPY", name: "S&P 500 ETF" },
  { symbol: "QQQ", name: "Nasdaq 100 ETF" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META", name: "Meta" },
  { symbol: "TLT", name: "20+ Yr Treasury ETF" },
  { symbol: "GLD", name: "Gold ETF" },
  { symbol: "SPXS", name: "S&P 500 Bear 3x" },
  { symbol: "SPXL", name: "S&P 500 Bull 3x" },
  { symbol: "TBT", name: "Treasury Bear 3x" },
  { symbol: "BTC-USD", name: "Bitcoin" },
  { symbol: "ETH-USD", name: "Ethereum" },
  { symbol: "USO", name: "Oil ETF" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
];

interface TickerValidation {
  symbol: string;
  valid: boolean;
  name?: string;
  assetClass?: string;
  spot?: number;
  error?: string;
  checking?: boolean;
}

export function ControlBar({
  controls,
  setControls,
  onRefresh,
  loading,
  useRealData,
  setUseRealData,
}: {
  controls: VarControls;
  setControls: React.Dispatch<React.SetStateAction<VarControls>>;
  onRefresh: () => void;
  loading: boolean;
  useRealData: boolean;
  setUseRealData: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [portfolioOpen, setPortfolioOpen] = React.useState(false);
  const [draftPositions, setDraftPositions] = React.useState(controls.positions);
  const [newTicker, setNewTicker] = React.useState("");
  const [validation, setValidation] = React.useState<TickerValidation | null>(null);
  const [validating, setValidating] = React.useState(false);

  React.useEffect(() => {
    setDraftPositions(controls.positions);
  }, [controls.positions]);

  const updatePosition = (idx: number, field: "symbol" | "quantity", value: string) => {
    setDraftPositions((prev) => {
      const next = [...prev];
      if (field === "symbol") next[idx] = { ...next[idx], symbol: value.toUpperCase() };
      else next[idx] = { ...next[idx], quantity: Number(value) || 0 };
      return next;
    });
  };

  const removePosition = (idx: number) => {
    setDraftPositions(draftPositions.filter((_, i) => i !== idx));
  };

  // Validate a ticker symbol via the API
  const validateTicker = async (symbol: string) => {
    if (!symbol.trim()) {
      setValidation(null);
      return;
    }
    setValidating(true);
    setValidation({ symbol: symbol.toUpperCase(), valid: false, checking: true });
    try {
      const res = await fetch(`/api/var/validate-ticker?symbol=${encodeURIComponent(symbol.trim())}`);
      const j = await res.json();
      if (j.ok && j.valid) {
        setValidation({
          symbol: j.symbol,
          valid: true,
          name: j.name,
          assetClass: j.assetClass,
          spot: j.spot,
        });
      } else {
        setValidation({
          symbol: symbol.toUpperCase(),
          valid: false,
          error: j.error || "Ticker not found",
        });
      }
    } catch (e) {
      setValidation({
        symbol: symbol.toUpperCase(),
        valid: false,
        error: "Network error",
      });
    } finally {
      setValidating(false);
    }
  };

  // Add a validated ticker to the portfolio
  const addValidatedTicker = () => {
    if (!validation?.valid) return;
    const sym = validation.symbol;
    // Don't add duplicates
    if (draftPositions.some((p) => p.symbol === sym)) return;
    setDraftPositions([...draftPositions, { symbol: sym, quantity: 1000 }]);
    setNewTicker("");
    setValidation(null);
  };

  // Add a quick-pick ticker (validates first, then adds)
  const addQuickPick = async (symbol: string) => {
    if (draftPositions.some((p) => p.symbol === symbol)) return;
    // Add immediately with placeholder qty; validation happens on apply
    setDraftPositions([...draftPositions, { symbol, quantity: 1000 }]);
  };

  const applyPortfolio = () => {
    setControls((c) => ({ ...c, positions: draftPositions.filter((p) => p.quantity !== 0) }));
    setPortfolioOpen(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      {/* Methodology */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Primary Methodology</Label>
        <Select
          value={controls.method}
          onValueChange={(v) => setControls((c) => ({ ...c, method: v as Methodology }))}
        >
          <SelectTrigger className="w-[210px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Confidence */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Confidence</Label>
        <Select
          value={String(controls.confidence)}
          onValueChange={(v) => setControls((c) => ({ ...c, confidence: Number(v) }))}
        >
          <SelectTrigger className="w-[100px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONFIDENCES.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {(c * 100).toFixed(1)}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Horizon */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Horizon (days)</Label>
        <Select
          value={String(controls.horizon)}
          onValueChange={(v) => setControls((c) => ({ ...c, horizon: Number(v) }))}
        >
          <SelectTrigger className="w-[90px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h}d
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Data source toggle: Synthetic vs Real */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Data Source</Label>
        <div className="flex items-center gap-1 rounded-md border h-9 p-0.5">
          <button
            onClick={() => setUseRealData(false)}
            className={`h-8 px-3 rounded text-xs font-medium transition-colors ${!useRealData ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Synthetic
          </button>
          <button
            onClick={() => setUseRealData(true)}
            className={`h-8 px-3 rounded text-xs font-medium transition-colors flex items-center gap-1 ${useRealData ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            <TrendingUp className="h-3 w-3" />
            Real Data
          </button>
        </div>
      </div>

      {/* Seed (only shown for synthetic) */}
      {!useRealData && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Market Seed</Label>
          <Input
            type="number"
            className="w-[90px] h-9"
            value={controls.seed}
            onChange={(e) => setControls((c) => ({ ...c, seed: Number(e.target.value) || 0 }))}
          />
        </div>
      )}

      {/* Portfolio */}
      <Dialog open={portfolioOpen} onOpenChange={setPortfolioOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-9">
            <Settings2 className="h-4 w-4 mr-2" />
            Portfolio
            <Badge variant="secondary" className="ml-2 h-5 text-[10px]">
              {controls.positions.length}
            </Badge>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Portfolio Positions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {/* Custom ticker search */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
              <Label className="text-xs font-medium">Add Custom Ticker (any stock / ETF / crypto / FX)</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    placeholder="e.g. SPXS, AAPL, TSLA, BTC-USD, EURUSD=X"
                    value={newTicker}
                    onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTicker.trim()) validateTicker(newTicker);
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => validateTicker(newTicker)}
                  disabled={!newTicker.trim() || validating}
                >
                  {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span className="ml-1">Validate</span>
                </Button>
              </div>
              {validation && (
                <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${validation.checking ? "bg-muted" : validation.valid ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}>
                  {validation.checking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : validation.valid ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                  <span className="flex-1">
                    {validation.checking
                      ? `Validating ${validation.symbol}...`
                      : validation.valid
                      ? `${validation.symbol} — ${validation.name} (${validation.assetClass}) · $${validation.spot?.toFixed(2)}`
                      : `${validation.symbol} — ${validation.error}`}
                  </span>
                  {validation.valid && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={addValidatedTicker}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  )}
                </div>
              )}
              {/* Quick-pick popular tickers */}
              <div className="flex flex-wrap gap-1 pt-1">
                {POPULAR_TICKERS.filter((t) => !draftPositions.some((p) => p.symbol === t.symbol)).slice(0, 12).map((t) => (
                  <button
                    key={t.symbol}
                    onClick={() => addQuickPick(t.symbol)}
                    className="rounded-md border bg-card px-1.5 py-0.5 text-[10px] hover:bg-muted/40 transition-colors"
                    title={t.name}
                  >
                    + {t.symbol}
                  </button>
                ))}
              </div>
            </div>

            {/* Current positions */}
            <div className="grid grid-cols-[1fr_140px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Symbol</span>
              <span>Quantity</span>
              <span />
            </div>
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {draftPositions.map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center">
                  <Input
                    className="h-9 font-mono"
                    value={p.symbol}
                    onChange={(e) => updatePosition(idx, "symbol", e.target.value)}
                  />
                  <Input
                    type="number"
                    className="h-9"
                    value={p.quantity}
                    onChange={(e) => updatePosition(idx, "quantity", e.target.value)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                    onClick={() => removePosition(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {draftPositions.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">
                  No positions. Add a ticker above to get started.
                </div>
              )}
            </div>
            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Total Book Value (USD)</Label>
              <Input
                type="number"
                className="mt-1 h-9"
                value={controls.totalValue}
                onChange={(e) => setControls((c) => ({ ...c, totalValue: Number(e.target.value) || 0 }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Position quantities are auto-scaled so market value equals the book value above. Current: {fmtUSD(controls.totalValue)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={applyPortfolio}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refresh */}
      <Button variant="default" className="h-9" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
        Recompute
      </Button>

      {/* Export CSV */}
      <Button
        variant="outline"
        className="h-9"
        onClick={() => {
          const posStr = controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(",");
          const baseUrl = useRealData ? "/api/var/real-report" : "/api/var/report";
          const url = `${baseUrl}?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(posStr)}`;
          window.open(url, "_blank");
        }}
      >
        <Download className="h-4 w-4 mr-2" />
        Export JSON
      </Button>

      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        <span>
          {controls.confidence * 100}% · {controls.horizon}d
          {!useRealData && ` · seed ${controls.seed}`}
          {useRealData && ` · 🟢 live data`}
        </span>
      </div>
    </div>
  );
}
