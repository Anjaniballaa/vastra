"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function AuditPage() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => {
    api("/api/admin/audit").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who changed what: refunds, cancellations, order moves, settings, staff." />
      <div className="p-6">
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-line">
          {!items ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">Who</th>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2">Target</th>
                  <th className="px-4 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{dateTime(a.created_at)}</td>
                    <td className="px-4 py-2">{a.actor_label}</td>
                    <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                    <td className="px-4 py-2 font-mono text-xs">{a.target}</td>
                    <td className="max-w-md px-4 py-2 text-xs text-muted">{a.detail}</td>
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
