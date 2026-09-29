"use client";

import { useEffect, useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ago } from "@/lib/format";
import { Badge, Button, Input, Modal, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

const ROLES = [
  ["agent", "Support agent (L1)", "Handles tickets, uses AI drafts, sees customer memory"],
  ["lead", "Support lead (on-call)", "Everything an agent can do + approves big refunds, owns incidents, gets Sev 1 alarms"],
  ["ops", "Operations", "Packs, ships, delivery outcomes, return pickups & QC"],
  ["catalog", "Catalog manager", "Products, prices, stock, coupons, banners"],
  ["admin", "Administrator", "Team, roles, alert thresholds, policies, logs"],
];

export default function TeamPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const load = () => api("/api/admin/users").then((r) => setItems(r.items));
  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  if (user?.role !== "admin") return <p className="p-10 text-center text-muted">Only administrators manage the team.</p>;
  return (
    <div>
      <PageHeader title="Team & roles" subtitle="Create real staff accounts. Phone numbers receive WhatsApp alerts (and calls for Sev 1 once voice is enabled)." actions={<Button onClick={() => setForm({ email: "", name: "", phone: "", role: "agent", password: "" })}><Plus size={15} /> Add staff</Button>} />
      <div className="grid gap-6 p-6 xl:grid-cols-[1fr_360px]">
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-line">
          {!items ? (
            <div className="flex justify-center p-10"><Spinner /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Role</th>
                  <th className="px-4 py-2">Phone (alerts)</th>
                  <th className="px-4 py-2">Last sign-in</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <p className="font-bold">{u.name} {!u.is_active && <Badge>disabled</Badge>}</p>
                      <p className="text-xs text-muted">{u.email}</p>
                    </td>
                    <td className="px-4 py-3"><Badge tone={u.role === "admin" ? "dark" : u.role === "lead" ? "red" : "brand"}>{u.role}</Badge></td>
                    <td className="px-4 py-3">{u.phone || <span className="text-xs text-amber-700">missing — no WhatsApp alerts</span>}</td>
                    <td className="px-4 py-3 text-muted">{u.last_login_at ? ago(u.last_login_at) : "never"}</td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setEditing({ ...u, password: "" })}><UserCog size={14} /> Edit</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <aside className="h-fit space-y-3 rounded-xl bg-white p-5 ring-1 ring-line">
          <p className="font-extrabold">Roles</p>
          {ROLES.map(([k, l, d]) => (
            <div key={k} className="text-sm">
              <p className="font-bold">{l}</p>
              <p className="text-xs text-muted">{d}</p>
            </div>
          ))}
        </aside>
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title="Add staff member">
        {form && (
          <div className="space-y-3">
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Work email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Mobile (for WhatsApp alerts)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} hint="They must join the Twilio WhatsApp sandbox to receive alerts" />
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Input label="Initial password (min 8 chars)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button
              className="w-full"
              onClick={async () => {
                try {
                  await api("/api/admin/users", { method: "POST", body: { ...form, phone: form.phone || null } });
                  toast.success("Staff account created");
                  setForm(null);
                  load();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Create account
            </Button>
          </div>
        )}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit ${editing?.name ?? ""}`}>
        {editing && (
          <div className="space-y-3">
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input label="Mobile" value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Select label="Role" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Input label="New password (leave empty to keep)" type="password" value={editing.password} onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="accent-brand-700" /> Account active</label>
            <Button
              className="w-full"
              onClick={async () => {
                try {
                  await api(`/api/admin/users/${editing.id}`, {
                    method: "PATCH",
                    body: { name: editing.name, phone: editing.phone ?? "", role: editing.role, is_active: editing.is_active, password: editing.password || undefined },
                  });
                  toast.success("Saved");
                  setEditing(null);
                  load();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
