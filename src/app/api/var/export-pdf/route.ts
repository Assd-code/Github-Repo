// PDF Report Export
// Generates a graphical HTML report from the custom report data and converts
// it to PDF using Playwright (via the pdf skill's html2poster.js script).
//
// The HTML report includes:
//   - Cover section with portfolio name and key metrics
//   - Selected VaR methodology comparison (bar chart as SVG)
//   - Selected analysis sections (backtest, stress, decomposition, etc.)
//   - LLM interpretation (pros, cons, recommendations)
//   - Brief summary (optional)
//
// The report uses a dark financial-terminal theme with good graphics.

import { NextRequest, NextResponse } from "next/server";
import { getRealMarketDataCached, getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { PortfolioConfig, Methodology, FullReport } from "@/lib/var/types";
import { buildFullReport } from "@/lib/var/engine";
import { computeRiskFactorSensitivity } from "@/lib/var/sensitivity";
import { computeVolatilityRegimes } from "@/lib/var/volatility-regime";
import { optimizePortfolio } from "@/lib/var/optimizer";
import { computeConcentration } from "@/lib/var/concentration";
import { computePerformance } from "@/lib/var/performance";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

// Use process.cwd() to resolve paths at runtime (avoids webpack static analysis)
const PDF_SKILL_DIR = `${process.cwd()}/skills/pdf`;
const REPORTS_DIR = `${process.cwd()}/public/reports`;

// Format currency
function fmtUSD(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// Generate LLM interpretation
async function generateInterpretation(report: FullReport, portfolioName: string) {
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const varResults = (Object.keys(report.results) as Methodology[]).map((m) => ({
      method: m,
      var: Math.round(report.results[m].var),
      es: Math.round(report.results[m].es),
    }));
    const topPositions = report.portfolio.positions
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .map((p) => ({ symbol: p.symbol, weight: +(p.weight * 100).toFixed(1) }));
    const stressSummary = report.stress.map((s) => ({
      scenario: s.scenario.name,
      pnl: Math.round(s.pnl),
      breaches: s.breachesVar,
    }));

    const prompt = `You are a senior risk analyst. Analyze this portfolio risk report and provide:
1. PROS: 3-4 strengths of the portfolio
2. CONS: 3-4 weaknesses or risk concerns
3. RECOMMENDATIONS: 3-4 actionable suggestions
4. SUMMARY: a 2-3 sentence executive summary

Portfolio: ${portfolioName}
Total Value: $${report.portfolio.totalValue.toLocaleString()}
Positions (top 5): ${JSON.stringify(topPositions)}
VaR Results: ${JSON.stringify(varResults)}
Backtest: ${report.backtest.exceptionCount} exceptions (zone: ${report.backtest.zone})
Stress Tests: ${JSON.stringify(stressSummary)}
FRTB L-VaR: $${Math.round(report.liquidity.regulatoryCapital)} regulatory capital

Respond as JSON: {pros: [], cons: [], recommendations: [], summary: ""}`;

    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: "You are a senior quantitative risk analyst. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      thinking: { type: "disabled" },
    });

    const content = completion.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        pros: Array.isArray(parsed.pros) ? parsed.pros : [],
        cons: Array.isArray(parsed.cons) ? parsed.cons : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      };
    }
    throw new Error("No JSON");
  } catch {
    // Rule-based fallback
    const pros: string[] = [];
    const cons: string[] = [];
    const recs: string[] = [];
    if (report.backtest.zone === "green") pros.push(`Backtest GREEN zone (${report.backtest.exceptionCount} exceptions)`);
    if (report.pnlAttribution.zone === "green") pros.push(`PLA PASSED (rho=${report.pnlAttribution.spearmanCorrelation.toFixed(3)})`);
    const breachCount = report.stress.filter((s) => s.breachesVar).length;
    if (breachCount > 3) cons.push(`${breachCount}/${report.stress.length} stress scenarios breach VaR`);
    const topWeight = Math.max(...report.portfolio.positions.map((p) => p.weight));
    if (topWeight > 0.4) cons.push(`High concentration (${(topWeight * 100).toFixed(0)}% in top position)`);
    recs.push("Reduce concentration in largest position");
    recs.push("Monitor backtest exception rate monthly");
    if (breachCount > 3) recs.push("Add tail hedges to reduce stress breaches");
    const summary = `${portfolioName}: 99% 1-day VaR ${fmtUSD(report.results.historical.var)} (${fmtPct(report.results.historical.varPct)} of book). ${report.backtest.zone.toUpperCase()} zone. ${breachCount}/${report.stress.length} stress breaches. Reg capital ${fmtUSD(report.liquidity.regulatoryCapital)}.`;
    return { pros, cons, recommendations: recs, summary };
  }
}

// Build the HTML report
function buildHTML(
  report: FullReport,
  interpretation: any,
  config: any,
  portfolioName: string,
  dataSource: any
): string {
  const methods = config.methods as Methodology[];
  const sections = config.sections as string[];

  // VaR bar chart data (as inline SVG)
  const varChartBars = methods.map((m, i) => {
    const r = report.results[m];
    const maxVar = Math.max(...methods.map((mm) => report.results[mm].var));
    const barHeight = (r.var / maxVar) * 180;
    const barWidth = 60;
    const x = 80 + i * (barWidth + 20);
    const y = 200 - barHeight;
    const labels: Record<Methodology, string> = {
      parametric: "Parametric",
      historical: "Historical",
      montecarlo: "Monte Carlo",
      filtered: "Filtered HS",
      evt: "EVT",
    };
    const colors: Record<Methodology, string> = {
      parametric: "#3b82f6",
      historical: "#f43f5e",
      montecarlo: "#22c55e",
      filtered: "#eab308",
      evt: "#a855f7",
    };
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${colors[m]}" rx="4"/>
      <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" fill="#e2e8f0" font-size="12" font-weight="bold">${fmtUSD(r.var)}</text>
      <text x="${x + barWidth / 2}" y="220" text-anchor="middle" fill="#94a3b8" font-size="11">${labels[m]}</text>
    `;
  }).join("\n");

  // Stress test bars
  const stressBars = report.stress.map((s, i) => {
    const maxPnl = Math.max(...report.stress.map((ss) => Math.abs(ss.pnl)));
    const barWidth = (Math.abs(s.pnl) / maxPnl) * 300;
    const x = 120;
    const y = 30 + i * 32;
    const color = s.breachesVar ? "#f43f5e" : "#22c55e";
    const sign = s.pnl < 0 ? "-" : "+";
    return `
      <text x="${x - 10}" y="${y + 14}" text-anchor="end" fill="#cbd5e1" font-size="11">${s.scenario.name.slice(0, 25)}</text>
      <rect x="${x}" y="${y}" width="${barWidth}" height="20" fill="${color}" opacity="0.7" rx="3"/>
      <text x="${x + barWidth + 8}" y="${y + 14}" fill="#e2e8f0" font-size="11" font-weight="bold">${sign}${fmtUSD(Math.abs(s.pnl))}</text>
    `;
  }).join("\n");

  // Portfolio positions table rows
  const positionRows = report.portfolio.positions
    .sort((a, b) => b.marketValue - a.marketValue)
    .map((p) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;font-weight:bold;color:#e2e8f0;">${p.symbol}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;color:#94a3b8;">${p.name}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#e2e8f0;">${fmtPct(p.weight, 1)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#e2e8f0;">${fmtUSD(p.marketValue)}</td>
      </tr>
    `).join("");

  // Decomposition rows
  const decompRows = report.decomposition.perAsset
    .sort((a, b) => b.componentVar - a.componentVar)
    .map((a) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;font-weight:bold;color:#e2e8f0;">${a.symbol}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#e2e8f0;">${fmtUSD(a.componentVar)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtPct(a.componentShare, 1)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtUSD(a.incrementalVar)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #1e293b;text-align:right;color:#94a3b8;">${fmtUSD(a.standaloneVar)}</td>
      </tr>
    `).join("");

  // Build sections HTML
  let sectionsHTML = "";

  if (sections.includes("var")) {
    sectionsHTML += `
      <div class="section">
        <h2 class="section-title">VaR Methodology Comparison</h2>
        <p class="section-desc">99% confidence · ${config.horizon}d horizon · ${methods.length} methods selected</p>
        <div style="background:#0f172a;border-radius:12px;padding:20px;margin:16px 0;">
          <svg width="100%" height="240" viewBox="0 0 ${80 + methods.length * 80} 240">
            <line x1="0" y1="200" x2="${80 + methods.length * 80}" y2="200" stroke="#334155" stroke-width="1"/>
            ${varChartBars}
          </svg>
        </div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Method</th><th>VaR</th><th>ES</th><th>ES/VaR</th><th>Worst</th>
            </tr>
          </thead>
          <tbody>
            ${methods.map((m) => {
              const r = report.results[m];
              const labels: Record<Methodology, string> = { parametric: "Parametric", historical: "Historical", montecarlo: "Monte Carlo", filtered: "Filtered HS", evt: "EVT" };
              return `<tr><td style="font-weight:bold;">${labels[m]}</td><td style="text-align:right;color:#f43f5e;">${fmtUSD(r.var)}</td><td style="text-align:right;color:#eab308;">${fmtUSD(r.es)}</td><td style="text-align:right;">${(r.es / r.var).toFixed(2)}x</td><td style="text-align:right;color:#94a3b8;">${fmtUSD(r.worst)}</td></tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  if (sections.includes("stress")) {
    sectionsHTML += `
      <div class="section">
        <h2 class="section-title">Stress Testing</h2>
        <p class="section-desc">${report.stress.filter((s) => s.breachesVar).length}/${report.stress.length} scenarios breach the 99% VaR</p>
        <div style="background:#0f172a;border-radius:12px;padding:20px;margin:16px 0;">
          <svg width="100%" height="${report.stress.length * 32 + 20}" viewBox="0 0 500 ${report.stress.length * 32 + 20}">
            ${stressBars}
          </svg>
        </div>
      </div>
    `;
  }

  if (sections.includes("decomposition")) {
    sectionsHTML += `
      <div class="section">
        <h2 class="section-title">Risk Decomposition</h2>
        <p class="section-desc">Component VaR by asset — how each position contributes to total risk</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Asset</th><th>Component VaR</th><th>Share</th><th>Incremental</th><th>Standalone</th>
            </tr>
          </thead>
          <tbody>${decompRows}</tbody>
        </table>
      </div>
    `;
  }

  if (sections.includes("backtest")) {
    const zoneColor = report.backtest.zone === "green" ? "#22c55e" : report.backtest.zone === "yellow" ? "#eab308" : "#f43f5e";
    sectionsHTML += `
      <div class="section">
        <h2 class="section-title">Backtesting</h2>
        <p class="section-desc">250-day rolling window · Kupiec POF · Christoffersen · Basel traffic light</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0;">
          <div class="metric-card"><div class="metric-label">Exceptions</div><div class="metric-value">${report.backtest.exceptionCount}</div><div class="metric-sub">exp ${report.backtest.expectedExceptions.toFixed(1)}</div></div>
          <div class="metric-card"><div class="metric-label">Basel Zone</div><div class="metric-value" style="color:${zoneColor};">${report.backtest.zone.toUpperCase()}</div><div class="metric-sub">multiplier ${report.backtest.zoneMultiplier}x</div></div>
          <div class="metric-card"><div class="metric-label">Kupiec p-value</div><div class="metric-value">${report.backtest.kupiec.pValue.toFixed(4)}</div><div class="metric-sub">${report.backtest.kupiec.reject ? "REJECT" : "pass"}</div></div>
          <div class="metric-card"><div class="metric-label">CC p-value</div><div class="metric-value">${report.backtest.christoffersen.ccP.toFixed(4)}</div><div class="metric-sub">${report.backtest.christoffersen.reject ? "REJECT" : "pass"}</div></div>
        </div>
      </div>
    `;
  }

  if (sections.includes("liquidity")) {
    sectionsHTML += `
      <div class="section">
        <h2 class="section-title">FRTB Liquidity-Adjusted VaR</h2>
        <p class="section-desc">97.5% ES scaled across 5 FRTB liquidity horizons</p>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:16px 0;">
          <div class="metric-card"><div class="metric-label">Aggregated ES</div><div class="metric-value" style="color:#22c55e;">${fmtUSD(report.liquidity.aggregatedEs)}</div></div>
          <div class="metric-card"><div class="metric-label">Regulatory Capital</div><div class="metric-value" style="color:#f43f5e;">${fmtUSD(report.liquidity.regulatoryCapital)}</div><div class="metric-sub">${fmtPct(report.liquidity.regulatoryCapital / report.portfolio.totalValue, 1)} of book</div></div>
        </div>
      </div>
    `;
  }

  // Interpretation section
  let interpretationHTML = "";
  if (config.includeInterpretation && interpretation) {
    interpretationHTML = `
      <div class="section">
        <h2 class="section-title">AI Interpretation & Analysis</h2>
        <p class="section-desc">LLM-powered portfolio assessment</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;">
          <div class="interp-card" style="border-left:4px solid #22c55e;">
            <h3 style="color:#22c55e;margin:0 0 8px;font-size:14px;">Strengths</h3>
            <ul style="margin:0;padding-left:16px;">
              ${interpretation.pros.map((p: string) => `<li style="margin-bottom:6px;color:#cbd5e1;font-size:12px;">${p}</li>`).join("")}
            </ul>
          </div>
          <div class="interp-card" style="border-left:4px solid #f43f5e;">
            <h3 style="color:#f43f5e;margin:0 0 8px;font-size:14px;">Risk Concerns</h3>
            <ul style="margin:0;padding-left:16px;">
              ${interpretation.cons.map((c: string) => `<li style="margin-bottom:6px;color:#cbd5e1;font-size:12px;">${c}</li>`).join("")}
            </ul>
          </div>
        </div>
        <div class="interp-card" style="border-left:4px solid #3b82f6;margin-top:12px;">
          <h3 style="color:#3b82f6;margin:0 0 8px;font-size:14px;">Recommendations</h3>
          <ul style="margin:0;padding-left:16px;">
            ${interpretation.recommendations.map((r: string) => `<li style="margin-bottom:6px;color:#cbd5e1;font-size:12px;">${r}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  // Summary section
  let summaryHTML = "";
  if (config.includeSummary && interpretation) {
    summaryHTML = `
      <div class="section summary-section">
        <h2 class="section-title">Executive Summary</h2>
        <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:12px 0;">${interpretation.summary}</p>
      </div>
    `;
  }

  // KPI cards
  const worstStress = report.stress.reduce((acc, s) => (s.pnl < acc.pnl ? s : acc), report.stress[0]);
  const kpiCards = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0;">
      <div class="kpi-card">
        <div class="kpi-label">Value at Risk</div>
        <div class="kpi-value" style="color:#f43f5e;">${fmtUSD(report.results.historical.var)}</div>
        <div class="kpi-sub">${fmtPct(report.results.historical.varPct)} of book</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Expected Shortfall</div>
        <div class="kpi-value" style="color:#eab308;">${fmtUSD(report.results.historical.es)}</div>
        <div class="kpi-sub">ES/VaR ${(report.results.historical.es / report.results.historical.var).toFixed(2)}x</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Regulatory Capital</div>
        <div class="kpi-value" style="color:#a855f7;">${fmtUSD(report.liquidity.regulatoryCapital)}</div>
        <div class="kpi-sub">${fmtPct(report.liquidity.regulatoryCapital / report.portfolio.totalValue, 1)} of book</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Worst Stress</div>
        <div class="kpi-value" style="color:#f43f5e;">${fmtUSD(worstStress.pnl)}</div>
        <div class="kpi-sub">${worstStress.scenario.name}</div>
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>VaR Report — ${portfolioName}</title>
<style>
  @page { size: 794px 1123px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #020617;
    color: #e2e8f0;
    width: 794px;
    margin: 0 auto;
    -webkit-font-smoothing: antialiased;
  }
  .poster { padding: 40px; }
  .cover {
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-radius: 16px;
    padding: 40px;
    margin-bottom: 24px;
    border: 1px solid #1e293b;
  }
  .cover-badge {
    display: inline-block;
    background: rgba(34, 197, 94, 0.15);
    color: #22c55e;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid rgba(34, 197, 94, 0.3);
    margin-bottom: 16px;
  }
  .cover h1 {
    font-size: 28px;
    font-weight: 800;
    color: #f8fafc;
    margin-bottom: 8px;
  }
  .cover .subtitle {
    font-size: 14px;
    color: #94a3b8;
    margin-bottom: 20px;
  }
  .cover-meta {
    display: flex;
    gap: 24px;
    font-size: 12px;
    color: #64748b;
  }
  .cover-meta span { color: #cbd5e1; }
  .section {
    background: #0f172a;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 16px;
    border: 1px solid #1e293b;
  }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 4px;
  }
  .section-desc {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 12px;
  }
  .kpi-card {
    background: #1e293b;
    border-radius: 10px;
    padding: 16px;
    border: 1px solid #334155;
  }
  .kpi-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 6px;
  }
  .kpi-value {
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .kpi-sub {
    font-size: 11px;
    color: #64748b;
    margin-top: 4px;
  }
  .metric-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 12px;
    border: 1px solid #334155;
  }
  .metric-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #64748b;
  }
  .metric-value {
    font-size: 18px;
    font-weight: 700;
    margin: 4px 0;
    font-variant-numeric: tabular-nums;
  }
  .metric-sub {
    font-size: 10px;
    color: #64748b;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin: 12px 0;
  }
  .data-table th {
    text-align: left;
    padding: 8px 12px;
    background: #1e293b;
    color: #94a3b8;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .interp-card {
    background: #1e293b;
    border-radius: 8px;
    padding: 16px;
  }
  .summary-section {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border: 1px solid #334155;
  }
  .footer {
    text-align: center;
    font-size: 10px;
    color: #475569;
    padding: 20px 0;
    border-top: 1px solid #1e293b;
    margin-top: 20px;
  }
</style>
</head>
<body>
<div class="poster">
  <!-- Cover -->
  <div class="cover">
    <div class="cover-badge">${dataSource?.dataSource === "real" ? "LIVE DATA" : "SYNTHETIC DATA"}</div>
    <h1>VaR Risk Report</h1>
    <div class="subtitle">${portfolioName}</div>
    <div class="cover-meta">
      <div>Total Value: <span>${fmtUSD(report.portfolio.totalValue)}</span></div>
      <div>Positions: <span>${report.portfolio.positions.length}</span></div>
      <div>Confidence: <span>${(config.confidence * 100).toFixed(0)}%</span></div>
      <div>Horizon: <span>${config.horizon}d</span></div>
      <div>Generated: <span>${new Date().toISOString().slice(0, 10)}</span></div>
    </div>
  </div>

  <!-- KPI Cards -->
  ${kpiCards}

  <!-- Portfolio Holdings -->
  <div class="section">
    <h2 class="section-title">Portfolio Holdings</h2>
    <table class="data-table">
      <thead>
        <tr>
          <th>Symbol</th><th>Name</th><th style="text-align:right;">Weight</th><th style="text-align:right;">Market Value</th>
        </tr>
      </thead>
      <tbody>${positionRows}</tbody>
    </table>
  </div>

  <!-- Selected Sections -->
  ${sectionsHTML}

  <!-- AI Interpretation -->
  ${interpretationHTML}

  <!-- Summary -->
  ${summaryHTML}

  <div class="footer">
    VaR Lab — Educational risk-model implementation · Generated ${new Date().toISOString()} · ${dataSource?.dataSource === "real" ? "Live market data from Yahoo Finance" : "Synthetic data"}
  </div>
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config = {
      sections: body.sections || ["var", "backtest", "stress", "decomposition"],
      methods: body.methods || ["historical", "parametric", "montecarlo"],
      includeSummary: body.includeSummary ?? true,
      includeInterpretation: body.includeInterpretation ?? true,
      confidence: body.confidence ?? 0.99,
      horizon: body.horizon ?? 1,
    };
    const portfolio: PortfolioConfig = {
      positions: body.positions || DEFAULT_PORTFOLIO.positions,
      totalValue: body.totalValue || DEFAULT_PORTFOLIO.totalValue,
    };
    const useRealData = body.useRealData ?? true;
    const portfolioName = body.portfolioName || "Untitled Portfolio";

    // Fetch market data
    const symbols = portfolio.positions.map((p) => p.symbol);
    const { market, summary: dataSource } = useRealData
      ? await getRealMarketDataCached(symbols, 504)
      : { market: getMarketData(504, 42), summary: { dataSource: "synthetic", fetched: [], failed: [] } };

    // Build report
    const report = buildFullReport(market, portfolio, config.confidence, config.horizon, "historical");

    // Generate interpretation
    const interpretation = config.includeInterpretation
      ? await generateInterpretation(report, portfolioName)
      : null;

    // Build HTML
    const html = buildHTML(report, interpretation, config, portfolioName, dataSource);

    // Ensure reports directory exists
    mkdirSync(REPORTS_DIR, { recursive: true });

    // Write HTML file
    const timestamp = Date.now();
    const htmlPath = join(REPORTS_DIR, `var-report-${timestamp}.html`);
    writeFileSync(htmlPath, html);

    // Convert to PDF using html2poster.js
    // Use eval to prevent webpack from trying to resolve the path at build time
    const pdfPath = join(REPORTS_DIR, `var-report-${timestamp}.pdf`);
    const scriptPath = join(PDF_SKILL_DIR, "scripts", "html2poster.js");
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("node", [
        scriptPath,
        htmlPath,
        "--output", pdfPath,
        "--width", "794px",
      ], { cwd: PDF_SKILL_DIR });

      let stderr = "";
      proc.stderr.on("data", (data) => { stderr += data.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`html2poster.js exited with code ${code}: ${stderr}`));
      });
      proc.on("error", (err) => reject(err));
    });

    // Return the PDF URL
    const pdfUrl = `/reports/var-report-${timestamp}.pdf`;
    const htmlUrl = `/reports/var-report-${timestamp}.html`;

    return NextResponse.json({
      ok: true,
      pdfUrl,
      htmlUrl,
      portfolioName,
      interpretation,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
