"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Search, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { Empty } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";
import { MemoryCard } from "@/components/console/MemoryCard";

export default function CustomersPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(() => api("/api/staff/customers", { query: { q } }).then((r) => setItems(r.items)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div>
      <PageHeader title="Customers" subtitle="Look up anyone and see what Vastra Care remembers about them." />
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-3 flex h-10 items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line">
            <Search size={16} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or phone" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
            {items.length === 0 ? (
              <Empty icon={<UsersRound size={40} />} title="No customers found" />
            ) : (
              items.map((c) => (
                <button key={c.id} onClick={() => setSel(c)} className={clsx("flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0", sel?.id === c.id ? "bg-brand-50" : "hover:bg-canvas")}>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 font-bold text-brand-800">{c.name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{c.name}</p>
                    <p className="truncate text-xs text-muted">{c.email} · {c.phone}</p>
                  </div>
                  <div className="text-right text-xs text-muted">
                    <p>{c.orders} orders · {c.tickets} tickets</p>
                    <p>since {date(c.created_at, { month: "short", year: "numeric" })}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        <div>{sel ? <MemoryCard key={sel.id} customerId={sel.id} /> : <p className="text-sm text-muted">Select a customer to see their memory.</p>}</div>
      </div>
    </div>
  );
}
