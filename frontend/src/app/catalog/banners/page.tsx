"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { img } from "@/lib/format";
import { Badge, Button, Empty, Input, Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PageHeader } from "@/components/console/ConsoleShell";

export default function BannersPage() {
  const toast = useToast();
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const load = () => api("/api/catalog-admin/banners").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <div>
      <PageHeader
        title="Home banners"
        subtitle="When no banners are active, the home page automatically features the categories with the deepest live discounts."
        actions={<Button onClick={() => setForm({ title: "", subtitle: "", image_url: "", link: "/shop", sort: 0, is_active: true })}><Plus size={15} /> New banner</Button>}
      />
      <div className="p-6">
        {items === null ? (
          <div className="flex justify-center p-10"><Spinner /></div>
        ) : items.length === 0 ? (
          <Empty icon={<ImagePlus size={40} />} title="No custom banners" text="The storefront is showing live category deals instead." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((b) => (
              <div key={b.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-line">
                <img src={img(b.image_url, 600)} alt="" className="h-40 w-full object-cover" />
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-bold">{b.title}</p>
                    {b.is_active ? <Badge tone="green">Live</Badge> : <Badge>Hidden</Badge>}
                  </div>
                  <p className="text-sm text-muted">{b.subtitle}</p>
                  <p className="mt-1 font-mono text-xs text-muted">{b.link} · order {b.sort}</p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setForm(b)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/catalog-admin/banners/${b.id}`, { method: "DELETE" }); load(); }}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit banner" : "New banner"}>
        {form && (
          <div className="space-y-3">
            <Input label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            <Input label="Subtitle" value={form.subtitle ?? ""} onChange={(e) => set("subtitle", e.target.value)} />
            <Input label="Link" value={form.link} onChange={(e) => set("link", e.target.value)} hint="e.g. /shop?category=kurtas&min_discount=50" />
            <Input label="Sort order" type="number" value={form.sort} onChange={(e) => set("sort", Number(e.target.value))} />
            <div>
              <p className="mb-1 text-xs font-semibold text-muted">Image</p>
              {form.image_url && <img src={img(form.image_url, 500)} alt="" className="mb-2 h-32 w-full rounded object-cover" />}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-semibold hover:border-ink">
                <ImagePlus size={15} /> {uploading ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    const fd = new FormData();
                    fd.append("file", f);
                    try {
                      set("image_url", (await api("/api/uploads", { method: "POST", body: fd })).url);
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="accent-brand-700" /> Show on home page</label>
            <Button
              className="w-full"
              disabled={!form.title || !form.image_url}
              onClick={async () => {
                try {
                  await api(form.id ? `/api/catalog-admin/banners/${form.id}` : "/api/catalog-admin/banners", { method: form.id ? "PUT" : "POST", body: form });
                  toast.success("Banner saved");
                  setForm(null);
                  load();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Save banner
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
