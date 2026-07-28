import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { Methodology } from "@/lib/var/types";
import { computeExceptionDeepDive } from "@/lib/var/exception-deepdive";
import { parsePortfolioSearchParams } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const method = (q.get("method") as Methodology) || "historical";
  const window = Math.min(500, Math.max(100, Number(q.get("window") ?? 250)));
  const testDays = Math.min(500, Math.max(50, Number(q.get("testDays") ?? 250)));
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);

  try {
    const market = getMarketData(days, seed);
    const result = computeExceptionDeepDive(market, portfolio, method, confidence, window, testDays);
    return NextResponse.json({ ok: true, deepdive: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
