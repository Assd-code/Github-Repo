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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Plus, Trash2, RefreshCw, Settings2, Activity, Download } from "lucide-react";
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

const AVAILABLE_SYMBOLS = ["SPX", "AAPL", "XOM", "TLT", "EURUSD", "GOLD", "BTC"];

export function ControlBar({
  controls,
  setControls,
  onRefresh,
  loading,
}: {
  controls: VarControls;
  setControls: React.Dispatch<React.SetStateAction<VarControls>>;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [portfolioOpen, setPortfolioOpen] = React.useState(false);
  const [draftPositions, setDraftPositions] = React.useState(controls.positions);

  React.useEffect(() => {
    setDraftPositions(controls.positions);
  }, [controls.positions]);

  const updatePosition = (idx: number, field: "symbol" | "quantity", value: string) => {
    setDraftPositions((prev) => {
      const next = [...prev];
      if (field === "symbol") next[idx] = { ...next[idx], symbol: value };
      else next[idx] = { ...next[idx], quantity: Number(value) || 0 };
      return next;
    });
  };

  const addPosition = () => {
    const used = new Set(draftPositions.map((p) => p.symbol));
    const available = AVAILABLE_SYMBOLS.find((s) => !used.has(s));
    if (available) setDraftPositions([...draftPositions, { symbol: available, quantity: 1000 }]);
  };

  const removePosition = (idx: number) => {
    setDraftPositions(draftPositions.filter((_, i) => i !== idx));
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

      {/* Seed */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Market Seed</Label>
        <Input
          type="number"
          className="w-[90px] h-9"
          value={controls.seed}
          onChange={(e) => setControls((c) => ({ ...c, seed: Number(e.target.value) || 0 }))}
        />
      </div>

      {/* Portfolio */}
      <Dialog open={portfolioOpen} onOpenChange={setPortfolioOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="h-9">
            <Settings2 className="h-4 w-4 mr-2" />
            Portfolio
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Portfolio Positions</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-[1fr_140px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Symbol</span>
              <span>Quantity</span>
              <span />
            </div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {draftPositions.map((p, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_140px_40px] gap-2 items-center">
                  <Select
                    value={p.symbol}
                    onValueChange={(v) => updatePosition(idx, "symbol", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_SYMBOLS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
            </div>
            <Button variant="outline" size="sm" onClick={addPosition} disabled={draftPositions.length >= AVAILABLE_SYMBOLS.length}>
              <Plus className="h-4 w-4 mr-1" /> Add Position
            </Button>
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
          const url = `/api/var/export?confidence=${controls.confidence}&horizon=${controls.horizon}&method=${controls.method}&seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(posStr)}`;
          window.open(url, "_blank");
        }}
      >
        <Download className="h-4 w-4 mr-2" />
        Export CSV
      </Button>

      <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        <span>
          {controls.confidence * 100}% · {controls.horizon}d · seed {controls.seed}
        </span>
      </div>
    </div>
  );
}
