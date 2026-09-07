import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { computeLimitMonitoring, listLimits, upsertLimit, deleteLimit } from "@/lib/var/limits";
import {
  apiErrorResponse,
  validateId,
  validateMethodology,
  validateNumber,
  validatePortfolio,
  validateText,
} from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Use POST for limit monitoring" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const action = validateText(body.action, "action", { required: true, max: 20 });
    if (action === "list") {
      const limits = await listLimits();
      return NextResponse.json({ ok: true, limits });
    }
    if (action === "monitor") {
      const seed = validateNumber(body.seed ?? 42, "seed", { min: -2_147_483_648, max: 2_147_483_647, integer: true });
      const days = validateNumber(body.days ?? 504, "days", { min: 250, max: 1000, integer: true });
      const portfolio = validatePortfolio({ positions: body.positions, totalValue: body.totalValue }, DEFAULT_PORTFOLIO);
      const market = getMarketData(days, seed);
      const monitoring = await computeLimitMonitoring(market, portfolio);
      return NextResponse.json({ ok: true, monitoring });
    }
    if (action === "delete" && body.id) {
      await deleteLimit(validateId(body.id));
      return NextResponse.json({ ok: true });
    }
    if (action === "upsert") {
      const limitUsd = validateNumber(body.limitUsd, "limitUsd", { min: 1, max: 1_000_000_000_000_000 });
      const softLimitUsd = body.softLimitUsd != null
        ? validateNumber(body.softLimitUsd, "softLimitUsd", { min: 0, max: limitUsd })
        : null;
      const limit = await upsertLimit({
        id: body.id ? validateId(body.id) : undefined,
        scope: validateText(body.scope ?? "portfolio:default", "scope", { required: true, max: 120 }),
        label: validateText(body.label, "label", { required: true, max: 120 }),
        method: validateMethodology(body.method),
        confidence: validateNumber(body.confidence, "confidence", { min: 0.9, max: 0.999 }),
        horizon: validateNumber(body.horizon, "horizon", { min: 1, max: 250, integer: true }),
        limitUsd,
        softLimitUsd,
        active: body.active !== false,
      });
      return NextResponse.json({ ok: true, limit });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
