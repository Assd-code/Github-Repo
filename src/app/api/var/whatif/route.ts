import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { DEFAULT_PORTFOLIO } from "@/lib/var/engine";
import { Methodology } from "@/lib/var/types";
import { runWhatIf, whatIfPreset } from "@/lib/var/whatif";
import { parsePortfolioSearchParams } from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const confidence = Math.min(0.999, Math.max(0.9, Number(q.get("confidence") ?? 0.99)));
  const horizon = Math.min(20, Math.max(1, Math.round(Number(q.get("horizon") ?? 1))));
  const seed = Number(q.get("seed") ?? 42);
  const days = Math.min(1000, Math.max(250, Number(q.get("days") ?? 504)));
  const portfolio = parsePortfolioSearchParams(q, DEFAULT_PORTFOLIO);

  // Parse target weights from query: weights=SPX:0.3,AAPL:0.2,...
  // Or use a preset: preset=risk-off
  let targetWeights: Record<string, number> = {};
  const preset = q.get("preset");
  if (preset) {
    const validPresets = ["risk-off", "risk-on", "equal-weight", "concentrate-btc", "concentrate-spx"];
    if (validPresets.includes(preset)) {
      targetWeights = whatIfPreset(preset as "risk-off" | "risk-on" | "equal-weight" | "concentrate-btc" | "concentrate-spx");
    }
  } else {
    const wParam = q.get("weights");
    if (wParam) {
      try {
        wParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .forEach((pair) => {
            const [symbol, w] = pair.split(":");
            const wNum = Number(w);
            if (symbol && Number.isFinite(wNum)) {
              targetWeights[symbol.toUpperCase()] = Math.max(0, Math.min(1, wNum));
            }
          });
      } catch {
        // ignore
      }
    }
  }

  const baselineVar = Number(q.get("baselineVar") ?? 0);
  const baselineEs = Number(q.get("baselineEs") ?? 0);

  try {
    const market = getMarketData(days, seed);
    const result = runWhatIf(
      market,
      portfolio,
      targetWeights,
      confidence,
      horizon,
      baselineVar,
      baselineEs
    );
    return NextResponse.json({ ok: true, whatif: result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
