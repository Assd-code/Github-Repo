import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { runCustomScenario, listScenarios, saveScenario, deleteScenario } from "@/lib/var/custom-scenarios";
import { PortfolioConfig, CustomScenario } from "@/lib/var/types";
import {
  MAX_SCENARIOS,
  ApiValidationError,
  apiErrorResponse,
  validateId,
  validateNumber,
  parsePortfolioSearchParams,
  validatePortfolio,
  validateShocks,
  validateText,
} from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const confidence = Number(q.get("confidence") ?? 0.99);
  const horizon = Number(q.get("horizon") ?? 1);
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);
  try {
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
    const body = await req.json() as Record<string, unknown>;
    const action = validateText(body.action, "action", { required: true, max: 20 });
    if (action === "delete" && body.id) {
      await deleteScenario(validateId(body.id));
      return NextResponse.json({ ok: true });
    }
    if (action === "save") {
      const scenario: CustomScenario = {
        name: validateText(body.name, "name", { required: true, max: 120 }),
        description: validateText(body.description, "description", { max: 1000 }),
        type: "custom",
        shocks: validateShocks(body.shocks),
      };
      const saved = await saveScenario(scenario);
      return NextResponse.json({ ok: true, scenario: saved });
    }
    if (action === "run") {
      // Run an ad-hoc scenario (not persisted) against the portfolio.
      const seed = validateNumber(body.seed ?? 42, "seed", { min: -2_147_483_648, max: 2_147_483_647, integer: true });
      const days = validateNumber(body.days ?? 504, "days", { min: 250, max: 1000, integer: true });
      const confidence = validateNumber(body.confidence ?? 0.99, "confidence", { min: 0.9, max: 0.999 });
      const horizon = validateNumber(body.horizon ?? 1, "horizon", { min: 1, max: 250, integer: true });
      const portfolio: PortfolioConfig = validatePortfolio({ positions: body.positions, totalValue: body.totalValue }, DEFAULT_PORTFOLIO);
      const market = getMarketData(days, seed);
      const result = runCustomScenario(market, portfolio, {
        name: validateText(body.name ?? "Ad-hoc scenario", "name", { required: true, max: 120 }),
        description: validateText(body.description, "description", { max: 1000 }),
        type: "custom",
        shocks: validateShocks(body.shocks),
      }, confidence, horizon);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "import") {
      // Bulk import scenarios from a JSON array.
      if (!Array.isArray(body.scenarios) || body.scenarios.length === 0 || body.scenarios.length > MAX_SCENARIOS) {
        throw new ApiValidationError(`scenarios must contain between 1 and ${MAX_SCENARIOS} entries`);
      }
      const scenarios: CustomScenario[] = body.scenarios.map((item, index) => {
        if (!item || typeof item !== "object") throw new ApiValidationError(`scenarios[${index}] is invalid`);
        const scenario = item as Record<string, unknown>;
        return {
          name: validateText(scenario.name, `scenarios[${index}].name`, { required: true, max: 120 }),
          description: validateText(scenario.description, `scenarios[${index}].description`, { max: 1000 }),
          type: "custom",
          shocks: validateShocks(scenario.shocks),
        };
      });
      const saved: Array<CustomScenario & { id: string }> = [];
      for (const s of scenarios) {
        saved.push(await saveScenario(s));
      }
      return NextResponse.json({ ok: true, imported: saved.length, scenarios: saved });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
