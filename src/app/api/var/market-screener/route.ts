import { NextRequest, NextResponse } from "next/server";
import {
  ApiValidationError,
  apiErrorResponse,
  validateNumber,
  validateSymbol,
  validateText,
} from "@/lib/var/api-validation";
import {
  getMarketUniverseSymbols,
  isMarketUniverseId,
  type MarketUniverseId,
} from "@/lib/var/market-universe";
import {
  scanMarketUniverse,
  type MarketScreenerMethod,
} from "@/lib/var/market-screener";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

const MAX_MARKET_SCAN_SYMBOLS = 200;
const SCREENER_METHODS = new Set<MarketScreenerMethod>(["historical", "parametric"]);

function parseSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ApiValidationError("symbols must be an array");
  if (value.length === 0 || value.length > MAX_MARKET_SCAN_SYMBOLS) {
    throw new ApiValidationError(`symbols must contain between 1 and ${MAX_MARKET_SCAN_SYMBOLS} entries`);
  }
  return [...new Set(value.map((symbol, index) => validateSymbol(symbol, `symbols[${index}]`)))];
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => {
      throw new ApiValidationError("A valid JSON request body is required");
    });
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiValidationError("Request body is invalid");
    }
    const record = body as Record<string, unknown>;
    const universeText = validateText(record.universe ?? "global", "universe", { required: true, max: 40 });
    if (!isMarketUniverseId(universeText)) throw new ApiValidationError("universe is invalid");
    const universe = universeText as MarketUniverseId;

    const methodText = validateText(record.method ?? "historical", "method", { required: true, max: 20 });
    if (!SCREENER_METHODS.has(methodText as MarketScreenerMethod)) {
      throw new ApiValidationError("method must be historical or parametric");
    }
    const method = methodText as MarketScreenerMethod;
    const confidence = validateNumber(record.confidence ?? 0.99, "confidence", { min: 0.9, max: 0.999 });
    const horizon = validateNumber(record.horizon ?? 1, "horizon", { min: 1, max: 20, integer: true });
    const notional = validateNumber(record.notional ?? 100_000, "notional", { min: 1, max: 1_000_000_000_000 });

    const symbols = universe === "custom"
      ? parseSymbols(record.symbols)
      : getMarketUniverseSymbols(universe);
    if (symbols.length > MAX_MARKET_SCAN_SYMBOLS) {
      throw new ApiValidationError(`universe exceeds the ${MAX_MARKET_SCAN_SYMBOLS}-symbol scan limit`);
    }

    const scan = await scanMarketUniverse(symbols, { method, confidence, horizon, notional });
    return NextResponse.json({
      ok: true,
      universe,
      ...scan,
      rankingBasis: "Equal-notional standalone VaR; highest VaR ranks first",
      coverageNotice: "Coverage is limited to this configured universe and symbols supported by the data provider.",
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
