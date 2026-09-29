"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function NotificationsPage() {
  const [channel, setChannel] = useState("");
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api("/api/admin/notifications", { query: { channel } }).then((r) => setItems(r.items));
  useEffect(() => {
    setItems(null);
    load();
  }, [channel]); // eslint-disable-line react-hooks/exhaustive-deps
  useRealtime((e) => (e.startsWith("incident.") || e.startsWith("order.") || e.startsWith("ticket.")) && setTimeout(load, 2500), [channel]);

  return (
    <div>
      <PageHeader title="Notification log" subtitle="Every email, WhatsApp message and alert call the system attempted — with delivery status." />
      <div className="p-6">
        <div className="mb-4 flex gap-2">
          {[["", "All"], ["email", "Email"], ["whatsapp", "WhatsApp"], ["voice", "Voice"]].map(([k, l]) => (
            <button key={k} onClick={() => setChannel(k)} className={clsx("rounded-full px-4 py-1.5 text-sm font-bold", channel === k ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-line">
          {!items ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Channel</th>
                  <th className="px-4 py-2">To</th>
                  <th className="px-4 py-2">Message</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((n) => (
                  <tr key={n.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{dateTime(n.created_at)}</td>
                    <td className="px-4 py-2"><Badge tone={n.channel === "whatsapp" ? "green" : n.channel === "voice" ? "red" : "blue"}>{n.channel}</Badge></td>
                    <td className="px-4 py-2 font-mono text-xs">{n.to}</td>
                    <td className="max-w-md px-4 py-2">
                      {n.subject && <p className="font-semibold">{n.subject}</p>}
                      <p className="line-clamp-2 text-xs text-muted">{n.body}</p>
                      {n.related && <p className="text-[10px] text-muted">{n.related}</p>}
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={n.status === "sent" ? "green" : n.status === "failed" ? "red" : "amber"}>{n.status}</Badge>
                      {n.error && <p className="mt-1 max-w-56 text-[11px] text-red-600">{n.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
