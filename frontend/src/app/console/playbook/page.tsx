"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { BookOpenCheck, Brain, Lightbulb } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { useRealtime } from "@/lib/realtime";
import { Badge, Empty, PageLoader, RichText } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function PlaybookPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"lessons" | "memory">("lessons");
  const load = useCallback(() => api("/api/staff/playbook").then(setData), []);
  useEffect(() => {
    load();
  }, [load]);
  useRealtime((e) => e === "lesson.created" && load(), [load]);

  if (!data) return <PageLoader />;
  return (
    <div>
      <PageHeader
        title="Support playbook"
        subtitle="Everything the AI has learned in hindsight — from resolved tickets, human corrections and incidents. Stored in Hindsight memory and recalled on every new ticket."
      />
      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_400px]">
        <div>
          <div className="mb-4 flex gap-2">
            {[["lessons", `Lessons (${data.lessons.length})`], ["memory", `Raw playbook memory (${data.memories.length})`]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as any)} className={clsx("rounded-full px-4 py-1.5 text-sm font-bold", tab === k ? "bg-brand-700 text-white" : "bg-white ring-1 ring-line")}>
                {l}
              </button>
            ))}
          </div>
          {tab === "lessons" ? (
            data.lessons.length === 0 ? (
              <Empty icon={<BookOpenCheck size={44} />} title="No lessons yet" text="When a ticket is resolved, Vastra Care looks back at it and writes down what worked." />
            ) : (
              <div className="space-y-3">
                {data.lessons.map((l: any) => (
                  <div key={l.id} className="rounded-xl bg-white p-4 ring-1 ring-line">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={l.kind === "incident" ? "red" : l.kind === "correction" ? "amber" : "green"}>{l.kind}</Badge>
                      {l.category && <Badge>{l.category}</Badge>}
                      {l.retained && <Badge tone="brand"><Brain size={10} /> in memory</Badge>}
                      <span className="ml-auto text-xs text-muted">{dateTime(l.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm"><b>Symptom:</b> {l.symptom}</p>
                    {l.cause && <p className="mt-1 text-sm text-muted"><b className="text-ink">Cause:</b> {l.cause}</p>}
                    <p className="mt-1 text-sm"><b>Fix:</b> {l.fix}</p>
                    {l.faster_path && (
                      <p className="mt-2 flex gap-2 rounded-lg bg-saffron-50 p-2 text-xs text-saffron-600">
                        <Lightbulb size={14} className="shrink-0" /> Faster next time: {l.faster_path}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      {l.ticket_id && <Link href={`/console/tickets/${l.ticket_id}`} className="font-bold text-brand-700">from ticket</Link>}
                      {l.incident_id && <Link href={`/console/incidents/${l.incident_id}`} className="font-bold text-brand-700">from incident</Link>}
                      {l.turns > 0 && ` · took ${l.turns} replies`}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="space-y-2">
              {data.memories.map((m: any) => (
                <div key={m.id} className="rounded-lg bg-white p-3 text-sm ring-1 ring-line">
                  {m.text}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{m.type} · {m.context} · {m.tags?.join(", ")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="h-fit rounded-xl border border-brand-200 bg-gradient-to-b from-brand-50 to-white p-5">
          <p className="flex items-center gap-2 font-extrabold text-brand-800"><Brain size={18} /> Known issues & proven fixes</p>
          <p className="mt-1 text-xs text-muted">A Hindsight mental model, refreshed automatically whenever a lesson is added.</p>
          <div className="mt-3 text-sm">
            {data.known_issues ? <RichText text={data.known_issues} /> : <p className="text-muted">Builds up as tickets get resolved.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
