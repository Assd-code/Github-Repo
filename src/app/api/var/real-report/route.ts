import { NextRequest, NextResponse } from "next/server";
import { getRealMarketDataCached } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { PortfolioConfig, Methodology } from "@/lib/var/types";
import { buildFullReport } from "@/lib/var/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

function parsePortfolio(q: URLSearchParams) {
  const posParam = q.get("positions");
  const total = Number(q.get("totalValue") ?? DEFAULT_PORTFOLIO.totalValue);
  let positions = DEFAULT_PORTFOLIO.positions;
  if (posParam) {
    try {
      positions = posParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pair) => {
          const [symbol, qty] = pair.split(":");
          return { symbol: symbol.toUpperCase(), quantity: Number(qty) };
        })
        .filter((p) => p.symbol && Number.isFinite(p.quantity) && p.quantity !== 0);
      if (positions.length === 0) positions = DEFAULT_PORTFOLIO.positions;
    } catch {
      positions = DEFAULT_PORTFOLIO.positions;
    }
  }
  return { positions, totalValue: total };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  const horizon = Math.min(20, Math.max(1, Math.round(Number(q.get("horizon") ?? 1))));
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const primary = (q.get("method") as Methodology) || "historical";
  const portfolio = parsePortfolio(q);

  // Symbols = unique symbols from the portfolio positions
  const symbols = portfolio.positions.map((p) => p.symbol);

  try {
    const { market, summary } = await getRealMarketDataCached(symbols, days);
    const report = buildFullReport(market, portfolio, confidence, horizon, primary);
    return NextResponse.json({ ok: true, report, dataSource: summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
