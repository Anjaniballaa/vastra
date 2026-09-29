"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime, img, rupee } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, Empty, Modal, Spinner, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

const STAGES = [
  ["requested", "New requests"],
  ["approved", "Approved"],
  ["pickup_scheduled", "Pickup scheduled"],
  ["picked", "Awaiting QC"],
  ["qc_passed", "QC passed"],
  ["completed", "Completed"],
  ["rejected,qc_failed", "Rejected"],
];
const ACTION: Record<string, [string, "primary" | "outline"]> = {
  approved: ["Approve", "primary"],
  rejected: ["Reject", "outline"],
  pickup_scheduled: ["Schedule pickup", "primary"],
  picked: ["Mark picked up", "primary"],
  qc_passed: ["QC passed", "primary"],
  qc_failed: ["QC failed", "outline"],
  completed: ["Complete (refund / ship exchange)", "primary"],
};

export default function ReturnsPage() {
  const toast = useToast();
  const [stage, setStage] = useState("requested");
  const [items, setItems] = useState<any[] | null>(null);
  const [flow, setFlow] = useState<any>({});
  const [noteFor, setNoteFor] = useState<{ r: any; status: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => api("/api/ops/returns", { query: { status: stage } }).then((r) => setItems(r.items)), [stage]);
  useEffect(() => {
    api("/api/ops/meta").then((m) => setFlow(m.return_flow));
  }, []);
  useEffect(() => {
    setItems(null);
    load();
  }, [load]);
  useRealtime((e) => (e.startsWith("return.") || e === "order.updated") && load(), [load]);

  const move = async (r: any, status: string, n?: string) => {
    if ((status === "rejected" || status === "qc_failed") && n === undefined) {
      setNoteFor({ r, status });
      return;
    }
    try {
      await api(`/api/ops/returns/${r.id}/status`, { method: "POST", body: { status, note: n } });
      toast.success(status === "completed" ? (r.kind === "refund" ? "Refund issued" : "Replacement order created") : "Updated — customer notified");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div>
      <PageHeader title="Returns & exchanges" subtitle="Completing a return triggers the Razorpay refund (or points for COD); completing an exchange creates the replacement order." />
      <div className="flex gap-2 overflow-x-auto px-6 pt-5">
        {STAGES.map(([s, l]) => (
          <button key={s} onClick={() => setStage(s)} className={clsx("shrink-0 rounded-full px-4 py-1.5 text-sm font-bold", stage === s ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
            {l}
          </button>
        ))}
      </div>
      <div className="p-6">
        {items === null ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : items.length === 0 ? (
          <Empty icon={<Undo2 size={40} />} title="Nothing in this stage" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((r) => (
              <div key={r.id} className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-line">
                <img src={img(r.item.image, 160)} alt="" className="h-28 w-20 rounded object-cover" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={r.kind === "refund" ? "red" : "blue"}>{r.kind}</Badge>
                    <span className="font-mono text-xs">{r.order}</span>
                    <span className="text-xs text-muted">{dateTime(r.created_at)}</span>
                  </div>
                  <p className="mt-1 font-bold">{r.item.brand} {r.item.name}</p>
                  <p className="text-xs text-muted">
                    Size {r.item.size}{r.exchange_size && ` → ${r.exchange_size}`} · {rupee(r.item.price * r.item.qty)} · {r.customer}
                  </p>
                  <p className="mt-1 text-xs"><b>Reason:</b> {r.reason} {r.comment && `— “${r.comment}”`}</p>
                  {r.photo_url && (
                    <a href={r.photo_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-brand-700">View customer photo</a>
                  )}
                  <p className="mt-1 text-xs text-muted">Pickup: {r.address.line1}, {r.address.city} {r.address.pincode}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(flow[r.status] || []).map((s: string) => (
                      <Button key={s} size="sm" variant={ACTION[s]?.[1] || "primary"} onClick={() => move(r, s)}>
                        {ACTION[s]?.[0] || s}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!noteFor} onClose={() => setNoteFor(null)} title="Reason (shared with the customer)">
        <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Item shows signs of use; tags removed" />
        <Button
          className="mt-3 w-full"
          disabled={!note.trim()}
          onClick={async () => {
            await move(noteFor!.r, noteFor!.status, note);
            setNoteFor(null);
            setNote("");
          }}
        >
          Confirm
        </Button>
      </Modal>
    </div>
  );
}
