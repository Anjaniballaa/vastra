"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, ArrowUpCircle, BellRing, CheckCircle2, MessageSquareText, PhoneCall, ShieldAlert, StickyNote } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago, dateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, Input, Modal, PageLoader, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { SevChip } from "@/components/console/bits";

const EVENT_ICON: Record<string, React.ReactNode> = {
  created: <ShieldAlert size={14} />,
  severity_up: <ArrowUpCircle size={14} className="text-red-600" />,
  alert: <BellRing size={14} className="text-orange-500" />,
  ack: <CheckCircle2 size={14} className="text-sky-600" />,
  escalated: <PhoneCall size={14} className="text-red-600" />,
  resolved: <CheckCircle2 size={14} className="text-emerald-600" />,
  customers_notified: <MessageSquareText size={14} className="text-emerald-600" />,
  note: <StickyNote size={14} />,
};

export default function IncidentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const [inc, setInc] = useState<any>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");
  const [custMsg, setCustMsg] = useState("");
  const [comment, setComment] = useState("");

  const load = useCallback(() => api(`/api/staff/incidents/${id}`).then(setInc), [id]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime((e, d) => e.startsWith("incident.") && Number(d.id) === Number(id) && load(), [id, load]);

  if (!inc) return <PageLoader />;
  const isLead = ["lead", "admin"].includes(user!.role);
  const canResolve = ["lead", "admin", "ops"].includes(user!.role);

  const post = async (path: string, body?: any, msg?: string, method = "POST") => {
    try {
      setInc(await api(`/api/staff/incidents/${id}${path}`, { method, body }));
      if (msg) toast.success(msg);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const sevs = ["new", "sev3", "sev2", "sev1"];
  return (
    <div className="p-6">
      <Link href="/console/incidents" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} /> All incidents
      </Link>
      <div className={clsx("rounded-2xl p-6 text-white", inc.status === "resolved" ? "bg-emerald-700" : inc.severity === "sev1" ? "bg-red-700" : inc.severity === "sev2" ? "bg-orange-600" : inc.severity === "sev3" ? "bg-amber-600" : "bg-brand-800")}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-extrabold uppercase">{inc.severity_label}</span>
          <span className="font-mono text-sm opacity-80">{inc.code}</span>
          <Badge tone="dark" className="!bg-black/25">{inc.status}</Badge>
          <span className="text-sm capitalize opacity-80">{inc.category}</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold md:text-3xl">{inc.title}</h1>
        <p className="mt-2 max-w-3xl text-sm opacity-90">{inc.summary}</p>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Big l="Customers affected" v={inc.customer_count} />
          <Big l="Reports" v={inc.report_count} />
          <Big l="First seen" v={ago(inc.first_seen)} />
          <Big l="On call" v={inc.oncall ?? "—"} />
        </div>
        {inc.status !== "resolved" && (
          <div className="mt-5 flex flex-wrap gap-2">
            {inc.status === "open" && (
              <Button variant="dark" onClick={() => post("/ack", undefined, "Acknowledged")}>
                <CheckCircle2 size={16} /> Acknowledge
              </Button>
            )}
            <Button variant="outline" className="!border-white/40 !bg-white/10 !text-white" onClick={() => post("/escalate", undefined, "Escalated to next on-call")}>
              <PhoneCall size={16} /> Escalate to next on-call
            </Button>
            {canResolve && (
              <Button variant="outline" className="!border-white !bg-white !text-ink" onClick={() => setResolveOpen(true)}>
                Resolve & notify customers
              </Button>
            )}
          </div>
        )}
        {inc.status === "resolved" && (
          <p className="mt-4 rounded-lg bg-black/20 p-3 text-sm">
            <b>Resolved by {inc.resolved_by}</b> {dateTime(inc.resolved_at)}: {inc.resolution_note}
          </p>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5 ring-1 ring-line">
            <h2 className="mb-3 font-extrabold">Severity ladder</h2>
            <div className="flex items-center gap-2">
              {sevs.map((s, i) => (
                <div key={s} className="flex flex-1 items-center gap-2">
                  <div className={clsx("flex-1 rounded-lg py-2 text-center text-xs font-extrabold uppercase", sevs.indexOf(inc.severity) >= i ? "bg-red-50 text-red-700 ring-2 ring-red-300" : "bg-canvas text-muted")}>
                    {s === "new" ? "New" : s.replace("sev", "Sev ")}
                  </div>
                </div>
              ))}
            </div>
            {isLead && inc.status !== "resolved" && (
              <div className="mt-4 flex items-end gap-2">
                <Select label="Set severity manually" value={inc.severity} onChange={(e) => post("", { severity: e.target.value }, "Severity updated", "PATCH")} className="max-w-48">
                  {sevs.map((s) => (
                    <option key={s} value={s}>{s === "new" ? "New issue" : s.toUpperCase()}</option>
                  ))}
                </Select>
              </div>
            )}
          </section>

          <section className="rounded-xl bg-white p-5 ring-1 ring-line">
            <h2 className="mb-3 font-extrabold">Customer reports ({inc.signals.length})</h2>
            <div className="space-y-3">
              {inc.signals.map((s: any) => (
                <div key={s.id} className="rounded-lg bg-canvas p-3 text-sm">
                  <p className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span className="font-bold text-ink">{s.customer}</span>
                    <span>
                      {dateTime(s.at)}
                      {s.ticket_id && <Link href={`/console/tickets/${s.ticket_id}`} className="ml-2 font-bold text-brand-700">open ticket</Link>}
                    </span>
                  </p>
                  “{s.text}”
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl bg-white p-5 ring-1 ring-line">
            <h2 className="mb-3 font-extrabold">Timeline</h2>
            <ol className="space-y-3">
              {[...inc.events].reverse().map((e: any, i: number) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="mt-0.5 text-muted">{EVENT_ICON[e.kind] || <StickyNote size={14} />}</span>
                  <div>
                    <p>{e.detail}</p>
                    <p className="text-xs text-muted">{dateTime(e.at)} {e.actor && `· ${e.actor}`}</p>
                  </div>
                </li>
              ))}
            </ol>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (comment.trim()) post("", { note: comment }, "Note added", "PATCH").then(() => setComment(""));
              }}
              className="mt-4 flex gap-2"
            >
              <Input placeholder={isLead ? "Add an update…" : "Only leads can post updates"} disabled={!isLead} value={comment} onChange={(e) => setComment(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={!isLead}>Post</Button>
            </form>
          </section>
          <section className="rounded-xl bg-white p-5 ring-1 ring-line">
            <h2 className="mb-3 font-extrabold">Linked tickets ({inc.tickets.length})</h2>
            {inc.tickets.map((t: any) => (
              <Link key={t.id} href={`/console/tickets/${t.id}`} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0 hover:text-brand-700">
                <span><span className="font-mono text-xs text-muted">{t.code}</span> {t.customer}</span>
                <Badge>{t.status.replace("_", " ")}</Badge>
              </Link>
            ))}
          </section>
        </aside>
      </div>

      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title={`Resolve ${inc.code}`}>
        <div className="space-y-4">
          <Textarea label="Root cause & fix (internal — becomes a playbook lesson)" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <Textarea
            label={`Message to all ${inc.customer_count} affected customers (email + WhatsApp)`}
            rows={3}
            value={custMsg}
            onChange={(e) => setCustMsg(e.target.value)}
            placeholder={`Good news — the issue you reported (${inc.title}) has been fixed…`}
          />
          <Button
            className="w-full"
            disabled={note.trim().length < 5}
            onClick={async () => {
              await post("/resolve", { note, customer_message: custMsg || undefined }, "Resolved — customers notified, lesson saved");
              setResolveOpen(false);
            }}
          >
            Resolve, notify customers & teach the AI
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Big({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider opacity-70">{l}</p>
      <p className="text-xl font-extrabold">{v}</p>
    </div>
  );
}
