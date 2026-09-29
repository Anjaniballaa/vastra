"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { IndianRupee } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { dateTime, rupee } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, Empty, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function RefundsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("pending_approval");
  const [items, setItems] = useState<any[] | null>(null);
  const load = useCallback(() => api("/api/staff/refunds", { query: { status } }).then((r) => setItems(r.items)), [status]);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);
  useRealtime((e) => e.startsWith("refund.") && load(), [load]);
  const canApprove = ["lead", "admin"].includes(user!.role);

  const act = async (id: number, action: "approve" | "reject") => {
    try {
      await api(`/api/staff/refunds/${id}/${action}`, { method: "POST" });
      toast.success(action === "approve" ? "Refund sent via Razorpay" : "Refund rejected");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Refund approvals" subtitle="The AI refunds small amounts itself. Anything above the AI limit waits here for a lead." />
      <div className="p-6">
        <div className="mb-4 flex gap-2">
          {[["pending_approval", "Pending"], ["processed", "Processed"], ["rejected", "Rejected"], ["failed", "Failed"]].map(([s, l]) => (
            <button key={s} onClick={() => setStatus(s)} className={clsx("rounded-full px-4 py-1.5 text-sm font-bold", status === s ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
              {l}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-line">
          {items === null ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <Empty icon={<IndianRupee size={40} />} title="Nothing to review" />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Order</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Requested by</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-4 py-3 font-mono">{r.order}</td>
                    <td className="px-4 py-3">{r.customer}</td>
                    <td className="px-4 py-3 font-bold">{rupee(r.amount)} <span className="font-normal text-muted">of {rupee(r.order_total)}</span></td>
                    <td className="max-w-72 px-4 py-3">{r.reason}</td>
                    <td className="px-4 py-3">
                      <Badge tone={r.initiated_by === "ai" ? "brand" : "neutral"}>{r.initiated_by}</Badge>
                      <p className="text-xs text-muted">{dateTime(r.created_at)}</p>
                      {r.ticket_id && <Link href={`/console/tickets/${r.ticket_id}`} className="text-xs font-bold text-brand-700">ticket</Link>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {status === "pending_approval" && (canApprove ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => act(r.id, "approve")}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => act(r.id, "reject")}>Reject</Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Needs a lead</span>
                      ))}
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
