"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { date } from "@/lib/format";
import { Badge, Button, Input, Modal, PageLoader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { RequireCustomer } from "@/components/store/RequireCustomer";
import { AddressForm, type Address } from "@/components/store/AddressForm";

export default function ProfilePage() {
  return (
    <RequireCustomer>
      <Profile />
    </RequireCustomer>
  );
}

function Profile() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user!.name);
  const [phone, setPhone] = useState(user!.phone || "");
  const [wa, setWa] = useState(user!.whatsapp_opt_in);
  const [saving, setSaving] = useState(false);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | null | "new">(null);

  const loadAddresses = () => api("/api/addresses").then((r) => setAddresses(r.items));
  useEffect(() => {
    loadAddresses();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/auth/me", { method: "PATCH", body: { name, phone, whatsapp_opt_in: wa } });
      await refresh();
      toast.success("Profile saved");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!addresses) return <PageLoader />;
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 lg:grid-cols-[1fr_1.2fr]">
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-brand-800 to-brand-600 p-6 text-white">
          <p className="text-sm text-brand-100">Vastra Insider</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold">
            <Sparkles className="text-saffron-400" /> {user!.loyalty_points}
          </p>
          <p className="text-sm text-brand-100">points · 1 point = ₹1 at checkout</p>
          <p className="mt-4 text-xs text-brand-200">Member since {date(user!.created_at, { month: "long", year: "numeric" })}</p>
        </div>
        <form onSubmit={save} className="space-y-4 rounded-xl border border-line p-5">
          <h2 className="font-extrabold">Profile</h2>
          <Input label="Email" value={user!.email} disabled />
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" hint="Used for WhatsApp updates and to recognise you when you message us" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wa} onChange={(e) => setWa(e.target.checked)} className="accent-brand-700" /> Send order & support updates on WhatsApp
          </label>
          <Button type="submit" loading={saving}>Save changes</Button>
        </form>
      </div>
      <div className="rounded-xl border border-line p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-extrabold">Saved addresses</h2>
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus size={14} /> Add
          </Button>
        </div>
        {addresses.length === 0 && <p className="text-sm text-muted">No saved addresses yet.</p>}
        <div className="space-y-3">
          {addresses.map((a) => (
            <div key={a.id} className="rounded-lg border border-line p-4 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold">
                  {a.name} <Badge className="ml-1">{a.kind}</Badge> {a.is_default && <Badge tone="brand">Default</Badge>}
                </p>
                <div className="flex gap-2 text-muted">
                  <button onClick={() => setEditing(a)} aria-label="Edit"><Pencil size={15} /></button>
                  <button
                    onClick={async () => {
                      await api(`/api/addresses/${a.id}`, { method: "DELETE" });
                      loadAddresses();
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <p className="mt-1 flex gap-1 text-muted">
                <MapPin size={14} className="mt-0.5 shrink-0" />
                {a.line1}
                {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} – {a.pincode}
              </p>
              <p className="mt-1">{a.phone}</p>
            </div>
          ))}
        </div>
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add address" : "Edit address"} wide>
        {editing !== null && (
          <AddressForm
            initial={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              loadAddresses();
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}
