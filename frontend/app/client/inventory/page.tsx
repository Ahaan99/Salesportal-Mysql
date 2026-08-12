"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, Download, Loader2, PackageOpen, Boxes, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/portal/stat-card";
import { RestockModal } from "@/components/client/restock-modal";
import {
  LOW_STOCK_THRESHOLD,
  useVendorStore,
  type InventoryProduct,
} from "@/lib/store/vendor-store";
import { formatINR } from "@/lib/utils";

const adjBadge = {
  restock: "success",
  correction: "accent",
  damage: "destructive",
  sale: "outline",
} as const;

function stockLevel(p: InventoryProduct): { label: string; variant: "success" | "warning" | "destructive" } {
  if (p.stock === 0) return { label: "Out of stock", variant: "destructive" };
  if (p.stock < LOW_STOCK_THRESHOLD) return { label: "Low stock", variant: "warning" };
  return { label: "Healthy", variant: "success" };
}

function exportCsv(products: InventoryProduct[]) {
  const header = "Product ID,Name,Category,Status,Stock,Selling Price,Stock Value";
  const rows = products.map((p) =>
    [p.id, `"${p.name.replace(/"/g, '""')}"`, p.category, p.status, p.stock, p.price, p.stock * p.price].join(",")
  );
  const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InventoryPage() {
  const { products, adjustments, inventoryLoading, inventoryError } = useVendorStore();
  const [restocking, setRestocking] = useState<InventoryProduct | null>(null);

  const totals = useMemo(() => {
    const units = products.reduce((s, p) => s + p.stock, 0);
    const value = products.reduce((s, p) => s + p.stock * p.price, 0);
    const low = products.filter((p) => p.stock > 0 && p.stock < LOW_STOCK_THRESHOLD).length;
    const out = products.filter((p) => p.stock === 0).length;
    return { units, value, low, out };
  }, [products]);

  const alerts = products.filter((p) => p.stock < LOW_STOCK_THRESHOLD);

  if (inventoryLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        <span className="sr-only">Loading inventory</span>
      </div>
    );
  }

  if (inventoryError) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-5 py-4 text-sm text-destructive"
      >
        <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
        {inventoryError}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label="Units in stock" value={totals.units.toLocaleString("en-IN")} icon={Boxes} />
        <StatCard index={1} label="Stock value" value={formatINR(totals.value)} hint="At selling price" icon={PackageOpen} />
        <StatCard index={2} label="Low stock SKUs" value={String(totals.low)} hint={`Below ${LOW_STOCK_THRESHOLD} units`} icon={AlertTriangle} />
        <StatCard index={3} label="Out of stock" value={String(totals.out)} hint="Needs immediate restock" icon={PackageX} />
      </div>

      {alerts.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-5 py-4"
        >
          <AlertTriangle className="h-5 w-5 text-[#8a5a10]" aria-hidden />
          <p className="text-sm text-[#8a5a10]">
            <span className="font-medium">{alerts.length} product{alerts.length > 1 ? "s" : ""}</span>{" "}
            {alerts.length > 1 ? "are" : "is"} below the {LOW_STOCK_THRESHOLD}-unit threshold:{" "}
            {alerts.map((p) => p.name).join(", ")}
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif text-xl">Stock by product</CardTitle>
            <CardDescription>Adjust stock with a full audit trail</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportCsv(products)}>
            <Download aria-hidden />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Product</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">Stock</th>
                <th className="pb-3 pr-4 font-medium">Level</th>
                <th className="pb-3 pr-4 font-medium">Stock value</th>
                <th className="pb-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const level = stockLevel(p);
                return (
                  <tr key={p.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3.5 pr-4">
                      <div className="flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.image || "/placeholder.svg"}
                          alt=""
                          className="h-9 w-9 rounded-lg border border-border object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 capitalize text-muted-foreground">{p.status}</td>
                    <td className="py-3.5 pr-4 font-medium">{p.stock.toLocaleString("en-IN")}</td>
                    <td className="py-3.5 pr-4">
                      <Badge variant={level.variant}>{level.label}</Badge>
                    </td>
                    <td className="py-3.5 pr-4">{formatINR(p.stock * p.price)}</td>
                    <td className="py-3.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setRestocking(p)}>
                        Adjust
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Adjustment history</CardTitle>
          <CardDescription>Every stock movement is journaled for audit</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-3 pr-4 font-medium">Ref</th>
                <th className="pb-3 pr-4 font-medium">Product</th>
                <th className="pb-3 pr-4 font-medium">Type</th>
                <th className="pb-3 pr-4 font-medium">Change</th>
                <th className="pb-3 pr-4 font-medium">Resulting</th>
                <th className="pb-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id} className="border-b border-border/60 last:border-0">
                  <td className="py-3.5 pr-4 font-medium">{a.id}</td>
                  <td className="max-w-[200px] truncate py-3.5 pr-4 text-muted-foreground">
                    {a.productName}
                  </td>
                  <td className="py-3.5 pr-4">
                    <Badge variant={adjBadge[a.type]}>{a.type}</Badge>
                  </td>
                  <td className="py-3.5 pr-4 font-medium">
                    <span className={a.delta > 0 ? "text-primary" : "text-destructive"}>
                      {a.delta > 0 ? "+" : ""}
                      {a.delta.toLocaleString("en-IN")}
                    </span>
                  </td>
                  <td className="py-3.5 pr-4">{a.resultingStock.toLocaleString("en-IN")}</td>
                  <td className="max-w-[240px] truncate py-3.5 text-muted-foreground">{a.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <RestockModal product={restocking} onClose={() => setRestocking(null)} />
    </div>
  );
}
