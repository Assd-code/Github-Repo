import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { buildFullReport, DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { PortfolioConfig, Methodology } from "@/lib/var/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePortfolio(q: URLSearchParams): PortfolioConfig {
  const posParam = q.get("positions");
  const total = Number(q.get("totalValue") ?? DEFAULT_PORTFOLIO.totalValue);
  let positions = DEFAULT_PORTFOLIO.positions;
  if (posParam) {
    try {
      positions = posParam
        .split(",").map((s) => s.trim()).filter(Boolean)
        .map((pair) => {
          const [symbol, qty] = pair.split(":");
          return { symbol: symbol.toUpperCase(), quantity: Number(qty) };
        })
        .filter((p) => p.symbol && Number.isFinite(p.quantity) && p.quantity !== 0);
      if (positions.length === 0) positions = DEFAULT_PORTFOLIO.positions;
    } catch {
      positions = DEFAULT_PORTFOLIO.positions;
    }
  }
  return { positions, totalValue: total };
}

function csvRow(cells: (string | number)[]): string {
  return cells
    .map((c) => {
      const s = String(c);
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(",");
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  const horizon = Math.min(20, Math.max(1, Math.round(Number(q.get("horizon") ?? 1))));
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const primary = (q.get("method") as Methodology) || "historical";
  const portfolio = parsePortfolio(q);

  try {
    const market = getMarketData(days, seed);
    const report = buildFullReport(market, portfolio, confidence, horizon, primary);

    const lines: string[] = [];
    lines.push("# VaR Lab Risk Report");
    lines.push(`# Generated: ${report.generatedAt}`);
    lines.push(`# Confidence: ${(confidence * 100).toFixed(1)}%  Horizon: ${horizon}d  Method: ${primary}  Seed: ${seed}`);
    lines.push(`# Portfolio value: $${report.portfolio.totalValue.toLocaleString()}`);
    lines.push("");

    // Portfolio holdings
    lines.push("## Portfolio Holdings");
    lines.push(csvRow(["Symbol", "Name", "Asset Class", "Quantity", "Market Value", "Weight"]));
    for (const p of report.portfolio.positions) {
      lines.push(csvRow([p.symbol, p.name, p.assetClass, p.quantity, p.marketValue.toFixed(2), (p.weight * 100).toFixed(2) + "%"]));
    }
    lines.push("");

    // VaR by methodology
    lines.push("## VaR by Methodology");
    lines.push(csvRow(["Methodology", "VaR ($)", "VaR (%)", "ES ($)", "ES (%)", "Mean P&L ($)", "Std P&L ($)", "Worst ($)", "Best ($)", "Compute (ms)"]));
    for (const m of ["parametric", "historical", "montecarlo", "filtered", "evt"] as Methodology[]) {
      const r = report.results[m];
      lines.push(csvRow([m, r.var.toFixed(2), (r.varPct * 100).toFixed(4) + "%", r.es.toFixed(2), (r.esPct * 100).toFixed(4) + "%", r.meanPnl.toFixed(2), r.stdPnl.toFixed(2), r.worst.toFixed(2), r.best.toFixed(2), r.elapsedMs]));
    }
    lines.push("");

    // Backtesting
    lines.push("## Backtesting");
    lines.push(csvRow(["Methodology", "Confidence", "Window", "Exceptions", "Expected", "Exception Rate", "Kupiec LR", "Kupiec p", "CC LR", "CC p", "Zone", "Multiplier"]));
    const bt = report.backtest;
    lines.push(csvRow([bt.methodology, bt.confidence, bt.window, bt.exceptionCount, bt.expectedExceptions.toFixed(2), (bt.exceptionRate * 100).toFixed(4) + "%", bt.kupiec.lr.toFixed(4), bt.kupiec.pValue.toExponential(3), bt.christoffersen.ccLR.toFixed(4), bt.christoffersen.ccP.toExponential(3), bt.zone, bt.zoneMultiplier.toFixed(2) + "x"]));
    lines.push("");

    // Decomposition
    lines.push("## Risk Decomposition");
    lines.push(csvRow(["Symbol", "Name", "Weight", "Marginal VaR ($)", "Component VaR ($)", "Component Share", "Incremental VaR ($)", "Standalone VaR ($)"]));
    for (const a of report.decomposition.perAsset) {
      lines.push(csvRow([a.symbol, a.name, (a.weight * 100).toFixed(2) + "%", a.marginalVar.toFixed(2), a.componentVar.toFixed(2), (a.componentShare * 100).toFixed(2) + "%", a.incrementalVar.toFixed(2), a.standaloneVar.toFixed(2)]));
    }
    lines.push("");

    // Stress testing
    lines.push("## Stress Testing");
    lines.push(csvRow(["Scenario", "Type", "P&L ($)", "P&L (%)", "Breaches VaR", "Worst Contributor", "Worst Contributor P&L ($)"]));
    for (const s of report.stress) {
      lines.push(csvRow([s.scenario.name, s.scenario.type, s.pnl.toFixed(2), (s.pnlPct * 100).toFixed(4) + "%", s.breachesVar ? "YES" : "NO", s.worstContributor.symbol, s.worstContributor.pnl.toFixed(2)]));
    }
    lines.push("");

    // Liquidity-adjusted VaR
    lines.push("## Liquidity-Adjusted VaR (FRTB)");
    lines.push(csvRow(["Horizon (days)", "ES ($)", "Ratio to 10d", "Capital ($)", "Aggregated ES ($)", "Regulatory Capital ($)"]));
    for (const h of report.liquidity.horizons) {
      lines.push(csvRow([h.horizon, h.es.toFixed(2), h.ratio.toFixed(4), h.capital.toFixed(2), report.liquidity.aggregatedEs.toFixed(2), report.liquidity.regulatoryCapital.toFixed(2)]));
    }
    lines.push("");

    // Reverse stress
    lines.push("## Reverse Stress Testing");
    lines.push(csvRow(["Target Loss (%)", "Target Loss ($)", "Shock Factor", "Margin to Ruin (%)"]));
    lines.push(csvRow([(report.reverseStress.targetLossPct * 100).toFixed(1) + "%", report.reverseStress.targetLoss.toFixed(2), report.reverseStress.shockFactor.toFixed(4), (report.reverseStress.marginToRuin * 100).toFixed(2) + "%"]));
    lines.push(csvRow(["Asset Class", "Shock (%)", "P&L ($)"]));
    for (const a of report.reverseStress.perAssetClass) {
      lines.push(csvRow([a.assetClass, (a.shock * 100).toFixed(2) + "%", a.pnl.toFixed(2)]));
    }
    lines.push("");

    // P&L Attribution
    lines.push("## P&L Attribution (FRTB PLA)");
    lines.push(csvRow(["Spearman Correlation", "Mean |Residual| (%)", "Zone"]));
    lines.push(csvRow([report.pnlAttribution.spearmanCorrelation.toFixed(6), (report.pnlAttribution.meanAbsResidualPct * 100).toFixed(4) + "%", report.pnlAttribution.zone]));
    lines.push("");

    // VaR trend
    lines.push("## VaR Trend (rolling)");
    lines.push(csvRow(["Date", "VaR ($)", "Realized P&L ($)", "Exception"]));
    for (const p of report.trend.points) {
      lines.push(csvRow([p.date, p.var.toFixed(2), p.pnl.toFixed(2), p.exception ? "YES" : "NO"]));
    }

    const csv = lines.join("\n");
    const filename = `var-report-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
