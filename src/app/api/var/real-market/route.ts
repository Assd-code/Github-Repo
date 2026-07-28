import { NextRequest, NextResponse } from "next/server";
import { getRealMarketDataCached } from "@/lib/var/cache";
import { MAX_SYMBOLS, apiErrorResponse, validateSymbol } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const symbolsParam = q.get("symbols") || "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json(
      { ok: false, error: "symbols query parameter required (comma-separated)" },
      { status: 400 }
    );
  }
  try {
    if (symbols.length > MAX_SYMBOLS) {
      return NextResponse.json({ ok: false, error: `symbols cannot exceed ${MAX_SYMBOLS} entries` }, { status: 400 });
    }
    const validatedSymbols = [...new Set(symbols.map((symbol) => validateSymbol(symbol)))];
    const { market, summary } = await getRealMarketDataCached(validatedSymbols, 504);
    // Build a compact market series response for the frontend
    const lastRow = market.prices[market.prices.length - 1];
    const assets = market.assets.map((a, i) => ({
      symbol: a.symbol,
      name: a.name,
      assetClass: a.assetClass,
      drift: a.drift,
      vol: a.vol,
      spot: lastRow[i],
    }));
    // Downsample price series for charting (every 3rd day)
    const step = Math.max(1, Math.floor(market.dates.length / 200));
    const series: Record<string, number[]> = {};
    for (const a of assets) series[a.symbol] = [];
    const dates: string[] = [];
    for (let i = 0; i < market.dates.length; i += step) {
      dates.push(market.dates[i]);
      for (let j = 0; j < assets.length; j++) {
        series[assets[j].symbol].push(market.prices[i][j]);
      }
    }
    // Correlation matrix
    const n = market.assets.length;
    const correlation: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => {
        const cov = market.cov[i][j];
        const stdI = Math.sqrt(Math.max(market.cov[i][i], 1e-18));
        const stdJ = Math.sqrt(Math.max(market.cov[j][j], 1e-18));
        return stdI > 0 && stdJ > 0 ? cov / (stdI * stdJ) : 0;
      })
    );
    return NextResponse.json({
      ok: true,
      assets,
      dates,
      series,
      correlation,
      windowDays: market.dates.length,
      dataSource: summary,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
