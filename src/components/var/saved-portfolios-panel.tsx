"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { FolderOpen, Save, Trash2, Upload, Plus, Check } from "lucide-react";
import type { VarControls } from "./use-var-data";
import { fmtUSD } from "@/lib/format";

interface SavedPortfolio {
  id: string;
  name: string;
  description: string | null;
  totalValue: number;
  positions: { symbol: string; quantity: number }[];
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

export function SavedPortfoliosPanel({
  controls,
  setControls,
}: {
  controls: VarControls;
  setControls: React.Dispatch<React.SetStateAction<VarControls>>;
}) {
  const [portfolios, setPortfolios] = React.useState<SavedPortfolio[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [saveDesc, setSaveDesc] = React.useState("");
  const [saveTags, setSaveTags] = React.useState("");
  const [loadedName, setLoadedName] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    setLoading(true);
    fetch("/api/var/portfolios")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setPortfolios(j.portfolios);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/var/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          name: saveName.trim(),
          description: saveDesc.trim() || undefined,
          tags: saveTags.trim() || undefined,
          positions: controls.positions,
          totalValue: controls.totalValue,
        }),
      });
      const j = await res.json();
      if (j.ok) {
        showToast(`✓ Saved "${saveName.trim()}"`);
        setSaveOpen(false);
        setSaveName("");
        setSaveDesc("");
        setSaveTags("");
        refresh();
      } else {
        showToast(`✗ ${j.error || "Save failed"}`);
      }
    } catch (e) {
      showToast("✗ Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (name: string) => {
    try {
      const res = await fetch("/api/var/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load", name }),
      });
      const j = await res.json();
      if (j.ok) {
        const p = j.portfolio;
        setControls((c) => ({
          ...c,
          positions: p.positions,
          totalValue: p.totalValue,
        }));
        setLoadedName(name);
        showToast(`✓ Loaded "${name}"`);
      } else {
        showToast(`✗ ${j.error || "Load failed"}`);
      }
    } catch (e) {
      showToast("✗ Network error");
    }
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch("/api/var/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      showToast(`✓ Deleted "${name}"`);
      if (loadedName === name) setLoadedName(null);
      refresh();
    } catch (e) {
      showToast("✗ Delete failed");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-chart-5" />
              Saved Portfolios
            </CardTitle>
            <CardDescription>
              Save · load · manage named portfolios · {portfolios.length} saved
            </CardDescription>
          </div>
          <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="default" className="h-8">
                <Save className="h-3.5 w-3.5 mr-1" />
                Save Current
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save Current Portfolio</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Name *</Label>
                  <Input
                    className="mt-1 h-9"
                    placeholder="e.g. Q1 2024 Balanced Book"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Description (optional)</Label>
                  <Input
                    className="mt-1 h-9"
                    placeholder="e.g. 60/40 equity/bond split"
                    value={saveDesc}
                    onChange={(e) => setSaveDesc(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
                  <Input
                    className="mt-1 h-9"
                    placeholder="e.g. balanced, low-risk"
                    value={saveTags}
                    onChange={(e) => setSaveTags(e.target.value)}
                  />
                </div>
                <div className="rounded-md border bg-muted/20 p-2.5 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground mb-1">Portfolio snapshot:</div>
                  <div>{controls.positions.length} positions · {fmtUSD(controls.totalValue)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {controls.positions.map((p) => (
                      <span key={p.symbol} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                        {p.symbol}:{p.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={!saveName.trim() || saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Loading saved portfolios…</div>
        ) : portfolios.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">No saved portfolios yet. Click "Save Current" to create one.</div>
        ) : (
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto scrollbar-thin pr-1">
            {portfolios.map((p) => {
              const isActive = loadedName === p.name;
              const tags = p.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-2.5 cursor-pointer transition-all hover:shadow-sm hover:border-primary/30 ${isActive ? "border-primary/40 bg-primary/5 ring-glow" : "bg-card hover:bg-muted/20"}`}
                  onClick={() => handleLoad(p.name)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isActive && <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                        <span className="text-sm font-semibold truncate">{p.name}</span>
                      </div>
                      {p.description && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="tabular-nums">{fmtUSD(p.totalValue)}</span>
                        <span>·</span>
                        <span>{p.positions.length} positions</span>
                        {tags.length > 0 && (
                          <>
                            <span>·</span>
                            <div className="flex flex-wrap gap-1">
                              {tags.map((t) => (
                                <span key={t} className="rounded bg-muted px-1 py-0 text-[9px]">{t}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => handleDelete(p.id, p.name, e)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {toast && (
          <div className="fixed bottom-4 right-4 z-50 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg animate-in fade-in slide-in-from-bottom-2">
            {toast}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
          Save the current portfolio under a name to compare different books or preserve a snapshot for compliance. Click any saved portfolio to load it — all panels re-compute with the new positions. Portfolios persist in the database across sessions.
        </p>
      </CardContent>
    </Card>
  );
}
