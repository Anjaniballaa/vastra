"use client";

import { useEffect, useState } from "react";
import { Brain, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { date } from "@/lib/format";
import { RichText, Spinner } from "@/components/ui";

/** What Hindsight remembers about a customer: a reflected briefing plus the raw memories. */
export function MemoryCard({ customerId, compact }: { customerId: number; compact?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = () => {
    setLoading(true);
    api(`/api/staff/customers/${customerId}/memory`)
      .then(setData)
      .catch(() => setData({ summary: "", memories: [] }))
      .finally(() => setLoading(false));
  };
  useEffect(load, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const mems = data?.memories ?? [];
  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-b from-brand-50 to-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-extrabold text-brand-800">
          <Brain size={16} /> What we remember
        </p>
        <button onClick={load} className="text-brand-600 hover:text-brand-800" aria-label="Refresh memory">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {loading && !data ? (
        <div className="flex items-center gap-2 py-4 text-xs text-muted">
          <Spinner className="!h-4 !w-4" /> Reflecting on past conversations…
        </div>
      ) : (
        <>
          {data.summary ? (
            <RichText text={data.summary} className="text-sm" />
          ) : (
            <p className="text-sm text-muted">No memories yet — this looks like a first conversation.</p>
          )}
          {mems.length > 0 && !compact && (
            <div className="mt-3 border-t border-brand-100 pt-3">
              <button onClick={() => setShowAll((s) => !s)} className="text-xs font-bold text-brand-700">
                {showAll ? "Hide" : "Show"} {mems.length} stored memories
              </button>
              {showAll && (
                <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto">
                  {mems.map((m: any) => (
                    <li key={m.id} className="rounded-lg bg-white p-2 text-xs ring-1 ring-line">
                      <p>{m.text}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                        {m.type} {m.when && `· ${date(m.when)}`} {m.context && `· ${m.context}`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
