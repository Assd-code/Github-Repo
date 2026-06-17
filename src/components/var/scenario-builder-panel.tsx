"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from "recharts";
import {
  FlaskConical, Save, Play, Trash2, AlertOctagon, CheckCircle2, Wand2, Download, Upload,
} from "lucide-react";
import type { VarControls } from "./use-var-data";
import type { CustomScenarioResult, AssetClass } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const CLASS_COLOR: Record<AssetClass, string> = {
  equity: "var(--chart-1)",
  fx: "var(--chart-2)",
  commodity: "var(--chart-5)",
  rate: "var(--chart-3)",
  crypto: "var(--chart-4)",
};

interface SavedScenarioItem {
  scenario: { id?: string; name: string; description: string; shocks: Record<string, number> };
  result: CustomScenarioResult;
}

export function ScenarioBuilderPanel({ controls }: { controls: VarControls }) {
  const [assets, setAssets] = React.useState<{ symbol: string; name: string; assetClass: AssetClass }[]>([]);
  const [shocks, setShocks] = React.useState<Record<string, number>>({});
  const [name, setName] = React.useState("My Scenario");
  const [description, setDescription] = React.useState("");
  const [saved, setSaved] = React.useState<SavedScenarioItem[]>([]);
  const [activeResult, setActiveResult] = React.useState<CustomScenarioResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const positionsStr = controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(",");

  // Load saved scenarios + asset universe on mount / control change.
  const loadSaved = () => {
    fetch(`/api/var/scenarios?seed=${controls.seed}&totalValue=${controls.totalValue}&positions=${encodeURIComponent(positionsStr)}&confidence=${controls.confidence}&horizon=${controls.horizon}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setAssets(d.assets);
          setSaved(d.scenarios);
          if (!activeResult && d.scenarios.length > 0) {
            setShocks(normalizeShocks(d.scenarios[0].scenario.shocks, d.assets));
            setActiveResult(d.scenarios[0].result);
            setName(d.scenarios[0].scenario.name);
            setDescription(d.scenarios[0].scenario.description);
          } else if (Object.keys(shocks).length === 0 && d.assets.length > 0) {
            const init: Record<string, number> = {};
            for (const a of d.assets) init[a.symbol] = 1.0;
            setShocks(init);
          }
        }
      })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { loadSaved(); }, [controls.seed, controls.totalValue, positionsStr, controls.confidence, controls.horizon]);

  function normalizeShocks(s: Record<string, number>, assetList: { symbol: string }[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of assetList) out[a.symbol] = s[a.symbol] ?? 1.0;
    return out;
  }

  const runAdHoc = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/var/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          name,
          description,
          shocks,
          seed: controls.seed,
          totalValue: controls.totalValue,
          positions: controls.positions,
          confidence: controls.confidence,
          horizon: controls.horizon,
        }),
      }).then((r) => r.json());
      if (res.ok) setActiveResult(res.result);
    } finally {
      setSaving(false);
    }
  };

  const saveScenario = async () => {
    setSaving(true);
    try {
      await fetch("/api/var/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", name, description, shocks }),
      });
      await loadSaved();
    } finally {
      setSaving(false);
    }
  };

  const deleteScenario = async (id?: string) => {
    if (!id) return;
    await fetch("/api/var/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id }),
    });
    await loadSaved();
  };

  const exportScenarios = () => {
    const data = JSON.stringify(saved.map((s) => ({
      name: s.scenario.name,
      description: s.scenario.description,
      shocks: s.scenario.shocks,
    })), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `var-scenarios-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importScenarios = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const scenarios = JSON.parse(text);
      if (!Array.isArray(scenarios)) throw new Error("Expected a JSON array");
      const res = await fetch("/api/var/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", scenarios }),
      }).then((r) => r.json());
      if (res.ok) {
        await loadSaved();
      }
    } catch {
      // invalid JSON — silently ignore
    }
    e.target.value = "";
  };

  const applyPreset = (s: SavedScenarioItem) => {
    setShocks(normalizeShocks(s.scenario.shocks, assets));
    setActiveResult(s.result);
    setName(s.scenario.name);
    setDescription(s.scenario.description);
  };

  const applyQuickPreset = (kind: "crash" | "rally" | "neutral") => {
    const next = { ...shocks };
    for (const a of assets) {
      if (kind === "crash") {
        next[a.symbol] = a.assetClass === "rate" ? 1.05 : a.assetClass === "commodity" ? 0.95 : 0.85;
      } else if (kind === "rally") {
        next[a.symbol] = a.assetClass === "rate" ? 0.97 : 1.08;
      } else {
        next[a.symbol] = 1.0;
      }
    }
    setShocks(next);
  };

  const chartData = activeResult
    ? activeResult.perAsset.map((a) => ({
        symbol: a.symbol,
        pnl: Math.round(a.pnl),
        assetClass: a.assetClass,
        shock: a.shock,
      }))
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-chart-4" />
              Scenario Builder
            </CardTitle>
            <CardDescription>
              Define custom shock matrices · save & re-run scenarios · {saved.length} saved
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => applyQuickPreset("neutral")}>
              <Wand2 className="h-3 w-3 mr-1" /> Neutral
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-500" onClick={() => applyQuickPreset("crash")}>
              <Wand2 className="h-3 w-3 mr-1" /> Crash
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-emerald-500" onClick={() => applyQuickPreset("rally")}>
              <Wand2 className="h-3 w-3 mr-1" /> Rally
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={exportScenarios} disabled={saved.length === 0} title="Export saved scenarios as JSON">
              <Download className="h-3 w-3 mr-1" /> Export
            </Button>
            <label className="inline-flex items-center gap-1 text-xs cursor-pointer rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground h-7 px-2.5" title="Import scenarios from JSON">
              <Upload className="h-3 w-3" /> Import
              <input type="file" accept=".json,application/json" onChange={importScenarios} className="hidden" />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Shock editor */}
        <div className="rounded-lg border bg-muted/20 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Scenario name</Label>
              <Input className="h-8 mt-0.5 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Description</Label>
              <Input className="h-8 mt-0.5 text-xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" />
            </div>
          </div>
          <div className="space-y-1.5">
            {assets.map((a) => {
              const v = shocks[a.symbol] ?? 1;
              const pct = (v - 1) * 100;
              return (
                <div key={a.symbol} className="grid grid-cols-[60px_1fr_70px] items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: CLASS_COLOR[a.assetClass] }} />
                    <span className="text-xs font-mono font-semibold">{a.symbol}</span>
                  </div>
                  <Slider
                    value={[Math.round(v * 100)]}
                    onValueChange={(val) => setShocks((s) => ({ ...s, [a.symbol]: val[0] / 100 }))}
                    min={40}
                    max={160}
                    step={1}
                    className="w-full"
                  />
                  <div className={`text-xs font-semibold tabular-nums text-right ${pct < 0 ? "text-rose-500" : pct > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {pct >= 0 ? "+" : ""}{pct.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" className="h-8" onClick={runAdHoc} disabled={saving}>
              <Play className="h-3.5 w-3.5 mr-1" /> Run scenario
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={saveScenario} disabled={saving || !name}>
              <Save className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>

        {/* Result chart */}
        {activeResult && (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2">
                {activeResult.breachesVar ? (
                  <AlertOctagon className="h-4 w-4 text-rose-500" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <div>
                  <div className="text-xs font-semibold">{activeResult.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    worst: {activeResult.worstContributor.symbol} · best: {activeResult.bestContributor.symbol}
                    {activeResult.breachesVar && " · breaches VaR"}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-bold tabular-nums ${activeResult.pnl < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                {fmtUSD(activeResult.pnl)} <span className="text-[10px] text-muted-foreground font-normal">({fmtPct(activeResult.pnlPct)})</span>
              </div>
            </div>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v) => fmtUSD(v)} />
                  <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11 }} className="fill-muted-foreground" width={56} />
                  <Tooltip
                    formatter={(v: number) => fmtUSD(v)}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
                  <Bar dataKey="pnl" name="P&L" radius={[0, 3, 3, 0]} maxBarSize={18}>
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.pnl < 0 ? "var(--chart-1)" : "var(--chart-2)"} />
                    ))}
                    <LabelList dataKey="pnl" position="right" formatter={(v: number) => fmtUSD(v)} style={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Saved scenarios */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Saved scenarios</div>
          {saved.length === 0 && (
            <div className="text-xs text-muted-foreground italic px-2 py-1">No saved scenarios yet. Build one above and click Save.</div>
          )}
          {saved.map((s) => (
            <div key={s.scenario.id} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 group hover:bg-muted/30 transition-colors">
              <button className="flex-1 min-w-0 text-left" onClick={() => applyPreset(s)}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{s.scenario.name}</span>
                  <span className={`text-[11px] font-semibold tabular-nums shrink-0 ${s.result.pnl < 0 ? "text-rose-500" : "text-emerald-500"}`}>
                    {fmtUSD(s.result.pnl)}
                  </span>
                </div>
                {s.scenario.description && <div className="text-[10px] text-muted-foreground truncate">{s.scenario.description}</div>}
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0" onClick={() => deleteScenario(s.scenario.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
