// Seed the database with default VaR limits and ensure a clean baseline.

import { db } from "@/lib/db";

const DEFAULT_LIMITS = [
  { scope: "portfolio:default", label: "Portfolio Hard Limit (99%)", method: "historical", confidence: 0.99, horizon: 1, limitUsd: 400_000, softLimitUsd: 320_000 },
  { scope: "portfolio:default", label: "Portfolio 10-day Regulatory (99%)", method: "historical", confidence: 0.99, horizon: 10, limitUsd: 1_200_000, softLimitUsd: 960_000 },
  { scope: "desk:equities", label: "Equities Desk (95%)", method: "parametric", confidence: 0.95, horizon: 1, limitUsd: 150_000, softLimitUsd: 120_000 },
  { scope: "desk:crypto", label: "Crypto Desk (99%)", method: "montecarlo", confidence: 0.99, horizon: 1, limitUsd: 80_000, softLimitUsd: 64_000 },
  { scope: "desk:rates", label: "Rates Desk (99%)", method: "historical", confidence: 0.99, horizon: 1, limitUsd: 250_000, softLimitUsd: 200_000 },
];

export async function seedDefaults() {
  // Seed VaR limits if none exist.
  const existing = await db.varLimit.count();
  if (existing === 0) {
    await db.varLimit.createMany({ data: DEFAULT_LIMITS });
  }
  return db.varLimit.findMany({ where: { active: true }, orderBy: { limitUsd: "desc" } });
}
