"use client";

import clsx from "clsx";
import { Bot, Mail, MessageCircle, MonitorSmartphone } from "lucide-react";
import { Badge } from "@/components/ui";

export const TICKET_STATUS: Record<string, { label: string; tone: any }> = {
  ai_active: { label: "AI handling", tone: "brand" },
  needs_human: { label: "Needs human", tone: "red" },
  human_active: { label: "Agent handling", tone: "amber" },
  waiting_customer: { label: "Waiting on customer", tone: "blue" },
  resolved: { label: "Resolved", tone: "green" },
  closed: { label: "Closed", tone: "neutral" },
};

export function TicketStatus({ status }: { status: string }) {
  const s = TICKET_STATUS[status] || { label: status, tone: "neutral" };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  if (channel === "email") return <Mail size={size} className="text-sky-600" aria-label="Email" />;
  if (channel === "whatsapp") return <MessageCircle size={size} className="text-emerald-600" aria-label="WhatsApp" />;
  return <MonitorSmartphone size={size} className="text-brand-600" aria-label="Web chat" />;
}

export function Frustration({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Frustration ${level}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={clsx("h-2.5 w-1.5 rounded-sm", i <= level ? (level >= 4 ? "bg-red-500" : level >= 3 ? "bg-amber-400" : "bg-emerald-400") : "bg-line")} />
      ))}
    </span>
  );
}

export const SEV_STYLE: Record<string, string> = {
  sev1: "bg-red-600 text-white",
  sev2: "bg-orange-500 text-white",
  sev3: "bg-amber-300 text-amber-950",
  new: "bg-sky-100 text-sky-800",
};

export function SevChip({ severity, label }: { severity: string; label?: string }) {
  return <span className={clsx("inline-flex rounded px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide", SEV_STYLE[severity])}>{label || severity}</span>;
}

export function MemoryMatch({ match }: { match: string | null }) {
  if (!match) return null;
  const map: Record<string, [string, any]> = {
    lesson: ["Solved before", "green"],
    incident: ["Known incident", "amber"],
    policy: ["Policy", "neutral"],
    order_data: ["Order data", "neutral"],
    none: ["New issue", "red"],
  };
  const [l, t] = map[match] || [match, "neutral"];
  return (
    <Badge tone={t}>
      <Bot size={10} /> {l}
    </Badge>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={clsx("mt-1 text-2xl font-extrabold", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
