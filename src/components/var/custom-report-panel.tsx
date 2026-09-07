"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, Loader2, Sparkles, Check, FileDown } from "lucide-react";
import type { VarControls } from "./use-var-data";
import type { Methodology } from "@/lib/var/types";

interface SectionOption {
  id: string;
  label: string;
  description: string;
}

const SECTION_OPTIONS: SectionOption[] = [
  { id: "var", label: "VaR Methodology Comparison", description: "Bar chart comparing VaR/ES across selected methods" },
  { id: "backtest", label: "Backtesting Results", description: "Kupiec, Christoffersen, Basel traffic-light zone" },
  { id: "stress", label: "Stress Testing", description: "7 historical/hypothetical scenarios with breach flags" },
  { id: "decomposition", label: "Risk Decomposition", description: "Component / incremental / standalone VaR by asset" },
  { id: "liquidity", label: "FRTB Liquidity-Adjusted VaR", description: "ES across 5 liquidity horizons + regulatory capital" },
  { id: "sensitivity", label: "Risk Factor Sensitivity", description: "DV01 per factor + parallel shock curve" },
  { id: "volatility", label: "Volatility Regime (GARCH)", description: "EWMA vol + GARCH(1,1) forecast + term structure" },
  { id: "optimizer", label: "Portfolio Optimization", description: "Risk parity / min variance / max Sharpe + efficient frontier" },
  { id: "concentration", label: "Concentration Risk", description: "HHI, effective N, diversification ratio, Lorenz curve" },
  { id: "performance", label: "Performance Metrics", description: "Sharpe, Sortino, Calmar, max drawdown, win rate" },
];

const METHOD_OPTIONS: { id: Methodology; label: string; color: string }[] = [
  { id: "parametric", label: "Parametric (Var-Cov)", color: "bg-chart-3/15 text-chart-3 border-chart-3/30" },
  { id: "historical", label: "Historical Simulation", color: "bg-chart-1/15 text-chart-1 border-chart-1/30" },
  { id: "montecarlo", label: "Monte Carlo", color: "bg-chart-2/15 text-chart-2 border-chart-2/30" },
  { id: "filtered", label: "Filtered HS (EWMA)", color: "bg-chart-5/15 text-chart-5 border-chart-5/30" },
  { id: "evt", label: "EVT (GPD)", color: "bg-chart-4/15 text-chart-4 border-chart-4/30" },
];

interface ReportResult {
  ok: boolean;
  pdfUrl?: string;
  htmlUrl?: string;
  portfolioName?: string;
  interpretation?: {
    pros: string[];
    cons: string[];
    recommendations: string[];
    summary: string;
  };
  error?: string;
}

export function CustomReportPanel({
  controls,
  useRealData,
  activePortfolioName,
}: {
  controls: VarControls;
  useRealData: boolean;
  activePortfolioName: string | null;
}) {
  const [selectedSections, setSelectedSections] = React.useState<string[]>(["var", "backtest", "stress", "decomposition"]);
  const [selectedMethods, setSelectedMethods] = React.useState<Methodology[]>(["historical", "parametric", "montecarlo"]);
  const [includeSummary, setIncludeSummary] = React.useState(true);
  const [includeInterpretation, setIncludeInterpretation] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [view, setView] = React.useState<"config" | "result">("config");

  const toggleSection = (id: string) => {
    setSelectedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleMethod = (id: Methodology) => {
    setSelectedMethods((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);
    try {
      const res = await fetch("/api/var/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: selectedSections,
          methods: selectedMethods,
          includeSummary,
          includeInterpretation,
          positions: controls.positions,
          totalValue: controls.totalValue,
          useRealData,
          portfolioName: activePortfolioName || "Untitled Portfolio",
          confidence: controls.confidence,
          horizon: controls.horizon,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(error?.error || "Report generation failed");
      }
      const html = await res.text();

      // Download as an HTML file that the user opens in their browser
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `VaR-Report-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      setResult({ ok: true });
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-2" />
              Custom Report Builder
            </CardTitle>
            <CardDescription>
              Choose sections · methods · charts · AI interpretation · export as graphical PDF
            </CardDescription>
          </div>
          {activePortfolioName && (
            <Badge variant="outline" className="text-chart-2 border-chart-2/30 bg-chart-2/10">
              {activePortfolioName}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {view === "config" ? (
          <>
            {/* Section selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                1. Select Analysis Sections ({selectedSections.length}/{SECTION_OPTIONS.length})
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SECTION_OPTIONS.map((s) => (
                  <label
                    key={s.id}
                    className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer transition-all hover:bg-muted/30 ${selectedSections.includes(s.id) ? "border-primary/40 bg-primary/5" : "border-border"}`}
                  >
                    <Checkbox
                      checked={selectedSections.includes(s.id)}
                      onCheckedChange={() => toggleSection(s.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{s.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Method selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2. Select VaR Methods ({selectedMethods.length}/{METHOD_OPTIONS.length})
              </Label>
              <div className="flex flex-wrap gap-2">
                {METHOD_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => toggleMethod(m.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${selectedMethods.includes(m.id) ? m.color : "border-border text-muted-foreground hover:bg-muted/30"}`}
                  >
                    {selectedMethods.includes(m.id) && <Check className="h-3 w-3 inline mr-1" />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Options */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                3. Report Options
              </Label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={includeInterpretation}
                    onCheckedChange={(v) => setIncludeInterpretation(!!v)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-chart-2" />
                      AI Interpretation (Pros / Cons / Recommendations)
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      LLM analyzes your portfolio and generates strengths, weaknesses, and actionable recommendations
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/30">
                  <Checkbox
                    checked={includeSummary}
                    onCheckedChange={(v) => setIncludeSummary(!!v)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium">
                      Brief Executive Summary
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      A 2-3 sentence summary at the end of the report with key findings
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <Separator />

            {/* Generate button */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleGenerate}
                disabled={generating || selectedSections.length === 0 || selectedMethods.length === 0}
                className="flex-1 h-10"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4 mr-2" />
                    Generate Graphical PDF Report
                  </>
                )}
              </Button>
            </div>
            {generating && (
              <div className="text-[11px] text-muted-foreground text-center">
                Fetching {useRealData ? "live market data" : "synthetic data"} · computing {selectedSections.length} sections · {includeInterpretation ? "AI interpretation · " : ""}rendering PDF...
              </div>
            )}
          </>
        ) : (
          /* Result view */
          result && result.ok ? (
            <div className="space-y-4">
              {/* Success banner */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <div className="text-sm font-semibold text-emerald-500">Report Generated Successfully!</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {result.portfolioName} · {selectedSections.length} sections · {selectedMethods.length} methods
                </div>
              </div>

              {/* AI Interpretation preview */}
              {result.interpretation && (
                <div className="space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Interpretation Preview</div>
                  {result.interpretation.summary && (
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-[10px] font-medium text-muted-foreground mb-1">Executive Summary</div>
                      <div className="text-xs leading-relaxed">{result.interpretation.summary}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                      <div className="text-[10px] font-medium text-emerald-500 mb-1">Strengths ({result.interpretation.pros.length})</div>
                      <ul className="space-y-1">
                        {result.interpretation.pros.slice(0, 3).map((p, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <span className="text-emerald-500 shrink-0">+</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                      <div className="text-[10px] font-medium text-rose-500 mb-1">Risk Concerns ({result.interpretation.cons.length})</div>
                      <ul className="space-y-1">
                        {result.interpretation.cons.slice(0, 3).map((c, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                            <span className="text-rose-500 shrink-0">-</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Success — report downloaded */}
              <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <Check className="h-6 w-6 text-emerald-500 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-emerald-500">Report downloaded!</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Open the downloaded HTML file, then use your browser’s Print command to save it as a PDF.
                  </div>
                </div>
              </div>

              <Button variant="ghost" size="sm" className="w-full" onClick={() => setView("config")}>
                ← Back to Configuration
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center">
                <div className="text-sm font-semibold text-rose-500">Report Generation Failed</div>
                <div className="text-[11px] text-muted-foreground mt-1">{result?.error || "Unknown error"}</div>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setView("config")}>
                ← Back to Configuration
              </Button>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
