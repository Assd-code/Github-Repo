"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldAlert, ShieldCheck, ShieldX, Plus, Pencil, Trash2, Gauge } from "lucide-react";
import type { VarControls } from "./use-var-data";
import type { LimitMonitoring, VarLimitDef, Methodology } from "@/lib/var/types";
import { fmtUSD, fmtPct } from "@/lib/format";

const METHODS: { id: Methodology; label: string }[] = [
  { id: "historical", label: "Historical" },
  { id: "parametric", label: "Parametric" },
  { id: "montecarlo", label: "Monte Carlo" },
  { id: "filtered", label: "Filtered HS" },
  { id: "evt", label: "EVT" },
];

const STATUS_STYLE = {
  ok: { color: "text-emerald-500", bg: "bg-emerald-500/15", border: "border-emerald-500/40", Icon: ShieldCheck, label: "OK" },
  warning: { color: "text-amber-500", bg: "bg-amber-500/15", border: "border-amber-500/40", Icon: ShieldAlert, label: "WARNING" },
  breach: { color: "text-rose-500", bg: "bg-rose-500/15", border: "border-rose-500/40", Icon: ShieldX, label: "BREACH" },
};

export function LimitMonitoringPanel({ controls }: { controls: VarControls }) {
  const [data, setData] = React.useState<LimitMonitoring | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VarLimitDef | null>(null);

  const positionsStr = controls.positions.map((p) => `${p.symbol}:${p.quantity}`).join(",");

  const load = () => {
    setLoading(true);
    fetch("/api/var/limits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "monitor",
        seed: controls.seed,
        totalValue: controls.totalValue,
        positions: controls.positions,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.monitoring); })
      .finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, [controls.seed, controls.totalValue, positionsStr]);

  const worst = data?.worstStatus ?? "ok";
  const worstStyle = STATUS_STYLE[worst];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Gauge className="h-4 w-4 text-chart-3" />
              VaR Limit Monitoring
            </CardTitle>
            <CardDescription>
              Live VaR vs. persisted limits across desks · {data?.limits.length ?? 0} active limits
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${worstStyle.bg} ${worstStyle.color} ${worstStyle.border}`}>
              <worstStyle.Icon className="h-3 w-3 mr-1" />
              {worstStyle.label}
              {data && data.breachCount > 0 && ` · ${data.breachCount} breach${data.breachCount > 1 ? "es" : ""}`}
            </Badge>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditing(null); setEditOpen(true); }}>
              <Plus className="h-3 w-3 mr-1" /> Limit
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {loading && !data ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-md bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {data.readings.map((r) => {
              const st = STATUS_STYLE[r.status];
              const utilPct = Math.min(120, r.utilization * 100);
              return (
                <div key={r.limit.id} className={`rounded-lg border ${st.border} ${st.bg} px-3 py-2.5 group`}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <st.Icon className={`h-4 w-4 shrink-0 ${st.color}`} />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{r.limit.label}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.limit.scope} · {r.limit.method} · {(r.limit.confidence * 100).toFixed(0)}% · {r.limit.horizon}d
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-right">
                        <div className={`text-sm font-bold tabular-nums ${st.color}`}>{fmtUSD(r.var)}</div>
                        <div className="text-[10px] text-muted-foreground">/ {fmtUSD(r.limit.limitUsd)}</div>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { setEditing(r.limit); setEditOpen(true); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={utilPct}
                      className="h-2 flex-1"
                      // visual: red bar when over 100%
                    />
                    <span className={`text-[11px] font-semibold tabular-nums w-12 text-right ${st.color}`}>
                      {(r.utilization * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>headroom: {r.headroomUsd >= 0 ? fmtUSD(r.headroomUsd) : `−${fmtUSD(Math.abs(r.headroomUsd))} over`}</span>
                    <span>ES {fmtUSD(r.es)}</span>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
              Limits cascade from firm-wide → desk → trader. Breaches trigger escalation: soft limit (warning) → hard limit (forced risk reduction). Persistent breaches can revoke a desk&apos;s Internal Model Approval under FRTB.
            </p>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Failed to load limit data.</div>
        )}
      </CardContent>

      <LimitEditor
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={editing}
        onSaved={load}
      />
    </Card>
  );
}

function LimitEditor({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: VarLimitDef | null;
  onSaved: () => void;
}) {
  const [label, setLabel] = React.useState("");
  const [scope, setScope] = React.useState("portfolio:default");
  const [method, setMethod] = React.useState<Methodology>("historical");
  const [confidence, setConfidence] = React.useState("0.99");
  const [horizon, setHorizon] = React.useState("1");
  const [limitUsd, setLimitUsd] = React.useState("400000");
  const [softLimitUsd, setSoftLimitUsd] = React.useState("320000");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (editing) {
      setLabel(editing.label);
      setScope(editing.scope);
      setMethod(editing.method);
      setConfidence(String(editing.confidence));
      setHorizon(String(editing.horizon));
      setLimitUsd(String(editing.limitUsd));
      setSoftLimitUsd(editing.softLimitUsd != null ? String(editing.softLimitUsd) : "");
    } else {
      setLabel(""); setScope("portfolio:default"); setMethod("historical");
      setConfidence("0.99"); setHorizon("1"); setLimitUsd("400000"); setSoftLimitUsd("320000");
    }
  }, [editing, open]);

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/var/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert",
          id: editing?.id,
          label, scope, method,
          confidence: Number(confidence),
          horizon: Number(horizon),
          limitUsd: Number(limitUsd),
          softLimitUsd: softLimitUsd ? Number(softLimitUsd) : null,
          active: true,
        }),
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await fetch("/api/var/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: editing.id }),
      });
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Limit" : "Add VaR Limit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="text-xs">Label</Label>
            <Input className="h-9 mt-1" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Equities Desk (99%)" />
          </div>
          <div>
            <Label className="text-xs">Scope</Label>
            <Input className="h-9 mt-1" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="portfolio:default / desk:equities / trader:Alice" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Methodology)}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Confidence</Label>
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.95">95%</SelectItem>
                  <SelectItem value="0.99">99%</SelectItem>
                  <SelectItem value="0.995">99.5%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Horizon (days)</Label>
              <Input className="h-9 mt-1" type="number" value={horizon} onChange={(e) => setHorizon(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Hard limit (USD)</Label>
              <Input className="h-9 mt-1" type="number" value={limitUsd} onChange={(e) => setLimitUsd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Soft limit / warning (USD, optional)</Label>
            <Input className="h-9 mt-1" type="number" value={softLimitUsd} onChange={(e) => setSoftLimitUsd(e.target.value)} placeholder="e.g. 320000" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          {editing && (
            <Button variant="destructive" size="sm" onClick={del} disabled={saving} className="mr-auto">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
            </Button>
          )}
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={save} disabled={saving || !label}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
