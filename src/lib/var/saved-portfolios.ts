// Saved Portfolio CRUD operations (Prisma persistence).
// Users can save the current portfolio under a name and reload it later.
// Supports listing, creating, updating, deleting, and loading by name.
//
// Note: we import PrismaClient directly and create a fresh instance per call
// (in dev mode) to avoid stale-singleton issues when the schema changes.
// In production this would use a shared singleton for connection pooling.

import { PrismaClient } from "@prisma/client";
import { PortfolioConfig, Position } from "./types";

// Lazy singleton — created on first use, not on module import (so HMR can
// pick up schema changes between requests).
let _db: PrismaClient | null = null;
function getDb(): PrismaClient {
  if (_db) return _db;
  _db = new PrismaClient({ log: [] });
  return _db;
}

export interface SavedPortfolioRecord {
  id: string;
  name: string;
  description: string | null;
  totalValue: number;
  positions: Position[];
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseRecord(row: {
  id: string;
  name: string;
  description: string | null;
  totalValue: number;
  positions: string;
  tags: string | null;
  createdAt: Date;
  updatedAt: Date;
}): SavedPortfolioRecord {
  let positions: Position[] = [];
  try {
    positions = JSON.parse(row.positions);
  } catch {
    positions = [];
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    totalValue: row.totalValue,
    positions,
    tags: row.tags,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listSavedPortfolios(): Promise<SavedPortfolioRecord[]> {
  const rows = await getDb().savedPortfolio.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(parseRecord);
}

export async function getSavedPortfolio(name: string): Promise<SavedPortfolioRecord | null> {
  const row = await getDb().savedPortfolio.findUnique({ where: { name } });
  return row ? parseRecord(row) : null;
}

export async function savePortfolio(
  name: string,
  portfolio: PortfolioConfig,
  description?: string,
  tags?: string
): Promise<SavedPortfolioRecord> {
  const positionsJson = JSON.stringify(
    portfolio.positions.filter((p) => p.quantity !== 0)
  );
  const row = await getDb().savedPortfolio.upsert({
    where: { name },
    create: {
      name,
      description: description ?? null,
      totalValue: portfolio.totalValue,
      positions: positionsJson,
      tags: tags ?? null,
    },
    update: {
      description: description ?? undefined,
      totalValue: portfolio.totalValue,
      positions: positionsJson,
      tags: tags ?? undefined,
    },
  });
  return parseRecord(row);
}

export async function deletePortfolio(name: string): Promise<void> {
  await getDb().savedPortfolio.deleteMany({ where: { name } });
}

export async function deletePortfolioById(id: string): Promise<void> {
  await getDb().savedPortfolio.delete({ where: { id } });
}

// Seed a few example portfolios if the table is empty.
export async function seedExamplePortfolios(): Promise<void> {
  const db = getDb();
  const count = await db.savedPortfolio.count();
  if (count > 0) return;
  const examples: { name: string; description: string; totalValue: number; positions: Position[]; tags: string }[] = [
    {
      name: "Balanced 60/40",
      description: "60% equity / 40% bonds — classic balanced book",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPX", quantity: 1200 },
        { symbol: "AAPL", quantity: 18000 },
        { symbol: "XOM", quantity: 12000 },
        { symbol: "TLT", quantity: 60000 },
        { symbol: "EURUSD", quantity: 2_000_000 },
        { symbol: "GOLD", quantity: 600 },
        { symbol: "BTC", quantity: 15 },
      ],
      tags: "balanced,low-risk",
    },
    {
      name: "Tech Growth",
      description: "Concentrated tech & crypto growth portfolio",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPX", quantity: 1000 },
        { symbol: "AAPL", quantity: 25000 },
        { symbol: "BTC", quantity: 80 },
        { symbol: "TLT", quantity: 10000 },
        { symbol: "EURUSD", quantity: 1_000_000 },
        { symbol: "GOLD", quantity: 200 },
        { symbol: "XOM", quantity: 5000 },
      ],
      tags: "growth,high-risk",
    },
    {
      name: "Risk Parity",
      description: "Risk-balanced book approximating equal risk contribution",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPX", quantity: 600 },
        { symbol: "AAPL", quantity: 6000 },
        { symbol: "XOM", quantity: 8000 },
        { symbol: "TLT", quantity: 70000 },
        { symbol: "EURUSD", quantity: 5_000_000 },
        { symbol: "GOLD", quantity: 1200 },
        { symbol: "BTC", quantity: 25 },
      ],
      tags: "risk-parity,diversified",
    },
  ];
  for (const ex of examples) {
    await db.savedPortfolio.create({
      data: {
        name: ex.name,
        description: ex.description,
        totalValue: ex.totalValue,
        positions: JSON.stringify(ex.positions),
        tags: ex.tags,
      },
    });
  }
}
