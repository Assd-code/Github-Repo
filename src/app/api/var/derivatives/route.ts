import { NextRequest, NextResponse } from "next/server";
import { getMarketData } from "@/lib/var/cache";
import { computeDerivativesAnalysis, getDefaultOptions } from "@/lib/var/derivatives";
import { OptionPosition } from "@/lib/var/types";
import {
  MAX_OPTIONS,
  ApiValidationError,
  apiErrorResponse,
  validateNumber,
  validateSymbol,
  validateText,
} from "@/lib/var/api-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validateOptions(value: unknown): OptionPosition[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OPTIONS) {
    throw new ApiValidationError(`options must contain between 1 and ${MAX_OPTIONS} entries`);
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiValidationError(`options[${index}] is invalid`);
    const option = item as Record<string, unknown>;
    const type = validateText(option.type, `options[${index}].type`, { required: true, max: 4 });
    const direction = validateText(option.direction, `options[${index}].direction`, { required: true, max: 5 });
    if (type !== "call" && type !== "put") throw new ApiValidationError(`options[${index}].type is invalid`);
    if (direction !== "long" && direction !== "short") throw new ApiValidationError(`options[${index}].direction is invalid`);
    return {
      symbol: validateSymbol(option.symbol, `options[${index}].symbol`),
      underlying: validateSymbol(option.underlying, `options[${index}].underlying`),
      type,
      direction,
      quantity: validateNumber(option.quantity, `options[${index}].quantity`, { min: 0.000001, max: 1_000_000_000 }),
      contractSize: validateNumber(option.contractSize, `options[${index}].contractSize`, { min: 0.000001, max: 1_000_000 }),
      strike: validateNumber(option.strike, `options[${index}].strike`, { min: 0.000001, max: 1_000_000_000 }),
      maturity: validateNumber(option.maturity, `options[${index}].maturity`, { min: 0.000001, max: 100 }),
      impliedVol: validateNumber(option.impliedVol, `options[${index}].impliedVol`, { min: 0.000001, max: 10 }),
      riskFreeRate: validateNumber(option.riskFreeRate, `options[${index}].riskFreeRate`, { min: -1, max: 1 }),
    };
  });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    const seed = validateNumber(q.get("seed") ?? 42, "seed", { min: -2_147_483_648, max: 2_147_483_647, integer: true });
    const days = validateNumber(q.get("days") ?? 504, "days", { min: 250, max: 1000, integer: true });
    const confidence = validateNumber(q.get("confidence") ?? 0.99, "confidence", { min: 0.9, max: 0.999 });
    const market = getMarketData(days, seed);
    const analysis = computeDerivativesAnalysis(market, getDefaultOptions(market), confidence);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const seed = validateNumber(body.seed ?? 42, "seed", { min: -2_147_483_648, max: 2_147_483_647, integer: true });
    const days = validateNumber(body.days ?? 504, "days", { min: 250, max: 1000, integer: true });
    const confidence = validateNumber(body.confidence ?? 0.99, "confidence", { min: 0.9, max: 0.999 });
    const options = validateOptions(body.options) ?? getDefaultOptions(getMarketData(days, seed));
    const market = getMarketData(days, seed);
    const analysis = computeDerivativesAnalysis(market, options, confidence);
    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
