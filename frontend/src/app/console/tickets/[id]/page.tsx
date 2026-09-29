"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import clsx from "clsx";
import {
  ArrowLeft, Bot, Brain, CheckCircle2, ChevronDown, Headset, Lock, RotateCcw, Send, ShieldAlert, Sparkles, UserRound, Wand2, Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date, dateTime, rupee } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, Modal, PageLoader, RichText, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ChannelIcon, Frustration, MemoryMatch, SevChip, TicketStatus } from "@/components/console/bits";
import { MemoryCard } from "@/components/console/MemoryCard";
import { OrderStatus } from "@/components/store/OrderStatus";

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [t, setT] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(() => api(`/api/staff/tickets/${id}`).then(setT), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime((e, d) => (e.startsWith("ticket.") && Number(d.id) === Number(id)) && load(), [id, load]);

  if (!t) return <PageLoader />;
  const draft = [...t.messages].reverse().find((m: any) => m.is_draft);
  const visible = t.messages.filter((m: any) => !m.is_draft);
  const mine = t.assigned_to === user?.id;

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api(`/api/staff/tickets/${id}/reply`, { method: "POST", body: { body: reply, internal, from_draft: internal ? undefined : fromDraft } });
      setReply("");
      setFromDraft(null);
      setInternal(false);
      await load();
      toast.success(internal ? "Note added" : `Sent to ${t.customer.name.split(" ")[0]} via ${t.channel === "whatsapp" ? "WhatsApp" : "email & chat"}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };
  const action = async (path: string, body?: any, msg?: string) => {
    try {
      await api(`/api/staff/tickets/${id}/${path}`, { method: "POST", body });
      await load();
      if (msg) toast.success(msg);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const regenerate = async () => {
    setDrafting(true);
    try {
      await api(`/api/staff/tickets/${id}/draft`, { method: "POST" });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-5 py-3">
        <Link href="/console" className="rounded p-1 hover:bg-brand-50" aria-label="Back">
          <ArrowLeft size={18} />
        </Link>
        <ChannelIcon channel={t.channel} size={16} />
        <span className="font-mono text-sm text-muted">{t.code}</span>
        <h1 className="min-w-0 flex-1 truncate font-bold">{t.subject}</h1>
        <TicketStatus status={t.status} />
        <MemoryMatch match={t.matched_memory} />
        {t.is_new_issue && <Badge tone="red"><Sparkles size={10} /> New issue</Badge>}
        <div className="flex gap-2">
          {!mine && !["resolved", "closed"].includes(t.status) && (
            <Button size="sm" variant="secondary" onClick={() => action("claim", undefined, "Ticket assigned to you")}>
              <Headset size={14} /> Take over
            </Button>
          )}
          {["needs_human", "human_active", "waiting_customer"].includes(t.status) && (
            <Button size="sm" variant="outline" onClick={() => action("handback", undefined, "Handed back to AI")}>
              <Bot size={14} /> Hand back to AI
            </Button>
          )}
          {!["resolved", "closed"].includes(t.status) && (
            <Button size="sm" onClick={() => setResolveOpen(true)}>
              <CheckCircle2 size={14} /> Resolve
            </Button>
          )}
        </div>
      </div>

      {t.handoff_reason && !["resolved", "closed"].includes(t.status) && (
        <div className={clsx("flex items-center gap-2 px-5 py-2 text-sm", t.is_new_issue ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900")}>
          <ShieldAlert size={16} /> <b>Why you&apos;re seeing this:</b> {t.handoff_reason}
        </div>
      )}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_360px]">
        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {visible.map((m: any) => (
              <StaffBubble key={m.id} m={m} customer={t.customer.name} />
            ))}
          </div>

          {draft && !["resolved", "closed"].includes(t.status) && (
            <div className="border-t border-brand-200 bg-brand-50/60 px-5 py-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-brand-700">
                  <Wand2 size={14} /> AI suggested reply (uses {draft.meta?.memories?.length ?? 0} memories, {draft.meta?.lessons?.length ?? 0} lessons)
                </p>
                <div className="flex gap-2">
                  <button onClick={regenerate} className="text-xs font-bold text-brand-700" disabled={drafting}>
                    {drafting ? "Thinking…" : "Regenerate"}
                  </button>
                  <button
                    onClick={() => {
                      setReply(draft.body);
                      setFromDraft(draft.body);
                      setInternal(false);
                    }}
                    className="rounded bg-brand-700 px-2 py-0.5 text-xs font-bold text-white"
                  >
                    Use draft
                  </button>
                </div>
              </div>
              <RichText text={draft.body} className="max-h-32 overflow-y-auto text-sm text-ink/90" />
            </div>
          )}

          <div className="border-t border-line bg-white p-4">
            <div className="mb-2 flex gap-2 text-xs font-bold">
              <button onClick={() => setInternal(false)} className={clsx("rounded-full px-3 py-1", !internal ? "bg-brand-700 text-white" : "bg-canvas text-muted")}>
                Reply to customer
              </button>
              <button onClick={() => setInternal(true)} className={clsx("flex items-center gap-1 rounded-full px-3 py-1", internal ? "bg-amber-500 text-white" : "bg-canvas text-muted")}>
                <Lock size={11} /> Internal note
              </button>
              {!draft && !["resolved", "closed"].includes(t.status) && (
                <button onClick={regenerate} className="ml-auto flex items-center gap-1 text-brand-700" disabled={drafting}>
                  <Wand2 size={12} /> {drafting ? "Drafting…" : "Draft with AI"}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Textarea
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={internal ? "Visible to staff only" : `Reply to ${t.customer.name.split(" ")[0]} — delivered on ${t.channel === "whatsapp" ? "WhatsApp" : "chat & email"}`}
                className={clsx("flex-1", internal && "bg-amber-50")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                }}
              />
              <Button onClick={send} loading={sending} className="self-end" aria-label="Send">
                <Send size={15} />
              </Button>
            </div>
            {fromDraft && reply !== fromDraft && <p className="mt-1 text-[11px] text-brand-700">You edited the AI draft — the difference will be saved as a lesson for the AI.</p>}
          </div>
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto border-l border-line bg-white p-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-800">{t.customer.name[0]}</span>
              <div className="min-w-0">
                <p className="truncate font-bold">{t.customer.name}</p>
                <p className="truncate text-xs text-muted">{t.customer.email}</p>
                <p className="text-xs text-muted">{t.customer.phone}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <Mini l="Orders" v={t.customer.orders_count} />
              <Mini l="Tickets" v={t.customer.tickets_count} />
              <Mini l="Lifetime" v={rupee(t.customer.lifetime_value)} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>Customer since {date(t.customer.created_at, { month: "short", year: "numeric" })}</span>
              <span className="flex items-center gap-1">Mood <Frustration level={t.frustration} /></span>
            </div>
          </div>

          <MemoryCard customerId={t.customer.id} />

          {t.incident && (
            <Link href={`/console/incidents/${t.incident.id}`} className="block rounded-xl border border-line p-3 hover:border-brand-300">
              <p className="mb-1 flex items-center gap-2 text-xs font-bold text-muted">
                LINKED INCIDENT <SevChip severity={t.incident.severity} label={t.incident.severity_label} />
              </p>
              <p className="text-sm font-bold">{t.incident.code} · {t.incident.title}</p>
              <p className="text-xs text-muted">{t.incident.customer_count} customers · {t.incident.status}</p>
            </Link>
          )}

          {t.refunds.length > 0 && (
            <div className="rounded-xl border border-line p-3 text-sm">
              <p className="mb-1 text-xs font-bold text-muted">REFUNDS ON THIS TICKET</p>
              {t.refunds.map((r: any) => (
                <p key={r.id}>
                  {rupee(r.amount)} · {r.order} · <Badge tone={r.status === "processed" ? "green" : r.status === "pending_approval" ? "amber" : "neutral"}>{r.status.replace("_", " ")}</Badge>
                </p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-bold text-muted">RECENT ORDERS</p>
            <div className="space-y-2">
              {t.orders.length === 0 && <p className="text-sm text-muted">No orders yet.</p>}
              {t.orders.map((o: any) => (
                <div key={o.code} className={clsx("rounded-lg border p-2.5 text-xs", t.order_id === o.id ? "border-brand-400 bg-brand-50" : "border-line")}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">{o.code}</span>
                    <OrderStatus status={o.status} label={o.status_label} />
                  </div>
                  <p className="mt-1 truncate text-muted">{o.items.map((i: any) => `${i.brand} ${i.name} (${i.size})`).join(", ")}</p>
                  <p className="mt-0.5 text-muted">
                    {rupee(o.total)} · {o.payment_method} · {date(o.created_at)}
                  </p>
                </div>
              ))}
            </div>
          </div>
          {t.resolution_note && (
            <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="text-xs font-bold">RESOLUTION</p>
              {t.resolution_note}
              {t.csat && <p className="mt-1 text-xs">Customer rating: {"★".repeat(t.csat)}</p>}
            </div>
          )}
        </aside>
      </div>

      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title="Resolve ticket">
        <p className="mb-3 text-sm text-muted">Describe what fixed it. Vastra Care turns this into a lesson so the next customer with the same problem gets helped instantly.</p>
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer's UPI payment was captured twice; refunded the duplicate via Razorpay." />
        <Button
          className="mt-4 w-full"
          disabled={note.trim().length < 3}
          onClick={async () => {
            await action("resolve", { note }, "Resolved — lesson being written to the playbook");
            setResolveOpen(false);
            setNote("");
          }}
        >
          Resolve & teach the AI
        </Button>
      </Modal>
    </div>
  );
}

function Mini({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-canvas py-2">
      <p className="font-extrabold">{v}</p>
      <p className="text-muted">{l}</p>
    </div>
  );
}

function StaffBubble({ m, customer }: { m: any; customer: string }) {
  const [open, setOpen] = useState(false);
  if (m.sender === "system") return <p className="text-center text-xs text-muted">{m.body} · {dateTime(m.at)}</p>;
  const cust = m.sender === "customer";
  const meta = m.meta || {};
  const mems = meta.memories?.length ?? 0;
  const lessons = meta.lessons?.length ?? 0;
  const tools = meta.tools ?? [];
  return (
    <div className={clsx("flex gap-2", !cust && "flex-row-reverse")}>
      <span className={clsx("grid h-8 w-8 shrink-0 place-items-center rounded-full", cust ? "bg-gray-200" : m.sender === "ai" ? "bg-brand-700 text-white" : "bg-saffron-500 text-white")}>
        {cust ? <UserRound size={15} /> : m.sender === "ai" ? <Bot size={15} /> : <Headset size={15} />}
      </span>
      <div className={clsx("max-w-[80%]", !cust && "text-right")}>
        <p className="mb-0.5 text-[11px] text-muted">
          {cust ? customer : m.sender === "ai" ? "Vastra Care AI" : m.author} · {dateTime(m.at)} {m.channel !== "web" && `· ${m.channel}`}
          {m.is_internal && " · internal note"}
        </p>
        <div className={clsx("inline-block rounded-2xl px-3.5 py-2.5 text-left text-sm", cust ? "rounded-tl-sm bg-white ring-1 ring-line" : m.is_internal ? "bg-amber-50 ring-1 ring-amber-200" : m.sender === "ai" ? "rounded-tr-sm bg-brand-50" : "rounded-tr-sm bg-saffron-50 ring-1 ring-saffron-100")}>
          <RichText text={m.body} />
        </div>
        {m.sender === "ai" && (mems > 0 || lessons > 0 || tools.length > 0 || meta.triage) && (
          <div className="mt-1">
            <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-700">
              <Brain size={12} /> {mems} memories · {lessons} lessons · {tools.length} actions <ChevronDown size={12} className={open ? "rotate-180" : ""} />
            </button>
            {open && (
              <div className="mt-2 space-y-2 rounded-xl bg-white p-3 text-left text-xs ring-1 ring-line">
                {meta.triage && (
                  <p>
                    <b>Triage:</b> {meta.triage.is_problem ? "problem" : "request"} · match: <b>{meta.triage.known_match}</b> · category {meta.triage.category} · frustration {meta.triage.frustration}/5
                    {meta.triage.reasoning && <span className="block text-muted">{meta.triage.reasoning}</span>}
                  </p>
                )}
                {mems > 0 && (
                  <div>
                    <p className="font-bold">Customer memories recalled</p>
                    <ul className="list-disc pl-4 text-muted">{meta.memories.map((x: any) => <li key={x.id}>{x.text}</li>)}</ul>
                  </div>
                )}
                {lessons > 0 && (
                  <div>
                    <p className="font-bold">Playbook lessons recalled</p>
                    <ul className="list-disc pl-4 text-muted">{meta.lessons.map((x: any) => <li key={x.id}>{x.text}</li>)}</ul>
                  </div>
                )}
                {tools.length > 0 && (
                  <div>
                    <p className="font-bold">Actions on live data</p>
                    {tools.map((c: any, i: number) => (
                      <p key={i} className="flex items-start gap-1 text-muted">
                        <Wrench size={11} className="mt-0.5" /> <span className="font-mono">{c.tool}</span>({Object.values(c.args || {}).join(", ")}) →{" "}
                        {c.result?.error ? <span className="text-red-600">{c.result.error}</span> : c.result?.simulated ? "simulated" : "ok"}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {meta.incident_update && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-emerald-700">
            <RotateCcw size={11} /> incident update {meta.incident_update}
          </p>
        )}
      </div>
    </div>
  );
}
