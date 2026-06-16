"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { FullReport } from "@/lib/var/types";
import { fmtUSD, fmtPct, fmtQty } from "@/lib/format";

const CLASS_COLOR: Record<string, string> = {
  equity: "border-chart-1/40 text-chart-1",
  fx: "border-chart-2/40 text-chart-2",
  commodity: "border-chart-5/40 text-chart-5",
  rate: "border-chart-3/40 text-chart-3",
  crypto: "border-chart-4/40 text-chart-4",
};

export function PortfolioPanel({ report }: { report: FullReport }) {
  const positions = [...report.portfolio.positions].sort((a, b) => b.marketValue - a.marketValue);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Portfolio Holdings</CardTitle>
        <CardDescription>
          {positions.length} positions · total book value {fmtUSD(report.portfolio.totalValue)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 text-xs">Symbol</TableHead>
              <TableHead className="h-8 text-xs">Class</TableHead>
              <TableHead className="h-8 text-xs text-right">Quantity</TableHead>
              <TableHead className="h-8 text-xs text-right">Market Value</TableHead>
              <TableHead className="h-8 text-xs text-right">Weight</TableHead>
              <TableHead className="h-8 text-xs">Allocation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p) => (
              <TableRow key={p.symbol}>
                <TableCell className="py-2 text-xs">
                  <div className="flex flex-col">
                    <span className="font-semibold">{p.symbol}</span>
                    <span className="text-[10px] text-muted-foreground">{p.name}</span>
                  </div>
                </TableCell>
                <TableCell className="py-2 text-xs">
                  <Badge variant="outline" className={`text-[10px] h-5 ${CLASS_COLOR[p.assetClass] ?? ""}`}>
                    {p.assetClass}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-xs text-right tabular-nums">{fmtQty(p.quantity)}</TableCell>
                <TableCell className="py-2 text-xs text-right tabular-nums">{fmtUSD(p.marketValue)}</TableCell>
                <TableCell className="py-2 text-xs text-right tabular-nums font-medium">{fmtPct(p.weight, 1)}</TableCell>
                <TableCell className="py-2 text-xs">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, p.weight * 100)}%` }}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
