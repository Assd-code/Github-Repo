import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { computeReverseStress } from "@/lib/var/reverse-stress";
import { parsePortfolioSearchParams } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const targetLossPct = Math.min(0.95, Math.max(0.02, Number(q.get("targetLossPct") ?? 0.20)));
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);
  try {
    const market = getMarketData(days, seed);
    const result = computeReverseStress(market, portfolio, targetLossPct);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
