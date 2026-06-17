import { NextRequest, NextResponse } from "next/server";
import { PortfolioConfig } from "@/lib/var/types";
import {
  listSavedPortfolios,
  getSavedPortfolio,
  savePortfolio,
  deletePortfolio,
  deletePortfolioById,
  seedExamplePortfolios,
} from "@/lib/var/saved-portfolios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    await seedExamplePortfolios();
    const portfolios = await listSavedPortfolios();
    return NextResponse.json({ ok: true, portfolios });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "save") {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("name is required");
      const positions = Array.isArray(body.positions)
        ? body.positions.map((p: { symbol: string; quantity: number }) => ({
            symbol: String(p.symbol).toUpperCase(),
            quantity: Number(p.quantity),
          }))
        : [];
      const totalValue = Number(body.totalValue);
      const description = body.description ? String(body.description) : undefined;
      const tags = body.tags ? String(body.tags) : undefined;
      const portfolio: PortfolioConfig = { positions, totalValue };
      const saved = await savePortfolio(name, portfolio, description, tags);
      return NextResponse.json({ ok: true, portfolio: saved });
    }

    if (action === "load") {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("name is required");
      const portfolio = await getSavedPortfolio(name);
      if (!portfolio) throw new Error(`portfolio '${name}' not found`);
      return NextResponse.json({ ok: true, portfolio });
    }

    if (action === "delete") {
      if (body.id) {
        await deletePortfolioById(String(body.id));
      } else if (body.name) {
        await deletePortfolio(String(body.name));
      } else {
        throw new Error("id or name required");
      }
      return NextResponse.json({ ok: true });
    }

    throw new Error(`unknown action: ${action}`);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 }
    );
  }
}
