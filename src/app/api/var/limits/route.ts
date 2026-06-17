import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { computeLimitMonitoring, listLimits, upsertLimit, deleteLimit } from "@/lib/var/limits";
import { PortfolioConfig, Methodology } from "@/lib/var/types";

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
  const portfolio = parsePortfolio(q);
  try {
    const market = getMarketData(days, seed);
    const monitoring = await computeLimitMonitoring(market, portfolio);
    return NextResponse.json({ ok: true, monitoring });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "list") {
      const limits = await listLimits();
      return NextResponse.json({ ok: true, limits });
    }
    if (body.action === "delete" && body.id) {
      await deleteLimit(body.id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "upsert") {
      const limit = await upsertLimit({
        id: body.id,
        scope: body.scope || "portfolio:default",
        label: body.label,
        method: body.method as Methodology,
        confidence: Number(body.confidence),
        horizon: Number(body.horizon),
        limitUsd: Number(body.limitUsd),
        softLimitUsd: body.softLimitUsd != null ? Number(body.softLimitUsd) : null,
        active: body.active !== false,
      });
      return NextResponse.json({ ok: true, limit });
    }
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
