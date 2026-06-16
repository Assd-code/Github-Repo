// VaR limit monitoring: compare live VaR (computed per each limit's method/
// confidence/horizon) against persisted limits, flag warnings & breaches.

import { db } from "@/lib/db";
import { MarketData, PortfolioConfig, LimitMonitoring, VarLimitDef, Methodology } from "./types";
import { runVar } from "./methods";
import { seedDefaults } from "./seed";

function toDef(row: any): VarLimitDef {
  return {
    id: row.id,
    scope: row.scope,
    label: row.label,
    method: row.method as Methodology,
    confidence: row.confidence,
    horizon: row.horizon,
    limitUsd: row.limitUsd,
    softLimitUsd: row.softLimitUsd,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function computeLimitMonitoring(
  market: MarketData,
  portfolio: PortfolioConfig
): Promise<LimitMonitoring> {
  await seedDefaults();
  const rows = await db.varLimit.findMany({ where: { active: true }, orderBy: { limitUsd: "desc" } });
  const limits = rows.map(toDef);

  const readings = limits.map((limit) => {
    const res = runVar(market, portfolio, limit.method, limit.confidence, limit.horizon, {
      mcPaths: 5000,
      seed: 42,
      decay: 0.94,
      evtThreshold: 0.9,
    });
    const varValue = res.var;
    const utilization = limit.limitUsd > 0 ? varValue / limit.limitUsd : 0;
    let status: "ok" | "warning" | "breach";
    if (varValue > limit.limitUsd) status = "breach";
    else if (limit.softLimitUsd !== null && varValue > limit.softLimitUsd) status = "warning";
    else status = "ok";
    const headroomUsd = limit.limitUsd - varValue;
    return {
      limit,
      var: varValue,
      es: res.es,
      utilization,
      status,
      headroomUsd,
    };
  });

  const breachCount = readings.filter((r) => r.status === "breach").length;
  const warningCount = readings.filter((r) => r.status === "warning").length;
  const worstStatus: "ok" | "warning" | "breach" =
    breachCount > 0 ? "breach" : warningCount > 0 ? "warning" : "ok";

  // Persist ALL readings (for audit history + breach alert feed + heatmap).
  // This creates one row per limit per API call, giving a rich time series.
  try {
    await db.varReading.createMany({
      data: readings.map((r) => ({
        scope: r.limit.scope,
        method: r.limit.method,
        confidence: r.limit.confidence,
        horizon: r.limit.horizon,
        varUsd: r.var,
        esUsd: r.es,
        limitUsd: r.limit.limitUsd,
        utilization: r.utilization,
        breached: r.status === "breach",
      })),
    });
  } catch {
    // persistence is best-effort
  }

  return { limits, readings, worstStatus, breachCount, warningCount };
}

export async function listLimits(): Promise<VarLimitDef[]> {
  await seedDefaults();
  const rows = await db.varLimit.findMany({ where: { active: true }, orderBy: { limitUsd: "desc" } });
  return rows.map(toDef);
}

export async function upsertLimit(input: Omit<VarLimitDef, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<VarLimitDef> {
  if (input.id) {
    const row = await db.varLimit.update({
      where: { id: input.id },
      data: {
        scope: input.scope,
        label: input.label,
        method: input.method,
        confidence: input.confidence,
        horizon: input.horizon,
        limitUsd: input.limitUsd,
        softLimitUsd: input.softLimitUsd,
        active: input.active,
      },
    });
    return toDef(row);
  }
  const row = await db.varLimit.create({
    data: {
      scope: input.scope,
      label: input.label,
      method: input.method,
      confidence: input.confidence,
      horizon: input.horizon,
      limitUsd: input.limitUsd,
      softLimitUsd: input.softLimitUsd,
      active: input.active,
    },
  });
  return toDef(row);
}

export async function deleteLimit(id: string): Promise<void> {
  await db.varLimit.delete({ where: { id } });
}

/** Recent VaR readings for the audit / breach history chart. */
export async function recentReadings(scope: string, limit: number = 30) {
  const rows = await db.varReading.findMany({
    where: { scope },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows
    .map((r) => ({
      date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      var: r.varUsd,
      es: r.esUsd,
      limit: r.limitUsd,
      utilization: r.utilization,
      breached: r.breached,
    }))
    .reverse();
}

/** Breach alert feed: recent breaches + warnings across all scopes. */
export async function breachFeed(limit: number = 30) {
  const rows = await db.varReading.findMany({
    where: {
      OR: [{ breached: true }, { utilization: { gte: 0.8 } }],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    scope: r.scope,
    method: r.method,
    confidence: r.confidence,
    horizon: r.horizon,
    var: r.varUsd,
    limit: r.limitUsd ?? 0,
    utilization: r.utilization ?? 0,
    severity: r.breached ? "breach" as const : "warning" as const,
  }));
}

/** Limit utilization heatmap: scope × time-slot matrix of utilization values. */
export async function utilizationHeatmap(slots: number = 12) {
  // Get all scopes that have limits.
  const limits = await db.varLimit.findMany({ where: { active: true } });
  const scopes = [...new Set(limits.map((l) => l.scope))];

  // For each scope, get the most recent `slots` readings.
  const matrix: { scope: string; label: string; values: (number | null)[] }[] = [];
  for (const scope of scopes) {
    const rows = await db.varReading.findMany({
      where: { scope },
      orderBy: { createdAt: "desc" },
      take: slots,
    });
    const label = limits.find((l) => l.scope === scope)?.label ?? scope;
    const values: (number | null)[] = [];
    // Pad to `slots` length, oldest first.
    const padded = [...rows].reverse();
    for (let i = 0; i < slots; i++) {
      values.push(padded[i] ? (padded[i].utilization ?? 0) : null);
    }
    matrix.push({ scope, label, values });
  }
  return matrix;
}

