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
// Uses Yahoo Finance-compatible symbols so they work with real data mode.
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
        { symbol: "SPY", quantity: 1200 },
        { symbol: "AAPL", quantity: 18000 },
        { symbol: "XOM", quantity: 12000 },
        { symbol: "TLT", quantity: 60000 },
        { symbol: "EURUSD=X", quantity: 2_000_000 },
        { symbol: "GLD", quantity: 600 },
        { symbol: "BTC-USD", quantity: 15 },
      ],
      tags: "balanced,low-risk",
    },
    {
      name: "Tech Growth",
      description: "Concentrated tech & crypto growth portfolio",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPY", quantity: 1000 },
        { symbol: "AAPL", quantity: 25000 },
        { symbol: "NVDA", quantity: 5000 },
        { symbol: "MSFT", quantity: 8000 },
        { symbol: "BTC-USD", quantity: 80 },
        { symbol: "TLT", quantity: 10000 },
        { symbol: "GLD", quantity: 200 },
      ],
      tags: "growth,high-risk",
    },
    {
      name: "Risk Parity",
      description: "Risk-balanced book approximating equal risk contribution",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPY", quantity: 600 },
        { symbol: "AAPL", quantity: 6000 },
        { symbol: "TLT", quantity: 70000 },
        { symbol: "EURUSD=X", quantity: 5_000_000 },
        { symbol: "GLD", quantity: 1200 },
        { symbol: "BTC-USD", quantity: 25 },
      ],
      tags: "risk-parity,diversified",
    },
    {
      name: "Bear Hedged",
      description: "Long equity + SPXS bear 3x hedge for tail protection",
      totalValue: 10_000_000,
      positions: [
        { symbol: "SPY", quantity: 1500 },
        { symbol: "AAPL", quantity: 10000 },
        { symbol: "SPXS", quantity: 30000 },
        { symbol: "TLT", quantity: 30000 },
        { symbol: "GLD", quantity: 500 },
      ],
      tags: "hedged,bear,tail-risk",
    },
    {
      name: "Crypto Whale",
      description: "Crypto-heavy speculative book",
      totalValue: 10_000_000,
      positions: [
        { symbol: "BTC-USD", quantity: 120 },
        { symbol: "ETH-USD", quantity: 2000 },
        { symbol: "SPY", quantity: 400 },
        { symbol: "GLD", quantity: 300 },
      ],
      tags: "crypto,high-risk,speculative",
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
