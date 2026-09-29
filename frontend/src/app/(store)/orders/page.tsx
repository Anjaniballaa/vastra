"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Package } from "lucide-react";
import { api } from "@/lib/api";
import { date, img, rupee } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Button, Empty, PageLoader } from "@/components/ui";
import { RequireCustomer } from "@/components/store/RequireCustomer";
import { OrderStatus } from "@/components/store/OrderStatus";

export default function OrdersPage() {
  return (
    <RequireCustomer>
      <Orders />
    </RequireCustomer>
  );
}

function Orders() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api("/api/orders").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);
  useRealtime((e) => e === "order.updated" && load());

  if (!items) return <PageLoader />;
  if (!items.length)
    return <Empty icon={<Package size={56} />} title="No orders yet" text="When you place an order it will show up here." action={<Link href="/shop"><Button>Start shopping</Button></Link>} />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-lg font-extrabold">My orders</h1>
      <div className="space-y-4">
        {items.map((o) => (
          <Link key={o.code} href={`/orders/${o.code}`} className="block rounded-xl border border-line p-4 transition hover:border-brand-300 hover:shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <OrderStatus status={o.status} label={o.status_label} />
                <span className="text-sm text-muted">
                  {o.code} · {date(o.created_at)}
                </span>
              </div>
              <span className="flex items-center text-sm font-bold">
                {rupee(o.total)} <ChevronRight size={16} />
              </span>
            </div>
            <div className="mt-3 flex gap-3 overflow-x-auto">
              {o.items.map((i: any) => (
                <div key={i.id} className="flex shrink-0 items-center gap-3">
                  <img src={img(i.image, 120)} alt="" className="h-20 w-15 rounded object-cover" />
                  <div className="text-sm">
                    <p className="font-bold">{i.brand}</p>
                    <p className="max-w-48 truncate text-muted">{i.name}</p>
                    <p className="text-xs text-muted">Size {i.size}</p>
                  </div>
                </div>
              ))}
            </div>
            {o.status !== "delivered" && o.status !== "cancelled" && o.expected_delivery && (
              <p className="mt-3 text-xs text-muted">Expected by {date(o.expected_delivery, { weekday: "short", day: "numeric", month: "short" })}</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
