"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { api } from "@/lib/api";
import { img, rupee } from "@/lib/format";
import { Badge, Button, Input, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function CatalogProducts() {
  const [q, setQ] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(() => api("/api/catalog-admin/products", { query: { q, low_stock: lowStock, page } }).then(setData), [q, lowStock, page]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div>
      <PageHeader title="Products & stock" subtitle={data ? `${data.total.toLocaleString("en-IN")} products` : ""} />
      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line">
            <Search size={16} className="text-muted" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name, brand, category" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={lowStock} onChange={(e) => { setLowStock(e.target.checked); setPage(1); }} className="accent-brand-700" /> Low stock (≤ 3 in any size)
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-line">
          {!data ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Product</th>
                  <th className="px-4 py-2">Price</th>
                  <th className="px-4 py-2">Stock by size</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((p: any) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <img src={img(p.image, 80)} alt="" className="h-12 w-9 rounded object-cover" />
                        <div className="min-w-0">
                          <p className="font-bold">{p.brand}</p>
                          <p className="max-w-64 truncate text-xs text-muted">{p.name} · {p.category_name} · {p.gender}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <b>{rupee(p.price)}</b> <s className="text-xs text-muted">{rupee(p.mrp)}</s>
                      <p className="text-xs text-deal">{p.discount_pct}% off</p>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {p.variants.map((v: any) => (
                          <span key={v.size} className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${v.stock === 0 ? "bg-red-100 text-red-700" : v.stock <= 3 ? "bg-amber-100 text-amber-800" : "bg-canvas"}`}>
                            {v.size}: {v.stock}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">{p.is_active ? <Badge tone="green">Live</Badge> : <Badge>Hidden</Badge>}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link href={`/product/${p.id}`} target="_blank" className="p-1 text-muted hover:text-ink" aria-label="View on store"><ExternalLink size={15} /></Link>
                        <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {data && data.total > 50 && (
          <div className="mt-4 flex items-center justify-center gap-3 text-sm">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            Page {page} of {Math.ceil(data.total / 50)}
            <Button size="sm" variant="outline" disabled={page * 50 >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}
      </div>
      {editing && <EditProduct p={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

function EditProduct({ p, onClose, onSaved }: { p: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [price, setPrice] = useState(String(p.price));
  const [mrp, setMrp] = useState(String(p.mrp));
  const [active, setActive] = useState(p.is_active);
  const [stock, setStock] = useState<Record<string, string>>(Object.fromEntries(p.variants.map((v: any) => [v.size, String(v.stock)])));
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={`${p.brand} · ${p.name}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="MRP (₹)" type="number" value={mrp} onChange={(e) => setMrp(e.target.value)} />
          <Input label="Selling price (₹)" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">Stock by size</p>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(stock).map(([s, v]) => (
              <Input key={s} label={s} type="number" min={0} value={v} onChange={(e) => setStock((x) => ({ ...x, [s]: e.target.value }))} />
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-brand-700" /> Visible on the store
        </label>
        <Button
          className="w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api(`/api/catalog-admin/products/${p.id}`, {
                method: "PATCH",
                body: { mrp: Number(mrp), price: Number(price), is_active: active, stock: Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, Number(v)])) },
              });
              toast.success("Product updated — live on the store");
              onSaved();
              onClose();
            } catch (e: any) {
              toast.error(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
