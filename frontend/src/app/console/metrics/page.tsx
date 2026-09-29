"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/ui";
import { PageHeader } from "@/components/console/ConsoleShell";
import { Stat } from "@/components/console/bits";

const MATCH_LABEL: Record<string, string> = { lesson: "Solved before (lesson)", incident: "Known incident", policy: "Policy question", order_data: "Order operations", none: "Brand-new issue" };

export default function MetricsPage() {
  const [days, setDays] = useState(14);
  const [m, setM] = useState<any>(null);
  useEffect(() => {
    setM(null);
    api("/api/staff/metrics", { query: { days } }).then(setM);
  }, [days]);
  if (!m) return <PageLoader />;

  const series = m.series.map((d: any) => ({ ...d, date: d.date.slice(5) }));
  const byMatch = Object.entries(m.replies_by_memory_match).map(([k, v]) => ({ name: MATCH_LABEL[k] || k, replies: v }));
  const t = m.totals;
  return (
    <div>
      <PageHeader
        title="Learning metrics"
        subtitle="Is Vastra Care getting better over time? All numbers are computed live from real tickets."
        actions={
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 rounded-md border border-line bg-white px-2 text-sm font-semibold">
            {[7, 14, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        }
      />
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Stat label="Tickets" value={t.tickets} />
          <Stat label="Resolved" value={t.resolved} />
          <Stat label="Resolved by AI" value={t.resolved ? `${Math.round((100 * t.ai_resolved) / t.resolved)}%` : "—"} sub={`${t.ai_resolved} tickets`} />
          <Stat label="New issues found" value={t.new_issues} />
          <Stat label="Lessons in playbook" value={t.lessons} tone="text-brand-700" />
          <Stat label="Avg CSAT" value={t.avg_csat || "—"} sub="out of 5" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Chart title="Replies needed to resolve a ticket" hint="Lower is better — this is the learning curve">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e7f0" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} allowDecimals />
              <Tooltip />
              <Line type="monotone" dataKey="avg_replies_to_resolve" name="Avg replies" stroke="#3f3289" strokeWidth={2.5} connectNulls dot />
            </LineChart>
          </Chart>
          <Chart title="Resolution quality (%)" hint="AI resolution, first-contact resolution and handoff rates">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e7f0" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} domain={[0, 100]} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="ai_resolution_rate" name="Resolved by AI" stroke="#3f3289" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="first_contact_rate" name="First contact" stroke="#16a34a" strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="handoff_rate" name="Handed to human" stroke="#e8590c" strokeWidth={2} connectNulls />
            </LineChart>
          </Chart>
          <Chart title="Tickets per day & memory used" hint="Memory hits = customer memories + playbook lessons recalled per ticket">
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e7f0" />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="tickets" name="Tickets" fill="#aea1e4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="memory_hits_per_ticket" name="Memory hits / ticket" fill="#ef9a0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </Chart>
          <Chart title="Replies to resolve, by what memory matched" hint="Tickets that match a past lesson should close fastest">
            <BarChart data={byMatch} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e7f0" />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" fontSize={11} width={140} />
              <Tooltip />
              <Bar dataKey="replies" name="Avg replies" fill="#3f3289" radius={[0, 4, 4, 0]} />
            </BarChart>
          </Chart>
        </div>
      </div>
    </div>
  );
}

function Chart({ title, hint, children }: { title: string; hint: string; children: React.ReactElement }) {
  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-line">
      <p className="font-extrabold">{title}</p>
      <p className="mb-4 text-xs text-muted">{hint}</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}
