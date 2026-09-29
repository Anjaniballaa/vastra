"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ClipboardList, Search } from "lucide-react";
import { api } from "@/lib/api";
import { ago, img, rupee } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Button, Empty, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";
import { OrderStatus } from "@/components/store/OrderStatus";

const LANES = [
  ["placed", "To pack"],
  ["packed", "To ship"],
  ["shipped", "In transit"],
  ["out_for_delivery", "Out for delivery"],
  ["delivery_failed", "Failed delivery"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
];
const NEXT_LABEL: Record<string, string> = {
  packed: "Mark packed",
  shipped: "Ship",
  out_for_delivery: "Out for delivery",
  delivered: "Mark delivered",
  delivery_failed: "Delivery failed",
  cancelled: "Cancel (RTO)",
};

export default function OpsOrders() {
  const toast = useToast();
  const [lane, setLane] = useState("placed");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any>({});
  const [meta, setMeta] = useState<any>(null);
  const [acting, setActing] = useState<{ order: any; status: string } | null>(null);

  const load = useCallback(async () => {
    const [o, s] = await Promise.all([api("/api/ops/orders", { query: { status: q ? undefined : lane, q } }), api("/api/ops/summary")]);
    setItems(o.items);
    setSummary(s.orders);
  }, [lane, q]);
  useEffect(() => {
    api("/api/ops/meta").then(setMeta);
  }, []);
  useEffect(() => {
    setItems(null);
    const t = setTimeout(() => load(), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useRealtime((e) => e.startsWith("order.") && load(), [load]);

  const quick = async (order: any, status: string) => {
    if (["shipped", "delivery_failed", "cancelled"].includes(status)) return setActing({ order, status });
    try {
      await api(`/api/ops/orders/${order.code}/status`, { method: "POST", body: { status } });
      toast.success(`${order.code} → ${status.replace(/_/g, " ")}. Customer notified.`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Fulfilment" subtitle="Every status change notifies the customer (email + WhatsApp) and is written into their memory." />
      <div className="flex gap-2 overflow-x-auto px-6 pt-5">
        {LANES.map(([s, l]) => (
          <button key={s} onClick={() => { setLane(s); setQ(""); }} className={clsx("flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold", lane === s && !q ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
            {l}
            <span className={clsx("rounded-full px-1.5 text-[11px]", lane === s && !q ? "bg-white/20" : "bg-canvas")}>{summary[s] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="p-6">
        <div className="mb-3 flex h-10 max-w-md items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line">
          <Search size={16} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value.toUpperCase())} placeholder="Find order code, e.g. VST100012" className="flex-1 bg-transparent text-sm outline-none" />
        </div>
        {items === null ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : items.length === 0 ? (
          <Empty icon={<ClipboardList size={40} />} title="No orders in this lane" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((o) => (
              <div key={o.code} className="rounded-xl bg-white p-4 ring-1 ring-line">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">{o.code}</span>
                    <OrderStatus status={o.status} label={o.status_label} />
                  </div>
                  <span className="text-xs text-muted">{ago(o.created_at)} · {o.payment_method.toUpperCase()} · {rupee(o.total)}</span>
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {o.items.map((i: any) => (
                    <div key={i.id} className="flex shrink-0 items-center gap-2 text-xs">
                      <img src={img(i.image, 100)} alt="" className="h-14 w-10 rounded object-cover" />
                      <div>
                        <p className="font-bold">{i.brand}</p>
                        <p className="text-muted">Size {i.size} × {i.qty}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  <b className="text-ink">{o.customer.name}</b> · {o.address.line1}, {o.address.city} {o.address.pincode}
                  {o.address.landmark && <> · <b className="text-ink">Landmark:</b> {o.address.landmark}</>}
                  {o.address.alternate_phone && <> · Alt {o.address.alternate_phone}</>}
                  {o.address.instructions && <> · “{o.address.instructions}”</>}
                </p>
                {o.courier && <p className="mt-1 text-xs text-muted">{o.courier} · AWB {o.awb} {o.delivery_attempts > 0 && `· ${o.delivery_attempts} failed attempt(s)`}</p>}
                {meta?.transitions[o.status] && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {meta.transitions[o.status].map((s: string) => (
                      <Button key={s} size="sm" variant={s === "cancelled" || s === "delivery_failed" ? "outline" : "primary"} onClick={() => quick(o, s)}>
                        {NEXT_LABEL[s] || s}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {acting && meta && <ActionModal acting={acting} meta={meta} onClose={() => setActing(null)} onDone={load} />}
    </div>
  );
}

function ActionModal({ acting, meta, onClose, onDone }: { acting: { order: any; status: string }; meta: any; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [courier, setCourier] = useState(meta.couriers[0]);
  const [awb, setAwb] = useState("");
  const [reason, setReason] = useState(meta.failure_reasons[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { order, status } = acting;
  const submit = async () => {
    setBusy(true);
    try {
      const body: any = { status };
      if (status === "shipped") Object.assign(body, { courier, awb });
      if (status === "delivery_failed") body.note = reason === "Other" ? note : reason + (note ? ` — ${note}` : "");
      if (status === "cancelled") body.note = note || "Returned to origin after failed deliveries";
      await api(`/api/ops/orders/${order.code}/status`, { method: "POST", body });
      toast.success(`${order.code} updated — customer notified`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`${NEXT_LABEL[status]} · ${order.code}`}>
      <div className="space-y-4">
        {status === "shipped" && (
          <>
            <Select label="Courier partner" value={courier} onChange={(e) => setCourier(e.target.value)}>
              {meta.couriers.map((c: string) => <option key={c}>{c}</option>)}
            </Select>
            <Input label="AWB / tracking number" value={awb} onChange={(e) => setAwb(e.target.value.toUpperCase())} required />
          </>
        )}
        {status === "delivery_failed" && (
          <>
            <Select label="What happened?" value={reason} onChange={(e) => setReason(e.target.value)}>
              {meta.failure_reasons.map((r: string) => <option key={r}>{r}</option>)}
            </Select>
            <Textarea label="Courier's note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        {status === "cancelled" && <Textarea label="Reason" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Returned to origin after 3 failed attempts" />}
        <Button className="w-full" loading={busy} onClick={submit} disabled={status === "shipped" && !awb}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
