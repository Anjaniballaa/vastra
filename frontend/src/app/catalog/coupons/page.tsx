"use client";

import { useEffect, useState } from "react";
import { Plus, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { date, rupee } from "@/lib/format";
import { Badge, Button, Empty, Input, Modal, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

const EMPTY = { code: "", description: "", kind: "percent", value: 10, min_order: 0, max_discount: "", max_item_discount_pct: "", first_order_only: false, usage_limit: "", valid_to: "", is_active: true };

export default function CouponsPage() {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>(null);
  const load = () => api("/api/catalog-admin/coupons").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    const body = {
      ...form,
      value: Number(form.value),
      min_order: Number(form.min_order || 0),
      max_discount: form.max_discount === "" || form.max_discount === null ? null : Number(form.max_discount),
      max_item_discount_pct: form.max_item_discount_pct === "" || form.max_item_discount_pct === null ? null : Number(form.max_item_discount_pct),
      usage_limit: form.usage_limit === "" || form.usage_limit === null ? null : Number(form.usage_limit),
      valid_to: form.valid_to ? new Date(form.valid_to).toISOString() : null,
    };
    try {
      await api(form.id ? `/api/catalog-admin/coupons/${form.id}` : "/api/catalog-admin/coupons", { method: form.id ? "PUT" : "POST", body });
      toast.success("Coupon saved — live at checkout");
      setForm(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader title="Coupons" subtitle="Coupon rules are enforced at checkout — and the support AI can explain exactly why a coupon didn't apply." actions={<Button onClick={() => setForm({ ...EMPTY })}><Plus size={15} /> New coupon</Button>} />
      <div className="p-6">
        {items === null ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : items.length === 0 ? (
          <Empty icon={<Tag size={40} />} title="No coupons yet" text="Create your first coupon to show it in the bag." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((c) => (
              <div key={c.id} className="rounded-xl bg-white p-4 ring-1 ring-line">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-brand-50 px-2 py-0.5 font-mono font-bold text-brand-800">{c.code}</span>
                  {c.is_active ? <Badge tone="green">Active</Badge> : <Badge>Off</Badge>}
                </div>
                <p className="mt-2 text-sm font-semibold">{c.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {c.kind === "percent" ? `${c.value}% off` : `${rupee(c.value)} off`}
                  {c.min_order ? ` · min ${rupee(c.min_order)}` : ""}
                  {c.max_discount ? ` · max ${rupee(c.max_discount)}` : ""}
                  {c.max_item_discount_pct != null ? ` · excludes items >${c.max_item_discount_pct}% off` : ""}
                  {c.first_order_only ? " · first order" : ""}
                  {c.valid_to ? ` · till ${date(c.valid_to)}` : ""}
                </p>
                <p className="mt-2 text-xs">Used {c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ""} times</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setForm({ ...c, max_discount: c.max_discount ?? "", max_item_discount_pct: c.max_item_discount_pct ?? "", usage_limit: c.usage_limit ?? "", valid_to: c.valid_to ? c.valid_to.slice(0, 10) : "" })}>
                  Edit
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit coupon" : "New coupon"}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Code" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} />
            <Select label="Type" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="percent">Percent off</option>
              <option value="flat">Flat ₹ off</option>
            </Select>
            <div className="sm:col-span-2"><Input label="Description shown to customers" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
            <Input label={form.kind === "percent" ? "Percent" : "Amount (₹)"} type="number" value={form.value} onChange={(e) => set("value", e.target.value)} />
            <Input label="Minimum order (₹)" type="number" value={form.min_order} onChange={(e) => set("min_order", e.target.value)} />
            <Input label="Max discount (₹, optional)" type="number" value={form.max_discount} onChange={(e) => set("max_discount", e.target.value)} />
            <Input label="Exclude items discounted above (%)" type="number" value={form.max_item_discount_pct} onChange={(e) => set("max_item_discount_pct", e.target.value)} />
            <Input label="Usage limit (optional)" type="number" value={form.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} />
            <Input label="Valid till (optional)" type="date" value={form.valid_to} onChange={(e) => set("valid_to", e.target.value)} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.first_order_only} onChange={(e) => set("first_order_only", e.target.checked)} className="accent-brand-700" /> First order only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="accent-brand-700" /> Active</label>
            <Button className="sm:col-span-2" onClick={save} disabled={!form.code || !form.description}>Save coupon</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
