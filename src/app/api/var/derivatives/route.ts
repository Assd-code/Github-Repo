import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { computeDerivativesAnalysis, getDefaultOptions } from "@/lib/var/derivatives";
import { OptionPosition } from "@/lib/var/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  try {
    const market = getMarketData(days, seed);
    const analysis = computeDerivativesAnalysis(market, getDefaultOptions(market), confidence);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seed = Number(body.seed ?? 42);
    const days = Math.min(1000, Math.max(250, Number(body.days ?? 504)));
    const confidence = Math.min(0.999, Math.max(0.9, Number(body.confidence ?? 0.99)));
    const options: OptionPosition[] = (body.options && body.options.length > 0) ? body.options : getDefaultOptions(getMarketData(days, seed));
    const market = getMarketData(days, seed);
    const analysis = computeDerivativesAnalysis(market, options, confidence);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
