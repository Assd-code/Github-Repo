import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { correlationMatrix } from "@/lib/var/market-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const market = getMarketData(days, seed);

  // Return compact price history for charting (downsample to ~150 points).
  const total = market.dates.length;
  const step = Math.max(1, Math.floor(total / 150));
  const dates: string[] = [];
  const series: Record<string, number[]> = {};
  for (const a of market.assets) series[a.symbol] = [];
  for (let t = 0; t < total; t += step) {
    dates.push(market.dates[t]);
    for (let i = 0; i < market.assets.length; i++) {
      series[market.assets[i].symbol].push(market.prices[t][i]);
    }
  }

  return NextResponse.json({
    ok: true,
    assets: market.assets,
    dates,
    series,
    correlation: correlationMatrix(market),
    windowDays: total,
  });
}
