import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { Methodology } from "@/lib/var/types";
import { computePerformance } from "@/lib/var/performance";
import { parsePortfolioSearchParams } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const rf = Number(q.get("rf") ?? 0.02);
  const method = (q.get("method") as Methodology) || "historical";
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);

  try {
    const market = getMarketData(days, seed);
    const perf = computePerformance(market, portfolio, rf, method);
    return NextResponse.json({ ok: true, performance: perf });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
