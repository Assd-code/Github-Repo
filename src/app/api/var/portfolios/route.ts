import { NextRequest, NextResponse } from "next/server";
import { PortfolioConfig } from "@/lib/var/types";
import {
  apiErrorResponse,
  validateId,
  validatePortfolio,
  validateText,
} from "@/lib/var/api-validation";
import {
  listSavedPortfolios,
  getSavedPortfolio,
  savePortfolio,
  deletePortfolio,
  deletePortfolioById,
} from "@/lib/var/saved-portfolios";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const portfolios = await listSavedPortfolios();
    return NextResponse.json({ ok: true, portfolios });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const action = validateText(body.action, "action", { required: true, max: 20 });

    if (action === "save") {
      const name = validateText(body.name, "name", { required: true, max: 120 });
      const portfolio = validatePortfolio({ positions: body.positions, totalValue: body.totalValue });
      const description = validateText(body.description, "description", { max: 1000 }) || undefined;
      const tags = validateText(body.tags, "tags", { max: 500 }) || undefined;
      const saved = await savePortfolio(name, portfolio, description, tags);
      return NextResponse.json({ ok: true, portfolio: saved });
    }

    if (action === "load") {
      const name = validateText(body.name, "name", { required: true, max: 120 });
      const portfolio = await getSavedPortfolio(name);
      if (!portfolio) throw new Error(`portfolio '${name}' not found`);
      return NextResponse.json({ ok: true, portfolio });
    }

    if (action === "delete") {
      if (body.id) {
        await deletePortfolioById(validateId(body.id));
      } else if (body.name) {
        await deletePortfolio(validateText(body.name, "name", { required: true, max: 120 }));
      } else {
        throw new Error("id or name required");
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "duplicate") {
      const sourceName = validateText(body.sourceName, "sourceName", { required: true, max: 120 });
      const newName = validateText(body.newName, "newName", { required: true, max: 120 });
      const source = await getSavedPortfolio(sourceName);
      if (!source) throw new Error(`portfolio '${sourceName}' not found`);
      const portfolio: PortfolioConfig = { positions: source.positions, totalValue: source.totalValue };
      const saved = await savePortfolio(
        newName,
        portfolio,
        source.description ? `${source.description} (copy)` : "Duplicated portfolio",
        source.tags ?? undefined
      );
      return NextResponse.json({ ok: true, portfolio: saved });
    }

    if (action === "new") {
      // Create a blank portfolio with a single default position
      const name = validateText(body.name, "name", { required: true, max: 120 });
      const portfolio: PortfolioConfig = {
        positions: [{ symbol: "SPY", quantity: 1000 }],
        totalValue: 10_000_000,
      };
      const saved = await savePortfolio(name, portfolio, "New blank portfolio");
      return NextResponse.json({ ok: true, portfolio: saved });
    }

    throw new Error(`unknown action: ${action}`);
  } catch (err) {
    return apiErrorResponse(err);
  }
}
