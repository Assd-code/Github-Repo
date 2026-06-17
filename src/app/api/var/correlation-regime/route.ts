import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { computeCorrelationRegimes } from "@/lib/var/correlation-regime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));

  try {
    const market = getMarketData(days, seed);
    const result = computeCorrelationRegimes(market);
    return NextResponse.json({ ok: true, analysis: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
