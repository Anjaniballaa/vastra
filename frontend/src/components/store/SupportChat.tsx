"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Bot, Headset, Send, Star, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Button, RichText } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export type Ticket = {
  id: number;
  code: string;
  subject: string;
  status: string;
  status_text: string;
  agent: string | null;
  csat: number | null;
  messages?: { id: number; sender: string; body: string; at: string; author: string | null; channel: string }[];
};

const STARTERS = ["Where is my order?", "I want to return an item", "My payment failed but money was debited", "Coupon is not working"];

export function SupportChat({
  ticketId,
  orderCode,
  onTicket,
  className,
}: {
  ticketId?: number | null;
  orderCode?: string | null;
  onTicket?: (t: Ticket) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (id: number) => {
      const t = await api<Ticket>(`/api/support/tickets/${id}`);
      setTicket(t);
      onTicket?.(t);
    },
    [onTicket],
  );

  useEffect(() => {
    if (ticketId) load(ticketId).catch(() => setTicket(null));
    else setTicket(null);
  }, [ticketId, load]);

  useRealtime(
    (event, data) => {
      if (event === "ticket.message" && ticket && data.ticket_id === ticket.id) load(ticket.id).catch(() => {});
    },
    [ticket?.id],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [ticket?.messages?.length, pending]);

  const send = async (msg?: string) => {
    const body = (msg ?? text).trim();
    if (!body || loading) return;
    setText("");
    setPending(body);
    setLoading(true);
    try {
      const t = await api<Ticket>("/api/support/chat", {
        method: "POST",
        body: { message: body, ticket_id: ticket?.id, order_code: ticket ? undefined : orderCode },
      });
      setTicket(t);
      onTicket?.(t);
    } catch (e: any) {
      toast.error(e.message);
      setText(body);
    } finally {
      setPending(null);
      setLoading(false);
    }
  };

  const rate = async (r: number) => {
    if (!ticket) return;
    const t = await api<Ticket>(`/api/support/tickets/${ticket.id}/csat`, { method: "POST", body: { rating: r } });
    setTicket({ ...ticket, csat: t.csat });
    toast.success("Thanks for the feedback!");
  };

  if (!user) {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 p-8 text-center", className)}>
        <Headset className="text-brand-400" size={36} />
        <p className="font-bold">Log in to chat with Vastra Care</p>
        <p className="text-sm text-muted">We&apos;ll pull up your orders and history so you never have to repeat yourself.</p>
        <Link href="/login?next=/help">
          <Button>Log in</Button>
        </Link>
      </div>
    );
  }

  const messages = ticket?.messages ?? [];
  const human = ticket && ["needs_human", "human_active"].includes(ticket.status);

  return (
    <div className={clsx("flex min-h-0 flex-col", className)}>
      {ticket && (
        <div
          className={clsx(
            "flex items-center justify-between gap-2 border-b px-4 py-2 text-xs",
            human ? "border-amber-200 bg-amber-50 text-amber-900" : "border-line bg-canvas text-muted",
          )}
        >
          <span className="font-semibold">
            {ticket.code} · {ticket.status_text}
          </span>
          {human && <span>A specialist will reply here, by email and on WhatsApp</span>}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !pending && (
          <div className="py-4">
            <div className="flex items-start gap-2">
              <Avatar sender="ai" />
              <div className="rounded-2xl rounded-tl-sm bg-brand-50 px-3 py-2 text-sm">
                Hi {user.name.split(" ")[0]}! I&apos;m Vastra Care. I can see your orders and remember our past conversations. How can I help?
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 pl-9">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} sender={m.sender} body={m.body} at={m.at} author={m.author} channel={m.channel} />
        ))}
        {pending && (
          <>
            <Bubble sender="customer" body={pending} />
            <div className="flex items-center gap-2">
              <Avatar sender="ai" />
              <div className="flex gap-1 rounded-2xl bg-brand-50 px-3 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </div>
              <span className="text-xs text-muted">checking your history…</span>
            </div>
          </>
        )}
        {ticket?.status === "resolved" && !ticket.csat && (
          <div className="rounded-xl border border-line p-3 text-center">
            <p className="text-sm font-semibold">How did we do?</p>
            <div className="mt-2 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} onClick={() => rate(r)} aria-label={`${r} stars`}>
                  <Star size={24} className="text-saffron-400 hover:fill-saffron-400" />
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-line p-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder={human ? "Add more details for the specialist…" : "Type your message…"}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <Button type="submit" loading={loading} aria-label="Send" className="h-10 w-10 !px-0">
          {!loading && <Send size={16} />}
        </Button>
      </form>
    </div>
  );
}

function Avatar({ sender }: { sender: string }) {
  return (
    <span
      className={clsx(
        "grid h-7 w-7 shrink-0 place-items-center rounded-full",
        sender === "ai" ? "bg-brand-700 text-white" : sender === "agent" ? "bg-saffron-500 text-white" : "bg-gray-200 text-gray-600",
      )}
    >
      {sender === "ai" ? <Bot size={15} /> : sender === "agent" ? <Headset size={14} /> : <UserRound size={14} />}
    </span>
  );
}

function Bubble({ sender, body, at, author, channel }: { sender: string; body: string; at?: string; author?: string | null; channel?: string }) {
  if (sender === "system") {
    return <p className="mx-auto max-w-sm rounded-lg bg-canvas px-3 py-2 text-center text-xs text-muted">{body}</p>;
  }
  const mine = sender === "customer";
  return (
    <div className={clsx("flex items-start gap-2", mine && "flex-row-reverse")}>
      {!mine && <Avatar sender={sender} />}
      <div className={clsx("max-w-[82%]", mine && "text-right")}>
        <div
          className={clsx(
            "inline-block rounded-2xl px-3 py-2 text-left text-sm",
            mine ? "rounded-tr-sm bg-brand-700 text-white" : sender === "agent" ? "rounded-tl-sm bg-saffron-50 ring-1 ring-saffron-100" : "rounded-tl-sm bg-brand-50",
          )}
        >
          <RichText text={body} />
        </div>
        {at && (
          <p className="mt-0.5 px-1 text-[10px] text-muted">
            {sender === "agent" ? `${author ?? "Agent"} · ` : sender === "ai" ? "Vastra Care AI · " : ""}
            {dateTime(at)}
            {channel && channel !== "web" ? ` · via ${channel}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
