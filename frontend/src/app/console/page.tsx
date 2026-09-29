"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Inbox, Search, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Empty, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";
import { ChannelIcon, Frustration, MemoryMatch, Stat, TicketStatus } from "@/components/console/bits";

const VIEWS = [
  { key: "needs_human", label: "Needs a human", query: { status: "needs_human" } },
  { key: "mine", label: "Assigned to me", query: { status: "open", mine: true } },
  { key: "new_issue", label: "New issues", query: { status: "open", new_issue: true } },
  { key: "ai", label: "AI handling", query: { status: "ai_active" } },
  { key: "waiting", label: "Waiting on customer", query: { status: "waiting_customer,human_active" } },
  { key: "resolved", label: "Resolved", query: { status: "resolved,closed" } },
  { key: "all", label: "All tickets", query: {} },
];

export default function InboxPage() {
  const { user } = useAuth();
  const [view, setView] = useState("needs_human");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[] | null>(null);
  const [overview, setOverview] = useState<any>(null);

  const load = useCallback(async () => {
    const v = VIEWS.find((x) => x.key === view)!;
    const [t, o] = await Promise.all([api("/api/staff/tickets", { query: { ...v.query, q } }), api("/api/staff/overview")]);
    setItems(t.items);
    setOverview(o);
  }, [view, q]);

  useEffect(() => {
    setItems(null);
    const t = setTimeout(() => load().catch(() => setItems([])), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useRealtime((e) => e.startsWith("ticket.") && load().catch(() => {}), [load]);

  const counts = overview?.tickets || {};
  return (
    <div>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${user?.name.split(" ")[0]}`}
        subtitle="Every ticket arrives with the customer's memory. New issues land here first."
      />
      <div className="grid grid-cols-2 gap-3 px-6 pt-5 lg:grid-cols-5">
        <Stat label="Need a human" value={counts.needs_human ?? 0} tone={(counts.needs_human ?? 0) > 0 ? "text-red-600" : ""} />
        <Stat label="AI handling now" value={counts.ai_active ?? 0} />
        <Stat label="Tickets today" value={overview?.today.tickets ?? "—"} />
        <Stat label="Resolved today" value={overview ? overview.today.resolved_ai + overview.today.resolved_human : "—"} sub={overview && `${overview.today.resolved_ai} by AI · ${overview.today.resolved_human} by agents`} />
        <Stat label="Lessons learned today" value={overview?.today.lessons ?? "—"} sub="written to the playbook" tone="text-brand-700" />
      </div>
      <div className="flex flex-col gap-4 p-6 lg:flex-row">
        <div className="flex gap-2 overflow-x-auto lg:w-52 lg:flex-col">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={clsx("flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold", view === v.key ? "bg-brand-700 text-white" : "bg-white text-ink ring-1 ring-line hover:ring-brand-300")}
            >
              {v.label}
              {v.key === "needs_human" && counts.needs_human > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">{counts.needs_human}</span>}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex h-10 items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line focus-within:ring-brand-400">
            <Search size={16} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket code, subject, customer name or email" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
            {items === null ? (
              <div className="flex justify-center p-10"><Spinner /></div>
            ) : items.length === 0 ? (
              <Empty icon={<Inbox size={40} />} title="Nothing here" text="New conversations appear instantly — no refresh needed." />
            ) : (
              items.map((t) => (
                <Link key={t.id} href={`/console/tickets/${t.id}`} className="flex gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-brand-50/50">
                  <div className="pt-1">
                    <ChannelIcon channel={t.channel} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted">{t.code}</span>
                      <span className="text-sm font-bold">{t.customer.name}</span>
                      <TicketStatus status={t.status} />
                      {t.is_new_issue && <Badge tone="red"><Sparkles size={10} /> New issue</Badge>}
                      {t.priority === "high" && <Badge tone="red">High priority</Badge>}
                      <MemoryMatch match={t.matched_memory} />
                    </div>
                    <p className="mt-1 truncate text-sm">{t.subject}</p>
                    {t.last_message && (
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {t.last_message.sender === "ai" ? "AI: " : t.last_message.sender === "agent" ? "Agent: " : ""}
                        {t.last_message.body}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-muted">
                    <span>{ago(t.updated_at)}</span>
                    <Frustration level={t.frustration} />
                    {t.assignee && <span className="max-w-24 truncate">→ {t.assignee}</span>}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
