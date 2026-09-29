"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, PageLoader } from "@/components/ui";
import { SupportChat, type Ticket } from "@/components/store/SupportChat";

const POLICY_TITLES: Record<string, string> = {
  returns: "Returns & exchanges",
  refunds: "Refunds",
  cancellation: "Cancelling an order",
  shipping: "Shipping & delivery times",
  delivery_failed: "Failed delivery attempts",
  coupons: "Coupons",
  payments: "Payments",
  loyalty: "Vastra points",
  damaged_wrong_item: "Damaged or wrong item",
};

export default function HelpPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Help />
    </Suspense>
  );
}

function Help() {
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [policies, setPolicies] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [newChat, setNewChat] = useState(false);
  const ticketId = params.get("ticket") ? Number(params.get("ticket")) : null;
  const orderCode = params.get("order");

  const loadTickets = useCallback(() => {
    if (user?.role === "customer") api("/api/support/tickets").then((r) => setTickets(r.items)).catch(() => {});
  }, [user]);
  useEffect(() => {
    loadTickets();
    api("/api/policies").then(setPolicies).catch(() => {});
  }, [loadTickets]);
  useRealtime((e) => e === "ticket.message" && loadTickets(), [loadTickets]);

  useEffect(() => {
    if (!ticketId && !orderCode && !newChat && tickets.length) {
      const active = tickets.find((t) => !["resolved", "closed"].includes(t.status));
      if (active) router.replace(`/help?ticket=${active.id}`);
    }
  }, [tickets, ticketId, orderCode, newChat, router]);

  const onTicket = (t: Ticket) => {
    if (t.id !== ticketId) router.replace(`/help?ticket=${t.id}`);
    loadTickets();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold">How can we help?</h1>
        <p className="mt-1 text-muted">Vastra Care knows your orders and remembers your past conversations — just describe the problem.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setNewChat(true);
              router.push("/help");
            }}
          >
            <MessageSquarePlus size={16} /> New conversation
          </Button>
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/help?ticket=${t.id}`)}
              className={clsx("w-full rounded-lg border p-3 text-left text-sm transition", t.id === ticketId ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-200")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted">{t.code}</span>
                <span className="text-[11px] text-muted">{ago(t.updated_at)}</span>
              </div>
              <p className="mt-1 line-clamp-2 font-semibold">{t.subject}</p>
              <Badge className="mt-2" tone={["resolved", "closed"].includes(t.status) ? "green" : ["needs_human", "human_active"].includes(t.status) ? "amber" : "brand"}>
                {t.status_text}
              </Badge>
            </button>
          ))}
        </aside>
        <div className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-line">
          {orderCode && !ticketId && (
            <div className="border-b border-line bg-saffron-50 px-4 py-2 text-xs font-semibold text-saffron-600">Starting a conversation about order {orderCode}</div>
          )}
          <SupportChat key={ticketId ?? `new-${orderCode ?? ""}`} ticketId={ticketId} orderCode={orderCode} onTicket={onTicket} className="flex-1" />
        </div>
      </div>

      {Object.keys(policies).length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-extrabold uppercase tracking-wider">Store policies</h2>
          <div className="divide-y divide-line rounded-xl border border-line">
            {Object.entries(policies).map(([k, v]) => (
              <div key={k} id={k.split("_")[0]}>
                <button onClick={() => setOpen(open === k ? null : k)} className="flex w-full items-center justify-between px-5 py-4 text-left font-bold">
                  {POLICY_TITLES[k] || k}
                  <ChevronDown size={18} className={clsx("transition", open === k && "rotate-180")} />
                </button>
                {open === k && <p className="px-5 pb-4 text-sm leading-relaxed text-muted">{v}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
