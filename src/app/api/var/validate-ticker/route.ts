import { NextRequest, NextResponse } from "next/server";
import { validateTicker } from "@/lib/var/real-market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const symbol = q.get("symbol") || "";
  if (!symbol.trim()) {
    return NextResponse.json(
      { ok: false, error: "symbol query parameter required" },
      { status: 400 }
    );
  }
  try {
    const result = await validateTicker(symbol.trim());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
