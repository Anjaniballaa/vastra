"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Brain, BrainCircuit, FlaskConical, Search, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { Button, RichText, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function MemoryLab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customer, setCustomer] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => api("/api/staff/customers", { query: { q } }).then((r) => setCustomers(r.items)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [q]);

  const run = async () => {
    setLoading(true);
    setResult(null);
    try {
      setResult(await api("/api/staff/compare", { method: "POST", body: { customer_id: customer.id, message } }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Memory lab"
        subtitle="Ask the same question twice — once with Hindsight memory, once without. Both answers are generated live against real store data; actions are simulated."
      />
      <div className="grid gap-6 p-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <p className="mb-2 text-xs font-bold text-muted">1 · PICK A REAL CUSTOMER</p>
            <div className="mb-2 flex h-9 items-center gap-2 rounded-md border border-line px-2">
              <Search size={14} className="text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers" className="flex-1 text-sm outline-none" />
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {customers.map((c) => (
                <button key={c.id} onClick={() => setCustomer(c)} className={clsx("w-full rounded-md px-2 py-1.5 text-left text-sm", customer?.id === c.id ? "bg-brand-700 text-white" : "hover:bg-brand-50")}>
                  <span className="font-semibold">{c.name}</span>
                  <span className={clsx("block text-xs", customer?.id === c.id ? "text-brand-100" : "text-muted")}>
                    {c.orders} orders · {c.tickets} tickets
                  </span>
                </button>
              ))}
              {customers.length === 0 && <p className="text-xs text-muted">No customers yet.</p>}
            </div>
          </div>
          <div className="rounded-xl bg-white p-4 ring-1 ring-line">
            <p className="mb-2 text-xs font-bold text-muted">2 · WHAT DOES THE CUSTOMER SAY?</p>
            <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. I want to order the same shirt again, which size should I pick?" />
            <Button className="mt-3 w-full" disabled={!customer || !message.trim()} loading={loading} onClick={run}>
              <FlaskConical size={15} /> Compare answers
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Answer title="Without memory" icon={<Brain size={16} />} tone="gray" text={result?.without_memory} tools={result?.tools_without} loading={loading} />
          <Answer title="With Hindsight memory" icon={<BrainCircuit size={16} />} tone="brand" text={result?.with_memory} tools={result?.tools_with} loading={loading} />
          {result && (
            <div className="rounded-xl bg-white p-4 ring-1 ring-line md:col-span-2">
              <p className="mb-2 text-xs font-bold text-muted">WHAT MEMORY CONTRIBUTED</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-bold">Customer memories ({result.memories.length})</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">{result.memories.map((m: any) => <li key={m.id}>{m.text}</li>)}</ul>
                </div>
                <div>
                  <p className="text-sm font-bold">Playbook lessons ({result.lessons.length})</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-muted">{result.lessons.map((m: any) => <li key={m.id}>{m.text}</li>)}</ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Answer({ title, icon, tone, text, tools, loading }: { title: string; icon: React.ReactNode; tone: "gray" | "brand"; text?: string; tools?: any[]; loading: boolean }) {
  return (
    <div className={clsx("rounded-xl p-5 ring-1", tone === "brand" ? "bg-brand-50 ring-brand-200" : "bg-white ring-line")}>
      <p className={clsx("mb-3 flex items-center gap-2 text-sm font-extrabold", tone === "brand" ? "text-brand-800" : "text-muted")}>
        {icon} {title}
      </p>
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-3 animate-pulse rounded bg-black/5" />)}
        </div>
      ) : text ? (
        <>
          <RichText text={text} className="text-sm" />
          {tools && tools.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {tools.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] ring-1 ring-line">
                  <Wrench size={10} /> {t.tool}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Pick a customer and a message to compare.</p>
      )}
    </div>
  );
}
