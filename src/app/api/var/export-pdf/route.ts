// Report Export — returns a self-contained HTML report directly.
// No file saving, no Playwright, no external dependencies.
// The browser opens the HTML in a new tab with a "Print to PDF" button.

import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { PortfolioConfig, Methodology, FullReport } from "@/lib/var/types";
import { buildFullReport } from "@/lib/var/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

function fmtUSD(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

function generateInterpretation(report: FullReport, portfolioName: string) {
  const pros: string[] = [];
  const cons: string[] = [];
  const recs: string[] = [];

  if (report.backtest.zone === "green")
    pros.push(`Backtest GREEN zone (${report.backtest.exceptionCount} exceptions vs ${report.backtest.expectedExceptions.toFixed(1)} expected)`);
  if (report.pnlAttribution.zone === "green")
    pros.push(`P&L attribution PASSED (rho=${report.pnlAttribution.spearmanCorrelation.toFixed(3)})`);
  const divRatio = report.decomposition.perAsset.reduce((s, a) => s + a.standaloneVar, 0) / Math.max(report.results.historical.var, 1);
  if (divRatio > 1.5)
    pros.push(`Good diversification (${divRatio.toFixed(2)}x ratio)`);

  const breachCount = report.stress.filter((s) => s.breachesVar).length;
  if (breachCount > 3)
    cons.push(`${breachCount}/${report.stress.length} stress scenarios breach VaR`);
  const topWeight = Math.max(...report.portfolio.positions.map((p) => p.weight));
  if (topWeight > 0.4)
    cons.push(`High concentration (${(topWeight * 100).toFixed(0)}% in one position)`);
  const regCapPct = report.liquidity.regulatoryCapital / report.portfolio.totalValue;
  if (regCapPct > 0.2)
    cons.push(`High regulatory capital (${(regCapPct * 100).toFixed(1)}% of book)`);

  recs.push("Reduce concentration in largest position");
  recs.push("Monitor backtest exception rate monthly");
  if (breachCount > 3) recs.push("Add tail hedges (put options or bear ETFs)");
  recs.push("Review FRTB liquidity horizons");

  const summary = `${portfolioName}: 99% 1-day VaR ${fmtUSD(report.results.historical.var)} (${fmtPct(report.results.historical.varPct)} of book). Backtest ${report.backtest.zone.toUpperCase()} zone. ${breachCount}/${report.stress.length} stress breaches. Regulatory capital ${fmtUSD(report.liquidity.regulatoryCapital)}.`;
  return { pros, cons, recommendations: recs, summary };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = {
      sections: body.sections || ["var", "backtest", "stress"],
      methods: body.methods || ["historical", "parametric"],
      includeSummary: body.includeSummary ?? true,
      includeInterpretation: body.includeInterpretation ?? true,
      confidence: body.confidence ?? 0.99,
      horizon: body.horizon ?? 1,
    };
    const portfolio: PortfolioConfig = {
      positions: body.positions || DEFAULT_PORTFOLIO.positions,
      totalValue: body.totalValue || DEFAULT_PORTFOLIO.totalValue,
    };
    const useRealData = body.useRealData ?? false;
    const portfolioName = body.portfolioName || "My Portfolio";

    const market = getMarketData(504, 42);
    const report = buildFullReport(market, portfolio, config.confidence, config.horizon, "historical");
    const interpretation = config.includeInterpretation
      ? generateInterpretation(report, portfolioName)
      : null;

    const methods = config.methods as Methodology[];
    const sections = config.sections as string[];
    const worstStress = report.stress.reduce((acc, s) => (s.pnl < acc.pnl ? s : acc), report.stress[0]);

    // Build SVG charts
    const maxVar = Math.max(...methods.map((m) => report.results[m].var));
    const varBars = methods.map((m, i) => {
      const r = report.results[m];
      const h = (r.var / maxVar) * 160;
      const w = 70;
      const x = 60 + i * (w + 15);
      const y = 180 - h;
      const labels: Record<string, string> = { parametric: "Parametric", historical: "Historical", montecarlo: "Monte Carlo", filtered: "Filtered HS", evt: "EVT" };
      const colors: Record<string, string> = { parametric: "#3b82f6", historical: "#f43f5e", montecarlo: "#22c55e", filtered: "#eab308", evt: "#a855f7" };
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colors[m]}" rx="4"/><text x="${x + w/2}" y="${y - 6}" text-anchor="middle" fill="#e2e8f0" font-size="11" font-weight="bold">${fmtUSD(r.var)}</text><text x="${x + w/2}" y="198" text-anchor="middle" fill="#94a3b8" font-size="10">${labels[m]}</text>`;
    }).join("");

    const maxStress = Math.max(...report.stress.map((s) => Math.abs(s.pnl)));
    const stressBars = report.stress.map((s, i) => {
      const bw = (Math.abs(s.pnl) / maxStress) * 280;
      const y = 20 + i * 28;
      const color = s.breachesVar ? "#f43f5e" : "#22c55e";
      return `<text x="115" y="${y + 14}" text-anchor="end" fill="#cbd5e1" font-size="10">${s.scenario.name.slice(0, 22)}</text><rect x="120" y="${y}" width="${bw}" height="18" fill="${color}" opacity="0.7" rx="3"/><text x="${120 + bw + 6}" y="${y + 13}" fill="#e2e8f0" font-size="10" font-weight="bold">${s.pnl < 0 ? "-" : "+"}${fmtUSD(Math.abs(s.pnl))}</text>`;
    }).join("");

    const posRows = report.portfolio.positions.sort((a, b) => b.marketValue - a.marketValue).map((p) =>
      `<tr><td style="padding:5px 10px;border-bottom:1px solid #1e293b;font-weight:bold;color:#e2e8f0;">${p.symbol}</td><td style="padding:5px 10px;border-bottom:1px solid #1e293b;color:#94a3b8;">${p.name}</td><td style="padding:5px 10px;border-bottom:1px solid #1e293b;text-align:right;">${fmtPct(p.weight, 1)}</td><td style="padding:5px 10px;border-bottom:1px solid #1e293b;text-align:right;">${fmtUSD(p.marketValue)}</td></tr>`
    ).join("");

    const methodRows = methods.map((m) => {
      const r = report.results[m];
      const labels: Record<string, string> = { parametric: "Parametric", historical: "Historical", montecarlo: "Monte Carlo", filtered: "Filtered HS", evt: "EVT" };
      return `<tr><td style="padding:5px 10px;font-weight:bold;">${labels[m]}</td><td style="padding:5px 10px;text-align:right;color:#f43f5e;">${fmtUSD(r.var)}</td><td style="padding:5px 10px;text-align:right;color:#eab308;">${fmtUSD(r.es)}</td><td style="padding:5px 10px;text-align:right;">${(r.es / r.var).toFixed(2)}x</td></tr>`;
    }).join("");

    let sectionsHTML = "";
    if (sections.includes("var"))
      sectionsHTML += `<div class="card"><h2>VaR Methodology Comparison</h2><div class="chart-box"><svg width="100%" height="220" viewBox="0 0 ${60 + methods.length * 85} 220"><line x1="0" y1="180" x2="${60 + methods.length * 85}" y2="180" stroke="#334155"/>${varBars}</svg></div><table class="tbl"><tr><th>Method</th><th>VaR</th><th>ES</th><th>ES/VaR</th></tr>${methodRows}</table></div>`;
    if (sections.includes("stress"))
      sectionsHTML += `<div class="card"><h2>Stress Testing</h2><p class="sub">${report.stress.filter((s) => s.breachesVar).length}/${report.stress.length} breach VaR</p><div class="chart-box"><svg width="100%" height="${report.stress.length * 28 + 10}" viewBox="0 0 480 ${report.stress.length * 28 + 10}">${stressBars}</svg></div></div>`;
    if (sections.includes("decomposition")) {
      const dRows = report.decomposition.perAsset.sort((a, b) => b.componentVar - a.componentVar).map((a) =>
        `<tr><td style="padding:5px 10px;font-weight:bold;">${a.symbol}</td><td style="padding:5px 10px;text-align:right;">${fmtUSD(a.componentVar)}</td><td style="padding:5px 10px;text-align:right;">${fmtPct(a.componentShare, 1)}</td></tr>`
      ).join("");
      sectionsHTML += `<div class="card"><h2>Risk Decomposition</h2><table class="tbl"><tr><th>Asset</th><th>Component VaR</th><th>Share</th></tr>${dRows}</table></div>`;
    }
    if (sections.includes("backtest")) {
      const zc = report.backtest.zone === "green" ? "#22c55e" : report.backtest.zone === "yellow" ? "#eab308" : "#f43f5e";
      sectionsHTML += `<div class="card"><h2>Backtesting</h2><div class="grid4"><div class="mcard"><div class="ml">Exceptions</div><div class="mv">${report.backtest.exceptionCount}</div></div><div class="mcard"><div class="ml">Zone</div><div class="mv" style="color:${zc};">${report.backtest.zone.toUpperCase()}</div></div><div class="mcard"><div class="ml">Kupiec p</div><div class="mv">${report.backtest.kupiec.pValue.toFixed(4)}</div></div><div class="mcard"><div class="ml">CC p</div><div class="mv">${report.backtest.christoffersen.ccP.toFixed(4)}</div></div></div></div>`;
    }
    if (sections.includes("liquidity"))
      sectionsHTML += `<div class="card"><h2>FRTB Liquidity VaR</h2><div class="grid2"><div class="mcard"><div class="ml">Aggregated ES</div><div class="mv" style="color:#22c55e;">${fmtUSD(report.liquidity.aggregatedEs)}</div></div><div class="mcard"><div class="ml">Reg Capital</div><div class="mv" style="color:#f43f5e;">${fmtUSD(report.liquidity.regulatoryCapital)}</div></div></div></div>`;

    let interpHTML = "";
    if (config.includeInterpretation && interpretation) {
      interpHTML = `<div class="card"><h2>AI Interpretation</h2><div class="grid2"><div class="interp" style="border-left:4px solid #22c55e;"><h3 style="color:#22c55e;">Strengths</h3><ul>${interpretation.pros.map((p: string) => `<li>${p}</li>`).join("")}</ul></div><div class="interp" style="border-left:4px solid #f43f5e;"><h3 style="color:#f43f5e;">Risk Concerns</h3><ul>${interpretation.cons.map((c: string) => `<li>${c}</li>`).join("")}</ul></div></div><div class="interp" style="border-left:4px solid #3b82f6;margin-top:10px;"><h3 style="color:#3b82f6;">Recommendations</h3><ul>${interpretation.recommendations.map((r: string) => `<li>${r}</li>`).join("")}</ul></div></div>`;
    }

    let summaryHTML = "";
    if (config.includeSummary && interpretation?.summary)
      summaryHTML = `<div class="card summary"><h2>Executive Summary</h2><p style="color:#e2e8f0;font-size:13px;line-height:1.6;">${interpretation.summary}</p></div>`;

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>VaR Report — ${portfolioName}</title>
<style>
@media print{.no-print{display:none!important}body{background:#fff!important}.card{break-inside:avoid}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#020617;color:#e2e8f0;padding:20px;max-width:900px;margin:0 auto}
.no-print{position:fixed;top:20px;right:20px;z-index:100}
.no-print button{background:#3b82f6;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(59,130,246,0.4)}
.cover{background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:32px;margin-bottom:16px;border:1px solid #1e293b}
.cover h1{font-size:26px;font-weight:800;color:#f8fafc;margin-bottom:6px}
.cover .sub{font-size:13px;color:#94a3b8;margin-bottom:16px}
.cover .meta{display:flex;gap:20px;font-size:11px;color:#64748b;flex-wrap:wrap}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}
.kpi{background:#1e293b;border-radius:10px;padding:14px;border:1px solid #334155}
.kpi .l{font-size:10px;text-transform:uppercase;color:#64748b}
.kpi .v{font-size:20px;font-weight:800;margin:4px 0}
.kpi .s{font-size:10px;color:#64748b}
.card{background:#0f172a;border-radius:12px;padding:20px;margin-bottom:12px;border:1px solid #1e293b}
.card h2{font-size:15px;font-weight:700;color:#f8fafc;margin-bottom:8px}
.card .sub{font-size:11px;color:#64748b;margin-bottom:8px}
.chart-box{background:#0f172a;border-radius:8px;padding:16px;margin:8px 0}
.tbl{width:100%;border-collapse:collapse;font-size:11px;margin:8px 0}
.tbl th{text-align:left;padding:6px 10px;background:#1e293b;color:#94a3b8;font-weight:600;font-size:10px;text-transform:uppercase}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.mcard{background:#1e293b;border-radius:8px;padding:10px;border:1px solid #334155}
.ml{font-size:9px;text-transform:uppercase;color:#64748b}
.mv{font-size:16px;font-weight:700;margin:3px 0}
.interp{background:#1e293b;border-radius:8px;padding:14px}
.interp h3{margin-bottom:6px;font-size:13px}
.interp ul{margin:0;padding-left:16px}
.interp li{margin-bottom:4px;color:#cbd5e1;font-size:11px}
.summary{background:linear-gradient(135deg,#1e293b,#0f172a)}
.footer{text-align:center;font-size:10px;color:#475569;padding:16px 0;border-top:1px solid #1e293b;margin-top:16px}
</style></head>
<body>
<div class="no-print"><button onclick="window.print()">📄 Print / Save as PDF</button></div>
<div class="cover">
<h1>VaR Risk Report</h1>
<div class="sub">${portfolioName}</div>
<div class="meta"><div>Total Value: <span style="color:#cbd5e1">${fmtUSD(report.portfolio.totalValue)}</span></div><div>Positions: <span style="color:#cbd5e1">${report.portfolio.positions.length}</span></div><div>Confidence: <span style="color:#cbd5e1">${(config.confidence * 100).toFixed(0)}%</span></div><div>Horizon: <span style="color:#cbd5e1">${config.horizon}d</span></div><div>Date: <span style="color:#cbd5e1">${new Date().toISOString().slice(0, 10)}</span></div></div>
</div>
<div class="kpis">
<div class="kpi"><div class="l">Value at Risk</div><div class="v" style="color:#f43f5e;">${fmtUSD(report.results.historical.var)}</div><div class="s">${fmtPct(report.results.historical.varPct)} of book</div></div>
<div class="kpi"><div class="l">Expected Shortfall</div><div class="v" style="color:#eab308;">${fmtUSD(report.results.historical.es)}</div><div class="s">${(report.results.historical.es / report.results.historical.var).toFixed(2)}x VaR</div></div>
<div class="kpi"><div class="l">Regulatory Capital</div><div class="v" style="color:#a855f7;">${fmtUSD(report.liquidity.regulatoryCapital)}</div><div class="s">${fmtPct(report.liquidity.regulatoryCapital / report.portfolio.totalValue, 1)} of book</div></div>
<div class="kpi"><div class="l">Worst Stress</div><div class="v" style="color:#f43f5e;">${fmtUSD(worstStress.pnl)}</div><div class="s">${worstStress.scenario.name}</div></div>
</div>
<div class="card"><h2>Portfolio Holdings</h2><table class="tbl"><tr><th>Symbol</th><th>Name</th><th style="text-align:right;">Weight</th><th style="text-align:right;">Market Value</th></tr>${posRows}</table></div>
${sectionsHTML}
${interpHTML}
${summaryHTML}
<div class="footer">VaR Lab · Generated ${new Date().toISOString()}</div>
</body></html>`;

    // Return the HTML directly — no file saving needed
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
