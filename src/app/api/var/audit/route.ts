import { NextRequest, NextResponse } from "next/server";
import { breachFeed, utilizationHeatmap } from "@/lib/var/limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const action = q.get("action") || "feed";
  try {
    if (action === "heatmap") {
      const slots = Math.min(24, Math.max(4, Number(q.get("slots") ?? 12)));
      const matrix = await utilizationHeatmap(slots);
      return NextResponse.json({ ok: true, matrix });
    }
    // default: breach feed
    const limit = Math.min(100, Math.max(10, Number(q.get("limit") ?? 30)));
    const feed = await breachFeed(limit);
    return NextResponse.json({ ok: true, feed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
