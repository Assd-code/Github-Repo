import { NextResponse } from "next/server";
import type { Methodology, PortfolioConfig, Position } from "./types";

export const MAX_POSITIONS = 100;
export const MAX_SCENARIOS = 50;
export const MAX_OPTIONS = 100;
export const MAX_SYMBOLS = 50;

const SYMBOL_PATTERN = /^[A-Z0-9.^=_-]{1,20}$/;
const METHODS = new Set<Methodology>([
  "parametric",
  "historical",
  "montecarlo",
  "filtered",
  "evt",
]);

export class ApiValidationError extends Error {}

export function validateText(
  value: unknown,
  field: string,
  options: { max?: number; required?: boolean } = {},
): string {
  const text = typeof value === "string" ? value.trim() : "";
  const max = options.max ?? 200;
  if (options.required && !text) throw new ApiValidationError(`${field} is required`);
  if (text.length > max) throw new ApiValidationError(`${field} must be ${max} characters or fewer`);
  return text;
}

export function validateId(value: unknown, field = "id"): string {
  const id = validateText(value, field, { required: true, max: 128 });
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new ApiValidationError(`${field} is invalid`);
  return id;
}

export function validateNumber(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new ApiValidationError(`${field} must be a finite number`);
  if (options.integer && !Number.isInteger(number)) throw new ApiValidationError(`${field} must be an integer`);
  if (options.min != null && number < options.min) throw new ApiValidationError(`${field} is below the minimum`);
  if (options.max != null && number > options.max) throw new ApiValidationError(`${field} is above the maximum`);
  return number;
}

export function validateSymbol(value: unknown, field = "symbol"): string {
  const symbol = validateText(value, field, { required: true, max: 20 }).toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) throw new ApiValidationError(`${field} contains unsupported characters`);
  return symbol;
}

export function validatePositions(value: unknown, fallback?: Position[]): Position[] {
  if (value == null && fallback) return fallback;
  if (!Array.isArray(value) || value.length === 0) throw new ApiValidationError("positions must be a non-empty array");
  if (value.length > MAX_POSITIONS) throw new ApiValidationError(`positions cannot exceed ${MAX_POSITIONS} entries`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new ApiValidationError(`positions[${index}] is invalid`);
    const record = item as Record<string, unknown>;
    return {
      symbol: validateSymbol(record.symbol, `positions[${index}].symbol`),
      quantity: validateNumber(record.quantity, `positions[${index}].quantity`, {
        min: -1_000_000_000_000,
        max: 1_000_000_000_000,
      }),
    };
  }).filter((position) => position.quantity !== 0);
}

export function validatePortfolio(value: {
  positions: unknown;
  totalValue: unknown;
}, fallback?: PortfolioConfig): PortfolioConfig {
  const positions = validatePositions(value.positions, fallback?.positions);
  if (positions.length === 0) throw new ApiValidationError("positions must contain at least one non-zero quantity");
  return {
    positions,
    totalValue: validateNumber(value.totalValue ?? fallback?.totalValue, "totalValue", {
      min: 1,
      max: 1_000_000_000_000_000,
    }),
  };
}

export function parsePortfolioSearchParams(
  searchParams: URLSearchParams,
  fallback: PortfolioConfig,
): PortfolioConfig {
  const encodedPositions = searchParams.get("positions");
  if (!encodedPositions) {
    return validatePortfolio({
      positions: fallback.positions,
      totalValue: searchParams.get("totalValue") ?? fallback.totalValue,
    });
  }
  const pairs = encodedPositions.split(",").filter(Boolean);
  if (pairs.length === 0 || pairs.length > MAX_POSITIONS) {
    throw new ApiValidationError(`positions must contain between 1 and ${MAX_POSITIONS} entries`);
  }
  const positions = pairs.map((pair, index) => {
    const separator = pair.lastIndexOf(":");
    if (separator <= 0) throw new ApiValidationError(`positions[${index}] is invalid`);
    return {
      symbol: validateSymbol(pair.slice(0, separator), `positions[${index}].symbol`),
      quantity: validateNumber(pair.slice(separator + 1), `positions[${index}].quantity`, {
        min: -1_000_000_000_000,
        max: 1_000_000_000_000,
      }),
    };
  });
  return validatePortfolio({
    positions,
    totalValue: searchParams.get("totalValue") ?? fallback.totalValue,
  });
}

export function validateMethodology(value: unknown, field = "method"): Methodology {
  const method = validateText(value, field, { required: true, max: 20 }) as Methodology;
  if (!METHODS.has(method)) throw new ApiValidationError(`${field} is invalid`);
  return method;
}

export function validateShocks(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiValidationError("shocks must be an object");
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_POSITIONS) {
    throw new ApiValidationError(`shocks must contain between 1 and ${MAX_POSITIONS} entries`);
  }
  return Object.fromEntries(entries.map(([symbol, shock]) => [
    validateSymbol(symbol, "shock symbol"),
    validateNumber(shock, `shock ${symbol}`, { min: 0, max: 10 }),
  ]));
}

export function apiErrorResponse(error: unknown) {
  const validation = error instanceof ApiValidationError;
  return NextResponse.json(
    { ok: false, error: validation ? error.message : "The request could not be completed" },
    { status: validation ? 400 : 500 },
  );
}
