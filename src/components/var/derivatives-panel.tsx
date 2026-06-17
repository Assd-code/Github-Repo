"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine, LineChart, Line, Legend,
} from "recharts";
import { Sigma, TrendingDown, Plus, Pencil, Trash2 } from "lucide-react";
import type { DerivativesAnalysis, OptionPosition } from "@/lib/var/types";
import { fmtUSD, fmtNum } from "@/lib/format";

const METHOD_COLOR = {
  deltaOnly: "var(--chart-3)",
  deltaGamma: "var(--chart-2)",
  fullReval: "var(--chart-1)",
};

const UNDERLYINGS = ["SPX", "AAPL", "XOM", "TLT", "EURUSD", "GOLD", "BTC"];

export function DerivativesPanel() {
  const [data, setData] = React.useState<DerivativesAnalysis | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OptionPosition | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/var/derivatives?confidence=0.99")
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.analysis); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  const saveOption = async (opt: OptionPosition) => {
    // For simplicity, we send the full list with the edit applied.
    // The API currently uses defaults; in a full implementation we'd persist
    // the option book. For now we just re-fetch defaults.
    setEditOpen(false);
    load();
  };

  if (loading || !data) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sigma className="h-4 w-4 text-chart-4" /> Derivatives &amp; Greeks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px] rounded-md bg-muted/30 animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const varData = [
    { method: "Delta-only", value: data.varComparison.deltaOnly, color: METHOD_COLOR.deltaOnly },
    { method: "Delta-Gamma", value: data.varComparison.deltaGamma, color: METHOD_COLOR.deltaGamma },
    { method: "Full Reval", value: data.varComparison.fullReval, color: METHOD_COLOR.fullReval },
  ];

  const sensitivityChart = data.sensitivities.length > 0
    ? data.sensitivities[0].moves.map((m, i) => {
        const row: Record<string, number> = { pct: m.pct };
        for (const s of data.sensitivities) {
          row[s.underlying + " (full)"] = s.moves[i].fullPnl;
        }
        return row;
      })
    : [];

  const gammaAdj = data.varComparison.gammaAdjustPct;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Sigma className="h-4 w-4 text-chart-4" />
              Derivatives &amp; Greeks
            </CardTitle>
            <CardDescription>
              {data.positions.length} option positions · Black-Scholes pricing · delta-gamma VaR vs full revaluation
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={gammaAdj < 0 ? "border-emerald-500/40 text-emerald-500" : "border-rose-500/40 text-rose-500"}>
              <TrendingDown className="h-3 w-3 mr-1" />
              gamma adj {gammaAdj >= 0 ? "+" : ""}{gammaAdj.toFixed(1)}%
            </Badge>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditing(null); setEditOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Position
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Portfolio Greeks summary */}
        <div className="grid grid-cols-5 gap-2">
          <GreekStat label="Delta" value={fmtNum(data.portfolioGreeks.delta, 0)} sub="∂V/∂S" />
          <GreekStat label="Gamma" value={fmtNum(data.portfolioGreeks.gamma, 1)} sub="∂²V/∂S²" />
          <GreekStat label="Vega" value={fmtUSD(data.portfolioGreeks.vega / 100)} sub="per 1% vol" />
          <GreekStat label="Theta" value={fmtUSD(data.portfolioGreeks.theta)} sub="per day" />
          <GreekStat label="Rho" value={fmtUSD(data.portfolioGreeks.rho)} sub="per 1% rate" />
        </div>

        {/* VaR comparison chart */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">VaR Method Comparison</div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={varData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={56} />
                <Tooltip
                  formatter={(v: number) => fmtUSD(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="value" name="VaR" radius={[4, 4, 0, 0]} maxBarSize={64}>
                  {varData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Delta-only VaR misses convexity. Delta-gamma adds ½Γ·dS² — capturing how gamma reduces risk for short options and increases it for long options. Full revaluation is the ground truth.
          </p>
        </div>

        {/* Positions table */}
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Option Positions</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8 text-xs">Symbol</TableHead>
                  <TableHead className="h-8 text-xs">Type</TableHead>
                  <TableHead className="h-8 text-xs text-right">Qty</TableHead>
                  <TableHead className="h-8 text-xs text-right">Strike</TableHead>
                  <TableHead className="h-8 text-xs text-right">Mat (y)</TableHead>
                  <TableHead className="h-8 text-xs text-right">IV</TableHead>
                  <TableHead className="h-8 text-xs text-right">Delta</TableHead>
                  <TableHead className="h-8 text-xs text-right">Gamma</TableHead>
                  <TableHead className="h-8 text-xs text-right">Vega</TableHead>
                  <TableHead className="h-8 text-xs text-right">Price</TableHead>
                  <TableHead className="h-8 text-xs text-right">MV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.positions.map((p) => (
                  <TableRow key={p.symbol} className="group">
                    <TableCell className="py-2 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold">{p.symbol}</span>
                        <span className="text-[10px] text-muted-foreground">{p.underlying} · {p.direction}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs">
                      <Badge variant="outline" className={p.type === "call" ? "text-emerald-500 border-emerald-500/40" : "text-rose-500 border-rose-500/40"}>
                        {p.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.quantity}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.strike.toFixed(2)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.maturity.toFixed(2)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{(p.impliedVol * 100).toFixed(0)}%</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.delta.toFixed(3)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.gamma.toFixed(4)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">{p.greeks.vega.toFixed(1)}</TableCell>
                    <TableCell className="py-2 text-xs text-right tabular-nums">${p.greeks.price.toFixed(2)}</TableCell>
                    <TableCell className={`py-2 text-xs text-right tabular-nums ${p.marketValue < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                      {fmtUSD(p.marketValue)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Sensitivity profile */}
        {data.sensitivities.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              P&amp;L Sensitivity to Underlying Moves (full revaluation)
            </div>
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sensitivityChart} margin={{ top: 4, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" vertical={false} />
                  <XAxis dataKey="pct" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => `${v}%`} />
                  <YAxis tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} width={56} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    labelFormatter={(v) => `${v}% move`}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
                  {data.sensitivities.map((s, i) => (
                    <Line
                      key={s.underlying}
                      type="monotone"
                      dataKey={`${s.underlying} (full)`}
                      stroke={["var(--chart-1)", "var(--chart-2)", "var(--chart-4)"][i % 3]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>

      <OptionEditor open={editOpen} onOpenChange={setEditOpen} editing={editing} onSaved={saveOption} />
    </Card>
  );
}

function GreekStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-2 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function OptionEditor({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: OptionPosition | null;
  onSaved: (opt: OptionPosition) => void;
}) {
  const [symbol, setSymbol] = React.useState("");
  const [underlying, setUnderlying] = React.useState("SPX");
  const [type, setType] = React.useState<"call" | "put">("call");
  const [direction, setDirection] = React.useState<"long" | "short">("long");
  const [quantity, setQuantity] = React.useState("50");
  const [contractSize, setContractSize] = React.useState("100");
  const [strike, setStrike] = React.useState("5200");
  const [maturity, setMaturity] = React.useState("0.25");
  const [impliedVol, setImpliedVol] = React.useState("0.16");
  const [riskFreeRate, setRiskFreeRate] = React.useState("0.045");

  React.useEffect(() => {
    if (editing) {
      setSymbol(editing.symbol);
      setUnderlying(editing.underlying);
      setType(editing.type);
      setDirection(editing.direction);
      setQuantity(String(editing.quantity));
      setContractSize(String(editing.contractSize));
      setStrike(String(editing.strike));
      setMaturity(String(editing.maturity));
      setImpliedVol(String(editing.impliedVol));
      setRiskFreeRate(String(editing.riskFreeRate));
    } else {
      setSymbol(""); setUnderlying("SPX"); setType("call"); setDirection("long");
      setQuantity("50"); setContractSize("100"); setStrike("5200"); setMaturity("0.25");
      setImpliedVol("0.16"); setRiskFreeRate("0.045");
    }
  }, [editing, open]);

  const save = () => {
    onSaved({
      symbol: symbol || `${underlying}-${type.toUpperCase()}`,
      underlying, type, direction,
      quantity: Number(quantity),
      contractSize: Number(contractSize),
      strike: Number(strike),
      maturity: Number(maturity),
      impliedVol: Number(impliedVol),
      riskFreeRate: Number(riskFreeRate),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Option Position" : "Add Option Position"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Symbol</Label>
              <Input className="h-9 mt-1" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. SPX-CALL-5200" />
            </div>
            <div>
              <Label className="text-xs">Underlying</Label>
              <Select value={underlying} onValueChange={setUnderlying}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNDERLYINGS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "call" | "put")}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="put">Put</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "long" | "short")}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="long">Long</SelectItem>
                  <SelectItem value="short">Short</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Quantity</Label>
              <Input className="h-9 mt-1" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Contract Size</Label>
              <Input className="h-9 mt-1" type="number" value={contractSize} onChange={(e) => setContractSize(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Strike</Label>
              <Input className="h-9 mt-1" type="number" value={strike} onChange={(e) => setStrike(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Maturity (years)</Label>
              <Input className="h-9 mt-1" type="number" step="0.01" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Implied Vol (decimal)</Label>
              <Input className="h-9 mt-1" type="number" step="0.01" value={impliedVol} onChange={(e) => setImpliedVol(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Risk-free Rate</Label>
              <Input className="h-9 mt-1" type="number" step="0.005" value={riskFreeRate} onChange={(e) => setRiskFreeRate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={save}>{editing ? "Update" : "Add"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
