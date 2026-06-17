// Custom Report Generator
// Builds a configurable report with selected sections, charts, and
// LLM-powered interpretations.
//
// Configuration:
//   - sections: which analysis sections to include
//   - methods: which VaR methodologies to show
//   - includeSummary: whether to include a brief summary at the end
//   - includeInterpretation: whether to include LLM pros/cons analysis

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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

interface ReportConfig {
  sections: string[];
  methods: Methodology[];
  includeSummary: boolean;
  includeInterpretation: boolean;
}

// Generate the LLM interpretation using z-ai-web-dev-sdk
async function generateInterpretation(report: FullReport, portfolioName: string): Promise<{
  pros: string[];
  cons: string[];
  recommendations: string[];
  summary: string;
}> {
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
      .map((p) => ({ symbol: p.symbol, weight: +(p.weight * 100).toFixed(1), marketValue: Math.round(p.marketValue) }));
    const stressSummary = report.stress.map((s) => ({
      scenario: s.scenario.name,
      pnl: Math.round(s.pnl),
      breaches: s.breachesVar,
    }));
    const backtestSummary = {
      exceptions: report.backtest.exceptionCount,
      expected: +report.backtest.expectedExceptions.toFixed(1),
      zone: report.backtest.zone,
    };

    const prompt = `You are a senior risk analyst. Analyze this portfolio risk report and provide:
1. PROS: 3-4 strengths of the portfolio (diversification, hedging, risk-adjusted returns, etc.)
2. CONS: 3-4 weaknesses or risk concerns (concentration, tail risk, stress test failures, etc.)
3. RECOMMENDATIONS: 3-4 actionable suggestions to improve the risk profile
4. SUMMARY: a 2-3 sentence executive summary

Portfolio: ${portfolioName}
Total Value: $${report.portfolio.totalValue.toLocaleString()}
Positions (top 5): ${JSON.stringify(topPositions)}

VaR Results (99% 1-day):
${JSON.stringify(varResults)}

Backtest: ${JSON.stringify(backtestSummary)}

Stress Tests:
${JSON.stringify(stressSummary)}

FRTB Liquidity-Adjusted VaR: $${Math.round(report.liquidity.aggregatedEs)} ES, $${Math.round(report.liquidity.regulatoryCapital)} regulatory capital

P&L Attribution: Spearman rho=${report.pnlAttribution.spearmanCorrelation.toFixed(4)}, zone=${report.pnlAttribution.zone}

Respond as JSON with keys: pros (array of strings), cons (array), recommendations (array), summary (string). Be specific and reference actual numbers from the report.`;

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
    throw new Error("No JSON in LLM response");
  } catch (err) {
    return generateRuleBasedInterpretation(report, portfolioName);
  }
}

// Fallback interpretation if LLM fails
function generateRuleBasedInterpretation(report: FullReport, portfolioName: string) {
  const pros: string[] = [];
  const cons: string[] = [];
  const recommendations: string[] = [];

  if (report.backtest.zone === "green") {
    pros.push(`Backtest in GREEN zone with only ${report.backtest.exceptionCount} exceptions (expected ${report.backtest.expectedExceptions.toFixed(1)}) — model is well-calibrated`);
  }
  if (report.pnlAttribution.zone === "green") {
    pros.push(`P&L attribution PASSED (Spearman rho=${report.pnlAttribution.spearmanCorrelation.toFixed(3)}) — Internal Model Approval retained`);
  }
  const diversificationRatio = report.decomposition.perAsset.reduce((s, a) => s + a.standaloneVar, 0) / Math.max(report.results.historical.var, 1);
  if (diversificationRatio > 1.5) {
    pros.push(`Good diversification (ratio ${diversificationRatio.toFixed(2)}x) — standalone VaRs exceed portfolio VaR by ${((diversificationRatio - 1) * 100).toFixed(0)}%`);
  }
  const tltWeight = report.portfolio.positions.find((p) => p.symbol.includes("TLT"))?.weight || 0;
  if (tltWeight > 0.2) {
    pros.push(`Treasury allocation (${(tltWeight * 100).toFixed(0)}%) provides flight-to-safety hedge during equity sell-offs`);
  }

  const breachCount = report.stress.filter((s) => s.breachesVar).length;
  if (breachCount > 3) {
    cons.push(`${breachCount}/${report.stress.length} stress scenarios breach the 99% VaR — portfolio is vulnerable to tail events`);
  }
  const topWeight = Math.max(...report.portfolio.positions.map((p) => p.weight));
  if (topWeight > 0.4) {
    cons.push(`High concentration risk — largest position is ${(topWeight * 100).toFixed(0)}% of the book`);
  }
  const methodSpread = Math.max(...Object.values(report.results).map((r) => r.var)) - Math.min(...Object.values(report.results).map((r) => r.var));
  const avgVar = Object.values(report.results).reduce((s, r) => s + r.var, 0) / 5;
  if (methodSpread / avgVar > 0.3) {
    cons.push(`Large method spread ($${Math.round(methodSpread).toLocaleString()}, ${((methodSpread / avgVar) * 100).toFixed(0)}% of average) — high model risk`);
  }
  const regulatoryCapitalPct = report.liquidity.regulatoryCapital / report.portfolio.totalValue;
  if (regulatoryCapitalPct > 0.2) {
    cons.push(`High regulatory capital requirement (${(regulatoryCapitalPct * 100).toFixed(1)}% of book) — capital efficiency concern`);
  }

  recommendations.push("Consider rebalancing to reduce concentration in the largest position");
  recommendations.push("Monitor the backtest exception rate monthly — if it rises above the expected rate, recalibrate the model");
  if (breachCount > 3) {
    recommendations.push("Add tail hedges (e.g. put options or bear ETFs like SPXS) to reduce stress-test breach count");
  }
  recommendations.push("Review the FRTB liquidity horizons — ensure the book can be unwound within the assigned horizons");

  const summary = `${portfolioName} has a 99% 1-day VaR of $${Math.round(report.results.historical.var).toLocaleString()} (${(report.results.historical.varPct * 100).toFixed(2)}% of book). Backtest is in ${report.backtest.zone.toUpperCase()} zone with ${report.backtest.exceptionCount} exceptions. ${breachCount}/${report.stress.length} stress scenarios breach VaR. Regulatory capital requirement is $${Math.round(report.liquidity.regulatoryCapital).toLocaleString()} (${(regulatoryCapitalPct * 100).toFixed(1)}% of book).`;

  return { pros, cons, recommendations, summary };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const config: ReportConfig = {
      sections: body.sections || ["var", "backtest", "stress", "decomposition"],
      methods: body.methods || ["historical", "parametric", "montecarlo"],
      includeSummary: body.includeSummary ?? true,
      includeInterpretation: body.includeInterpretation ?? true,
    };
    const portfolio: PortfolioConfig = {
      positions: body.positions || DEFAULT_PORTFOLIO.positions,
      totalValue: body.totalValue || DEFAULT_PORTFOLIO.totalValue,
    };
    const useRealData = body.useRealData ?? true;
    const portfolioName = body.portfolioName || "Untitled Portfolio";
    const confidence = body.confidence ?? 0.99;
    const horizon = body.horizon ?? 1;

    // Fetch market data
    const symbols = portfolio.positions.map((p) => p.symbol);
    const { market, summary: dataSource } = useRealData
      ? await getRealMarketDataCached(symbols, 504)
      : { market: getMarketData(504, 42), summary: { dataSource: "synthetic", fetched: [], failed: [] } };

    // Build the full VaR report
    const report = buildFullReport(market, portfolio, confidence, horizon, "historical");

    // Compute additional analytics based on selected sections
    let sensitivity: any = null;
    let volatility: any = null;
    let optimizer: any = null;
    let concentration: any = null;
    let performance: any = null;

    if (config.sections.includes("sensitivity")) {
      sensitivity = computeRiskFactorSensitivity(market, portfolio, confidence, horizon);
    }
    if (config.sections.includes("volatility")) {
      volatility = computeVolatilityRegimes(market, portfolio);
    }
    if (config.sections.includes("optimizer")) {
      optimizer = optimizePortfolio(market, portfolio, confidence, horizon);
    }
    if (config.sections.includes("concentration")) {
      concentration = computeConcentration(market, portfolio, confidence, horizon, "historical");
    }
    if (config.sections.includes("performance")) {
      performance = computePerformance(market, portfolio);
    }

    // Generate LLM interpretation
    let interpretation = null;
    if (config.includeInterpretation) {
      interpretation = await generateInterpretation(report, portfolioName);
    }

    return NextResponse.json({
      ok: true,
      report,
      interpretation,
      sensitivity,
      volatility,
      optimizer,
      concentration,
      performance,
      config,
      portfolioName,
      dataSource,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
