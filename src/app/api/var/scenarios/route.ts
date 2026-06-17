import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { runCustomScenario, listScenarios, saveScenario, deleteScenario, seedExampleScenarios } from "@/lib/var/custom-scenarios";
import { PortfolioConfig, CustomScenario } from "@/lib/var/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parsePortfolio(q: URLSearchParams): PortfolioConfig {
  const posParam = q.get("positions");
  const total = Number(q.get("totalValue") ?? DEFAULT_PORTFOLIO.totalValue);
  let positions = DEFAULT_PORTFOLIO.positions;
  if (posParam) {
    try {
      positions = posParam.split(",").map((s) => s.trim()).filter(Boolean).map((pair) => {
        const [symbol, qty] = pair.split(":");
        return { symbol: symbol.toUpperCase(), quantity: Number(qty) };
      }).filter((p) => p.symbol && Number.isFinite(p.quantity) && p.quantity !== 0);
      if (positions.length === 0) positions = DEFAULT_PORTFOLIO.positions;
    } catch { positions = DEFAULT_PORTFOLIO.positions; }
  }
  return { positions, totalValue: total };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const confidence = Number(q.get("confidence") ?? 0.99);
  const horizon = Number(q.get("horizon") ?? 1);
  const portfolio = parsePortfolio(q);
  try {
    await seedExampleScenarios();
    const market = getMarketData(days, seed);
    const saved = await listScenarios();
    const results = saved.map((s) => ({
      scenario: s,
      result: runCustomScenario(market, portfolio, s, confidence, horizon),
    }));
    return NextResponse.json({ ok: true, assets: market.assets.map((a) => ({ symbol: a.symbol, name: a.name, assetClass: a.assetClass })), scenarios: results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "delete" && body.id) {
      await deleteScenario(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "save") {
      const scenario: CustomScenario = {
        name: body.name,
        description: body.description || "",
        type: "custom",
        shocks: body.shocks,
      };
      const saved = await saveScenario(scenario);
      return NextResponse.json({ ok: true, scenario: saved });
    }
    if (body.action === "run") {
      // Run an ad-hoc scenario (not persisted) against the portfolio.
      const seed = Number(body.seed ?? 42);
      const days = Math.min(1000, Math.max(250, Number(body.days ?? 504)));
      const confidence = Number(body.confidence ?? 0.99);
      const horizon = Number(body.horizon ?? 1);
      const portfolio: PortfolioConfig = {
        positions: body.positions || DEFAULT_PORTFOLIO.positions,
        totalValue: Number(body.totalValue ?? DEFAULT_PORTFOLIO.totalValue),
      };
      const market = getMarketData(days, seed);
      const result = runCustomScenario(market, portfolio, {
        name: body.name || "Ad-hoc scenario",
        description: body.description || "",
        type: "custom",
        shocks: body.shocks,
      }, confidence, horizon);
      return NextResponse.json({ ok: true, result });
    }
    if (body.action === "import") {
      // Bulk import scenarios from a JSON array.
      const scenarios: CustomScenario[] = body.scenarios || [];
      const saved = [];
      for (const s of scenarios) {
        if (s.name && s.shocks) {
          const result = await saveScenario({
            name: s.name,
            description: s.description || "",
            type: "custom",
            shocks: s.shocks,
          });
          saved.push(result);
        }
      }
      return NextResponse.json({ ok: true, imported: saved.length, scenarios: saved });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
