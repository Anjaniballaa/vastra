"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export type Address = {
  id: number;
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  kind: string;
  is_default: boolean;
};

export function AddressForm({ initial, onSaved, onCancel }: { initial?: Address | null; onSaved: (a: Address) => void; onCancel?: () => void }) {
  const { user } = useAuth();
  const [f, setF] = useState({
    name: initial?.name ?? user?.name ?? "",
    phone: initial?.phone ?? user?.phone ?? "",
    pincode: initial?.pincode ?? "",
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    landmark: initial?.landmark ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    kind: initial?.kind ?? "home",
    is_default: initial?.is_default ?? false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));

  const onPin = async (pin: string) => {
    set("pincode", pin);
    if (/^\d{6}$/.test(pin)) {
      const r = await api(`/api/pincode/${pin}`).catch(() => null);
      if (r?.deliverable) setF((x) => ({ ...x, pincode: pin, city: r.city || x.city, state: r.state || x.state }));
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const a = await api<Address>(initial ? `/api/addresses/${initial.id}` : "/api/addresses", { method: initial ? "PUT" : "POST", body: f });
      onSaved(a);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <Input label="Name" required value={f.name} onChange={(e) => set("name", e.target.value)} />
      <Input label="Mobile" required value={f.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
      <Input label="Pincode" required value={f.pincode} onChange={(e) => onPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" />
      <Input label="City / District" required value={f.city} onChange={(e) => set("city", e.target.value)} />
      <div className="sm:col-span-2">
        <Input label="House no., building, street" required value={f.line1} onChange={(e) => set("line1", e.target.value)} />
      </div>
      <Input label="Locality / area" value={f.line2} onChange={(e) => set("line2", e.target.value)} />
      <Input label="Landmark" value={f.landmark} onChange={(e) => set("landmark", e.target.value)} placeholder="Helps the courier find you" />
      <Input label="State" required value={f.state} onChange={(e) => set("state", e.target.value)} />
      <div className="flex items-end gap-2 pb-1">
        {["home", "work"].map((k) => (
          <button type="button" key={k} onClick={() => set("kind", k)} className={`rounded-full border px-4 py-1.5 text-xs font-bold uppercase ${f.kind === k ? "border-brand-700 bg-brand-50 text-brand-800" : "border-line"}`}>
            {k}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" checked={f.is_default} onChange={(e) => set("is_default", e.target.checked)} className="accent-brand-700" /> Make this my default address
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" loading={saving}>Save address</Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
