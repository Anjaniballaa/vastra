"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { ago } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Empty, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";
import { SevChip } from "@/components/console/bits";

export default function IncidentsPage() {
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [items, setItems] = useState<any[] | null>(null);
  const [rules, setRules] = useState<any>(null);

  const load = useCallback(() => api("/api/staff/incidents", { query: { status: tab } }).then((r) => setItems(r.items)), [tab]);
  useEffect(() => {
    setItems(null);
    load();
    api("/api/staff/severity-rules").then((s) => setRules(s.rules)).catch(() => {});
  }, [load]);
  useRealtime((e) => e.startsWith("incident.") && load(), [load]);

  return (
    <div>
      <PageHeader title="Incidents" subtitle="New issues reported by several customers are clustered here automatically. Severity only rises on its own; only people can lower it." />
      {rules && (
        <div className="grid gap-3 px-6 pt-5 sm:grid-cols-4">
          {[
            ["new", "New issue", "1 customer · straight to an agent"],
            ["sev3", "SEV 3", `${rules.sev3.customers}+ customers in ${rules.sev3.window_minutes / 60}h · email + WhatsApp`],
            ["sev2", "SEV 2", `${rules.sev2.customers}+ customers in ${rules.sev2.window_minutes}m · repeats until acked`],
            ["sev1", "SEV 1", `${rules.sev1.customers}+ in ${rules.sev1.window_minutes}m, or ${rules.sev1_critical.customers}+ payment/security in ${rules.sev1_critical.window_minutes}m · siren, call, escalation`],
          ].map(([s, l, d]) => (
            <div key={s} className="rounded-xl bg-white p-3 ring-1 ring-line">
              <SevChip severity={s} label={l} />
              <p className="mt-2 text-xs text-muted">{d}</p>
            </div>
          ))}
        </div>
      )}
      <div className="p-6">
        <div className="mb-4 flex gap-2">
          {(["active", "resolved"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx("rounded-full px-4 py-1.5 text-sm font-bold capitalize", tab === t ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
              {t}
            </button>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
          {items === null ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : items.length === 0 ? (
            <Empty icon={<ShieldCheck size={44} />} title={tab === "active" ? "All clear" : "No resolved incidents yet"} text="When customers start reporting the same new problem, it appears here in real time." />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Severity</th>
                  <th className="px-4 py-2">Incident</th>
                  <th className="hidden px-4 py-2 md:table-cell">Category</th>
                  <th className="px-4 py-2">Customers</th>
                  <th className="hidden px-4 py-2 md:table-cell">Status</th>
                  <th className="hidden px-4 py-2 lg:table-cell">Last report</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-line hover:bg-brand-50/40">
                    <td className="px-4 py-3"><SevChip severity={i.severity} label={i.severity_label} /></td>
                    <td className="px-4 py-3">
                      <Link href={`/console/incidents/${i.id}`} className="font-bold hover:text-brand-700">{i.title}</Link>
                      <p className="font-mono text-xs text-muted">{i.code}</p>
                    </td>
                    <td className="hidden px-4 py-3 capitalize md:table-cell">{i.category}</td>
                    <td className="px-4 py-3 font-bold">{i.customer_count} <span className="font-normal text-muted">({i.report_count} reports)</span></td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Badge tone={i.status === "resolved" ? "green" : i.status === "acknowledged" ? "blue" : "red"}>{i.status}</Badge>
                      {i.acknowledged_by && <p className="text-xs text-muted">by {i.acknowledged_by}</p>}
                    </td>
                    <td className="hidden px-4 py-3 text-muted lg:table-cell">{ago(i.last_seen)}</td>
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
