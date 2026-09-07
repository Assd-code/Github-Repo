import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { buildFullReport, DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { Methodology } from "@/lib/var/types";
import { parsePortfolioSearchParams } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  const horizon = Math.min(20, Math.max(1, Math.round(Number(q.get("horizon") ?? 1))));
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const primary = (q.get("method") as Methodology) || "historical";
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);

  try {
    const market = getMarketData(days, seed);
    const report = buildFullReport(market, portfolio, confidence, horizon, primary);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
