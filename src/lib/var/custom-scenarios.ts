// Custom scenario builder: run user-defined shock matrices against the portfolio.
// Scenarios can be persisted to the database (SavedScenario table).

import { db } from "@/lib/db";
import { MarketData, PortfolioConfig, CustomScenario, CustomScenarioResult, AssetClass } from "./types";
import { portfolioWeights } from "./market-data";
import { runVar } from "./methods";

/** Run a single custom scenario against the portfolio. */
export function runCustomScenario(
  market: MarketData,
  portfolio: PortfolioConfig,
  scenario: CustomScenario,
  confidence: number = 0.99,
  horizon: number = 1
): CustomScenarioResult {
  const { marketValues } = portfolioWeights(portfolio.positions, market, portfolio.totalValue);
  const lastPrices = market.prices[market.prices.length - 1];
  const n = market.assets.length;
  const varRef = runVar(market, portfolio, "historical", confidence, horizon).var;

  let pnl = 0;
  let worstSym = "";
  let worstPnl = Infinity;
  let bestSym = "";
  let bestPnl = -Infinity;
  const perAsset: CustomScenarioResult["perAsset"] = [];

  for (let i = 0; i < n; i++) {
    const asset = market.assets[i];
    const shock = scenario.shocks[asset.symbol] ?? 1;
    const newPrice = lastPrices[i] * shock;
    const assetPnl = (newPrice - lastPrices[i]) * (marketValues[i] / lastPrices[i]);
    pnl += assetPnl;
    perAsset.push({
      symbol: asset.symbol,
      name: asset.name,
      shock: shock - 1, // store as fractional change (-0.2 = -20%)
      pnl: assetPnl,
      assetClass: asset.assetClass as AssetClass,
    });
    if (assetPnl < worstPnl) {
      worstPnl = assetPnl;
      worstSym = asset.symbol;
    }
    if (assetPnl > bestPnl) {
      bestPnl = assetPnl;
      bestSym = asset.symbol;
    }
  }

  return {
    name: scenario.name,
    pnl,
    pnlPct: pnl / portfolio.totalValue,
    breachesVar: pnl < -varRef,
    perAsset: perAsset.sort((a, b) => a.pnl - b.pnl),
    worstContributor: { symbol: worstSym, pnl: worstPnl },
    bestContributor: { symbol: bestSym, pnl: bestPnl },
  };
}

/** Persist a custom scenario. */
export async function saveScenario(scenario: CustomScenario): Promise<CustomScenario & { id: string }> {
  const row = await db.savedScenario.create({
    data: {
      name: scenario.name,
      description: scenario.description || "",
      type: "custom",
      shocks: JSON.stringify(scenario.shocks),
    },
  });
  return { ...scenario, id: row.id, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt), updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt) };
}

/** List all saved scenarios. */
export async function listScenarios(): Promise<CustomScenario[]> {
  const rows = await db.savedScenario.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || "",
    type: "custom" as const,
    shocks: JSON.parse(r.shocks),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
  }));
}

/** Delete a saved scenario. */
export async function deleteScenario(id: string): Promise<void> {
  await db.savedScenario.delete({ where: { id } });
}

/** Seed a few useful example custom scenarios on first run. */
export async function seedExampleScenarios(): Promise<void> {
  const count = await db.savedScenario.count();
  if (count > 0) return;
  const examples = [
    {
      name: "Tech Wipeout",
      description: "Tech-led equity selloff with crypto contagion; bonds bid as safe haven.",
      shocks: { SPX: 0.92, AAPL: 0.80, XOM: 0.95, TLT: 1.06, EURUSD: 0.98, GOLD: 1.04, BTC: 0.70 },
    },
    {
      name: "Inflation Surprise",
      description: "Hot CPI prints trigger rate sell-off; long bonds and growth equities hit hardest.",
      shocks: { SPX: 0.94, AAPL: 0.90, XOM: 1.08, TLT: 0.90, EURUSD: 0.97, GOLD: 1.03, BTC: 0.88 },
    },
    {
      name: "Gold Rally",
      description: "Geopolitical tension drives gold +15%, risk assets mildly off.",
      shocks: { SPX: 0.97, AAPL: 0.96, XOM: 0.98, TLT: 1.02, EURUSD: 0.99, GOLD: 1.15, BTC: 0.94 },
    },
  ];
  for (const ex of examples) {
    await db.savedScenario.create({
      data: { name: ex.name, description: ex.description, type: "custom", shocks: JSON.stringify(ex.shocks) },
    });
  }
}
