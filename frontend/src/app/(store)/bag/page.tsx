"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, ShoppingBag, Tag, Trash2, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { date, img, rupee } from "@/lib/format";
import { useShop } from "@/lib/shop";
import { Button, Empty, Modal, PageLoader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { RequireCustomer } from "@/components/store/RequireCustomer";
import { PriceDetails } from "@/components/store/PriceDetails";

export default function BagPage() {
  return (
    <RequireCustomer>
      <Bag />
    </RequireCustomer>
  );
}

function Bag() {
  const router = useRouter();
  const toast = useToast();
  const { refreshBag } = useShop();
  const [bag, setBag] = useState<any>(null);
  const [coupon, setCoupon] = useState<string>("");
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");

  const load = useCallback(
    async (c = coupon) => {
      const b = await api("/api/cart", { query: { coupon: c || undefined } });
      setBag(b);
      return b;
    },
    [coupon],
  );

  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem("vastra_coupon") || "";
    } catch {}
    setCoupon(saved);
    load(saved).catch(() => {});
    api("/api/coupons").then((r) => setCoupons(r.items)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCoupon = async (code: string) => {
    const b = await load(code);
    if (b.coupon?.valid) {
      setCoupon(code.toUpperCase());
      try {
        sessionStorage.setItem("vastra_coupon", code.toUpperCase());
      } catch {}
      setCouponOpen(false);
      toast.success(b.coupon.message);
    } else {
      toast.error(b.coupon?.message || "Invalid coupon");
      await load("");
    }
  };
  const removeCoupon = async () => {
    setCoupon("");
    try {
      sessionStorage.removeItem("vastra_coupon");
    } catch {}
    await load("");
  };

  const update = async (id: number, body: any) => {
    try {
      await api(`/api/cart/${id}`, { method: "PATCH", body });
      await load();
      refreshBag();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const remove = async (id: number, toWishlist = false) => {
    await api(`/api/cart/${id}`, { method: "DELETE", query: { to_wishlist: toWishlist } });
    await load();
    refreshBag();
    toast.success(toWishlist ? "Moved to wishlist" : "Removed from bag");
  };

  if (!bag) return <PageLoader />;
  if (bag.items.length === 0)
    return (
      <Empty
        icon={<ShoppingBag size={56} />}
        title="Your bag is empty"
        text="There's nothing in your bag. Let's add some items."
        action={
          <div className="flex gap-3">
            <Link href="/wishlist"><Button variant="outline">Add from wishlist</Button></Link>
            <Link href="/shop"><Button>Continue shopping</Button></Link>
          </div>
        }
      />
    );

  const unavailable = bag.items.filter((i: any) => !i.available);
  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {bag.item_total < bag.free_shipping_above && (
          <div className="flex items-center gap-2 rounded-lg bg-saffron-50 px-4 py-3 text-sm ring-1 ring-saffron-100">
            <Truck size={16} className="text-saffron-600" /> Add items worth <b>{rupee(bag.free_shipping_above - bag.item_total)}</b> more for FREE shipping
          </div>
        )}
        {unavailable.length > 0 && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
            {unavailable.length} item(s) are out of stock in the selected size and won&apos;t be ordered.
          </div>
        )}
        {bag.items.map((i: any) => (
          <div key={i.id} className={`flex gap-4 rounded-xl border border-line p-3 ${!i.available ? "opacity-60" : ""}`}>
            <Link href={`/product/${i.product.id}`} className="shrink-0">
              <img src={img(i.product.image, 200)} alt="" className="h-36 w-28 rounded-md object-cover" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{i.product.brand}</p>
              <p className="truncate text-sm text-muted">{i.product.name}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <select value={i.size} onChange={(e) => update(i.id, { size: e.target.value })} className="rounded bg-brand-50 px-2 py-1 text-xs font-bold outline-none" aria-label="Size">
                  {i.sizes.map((s: string) => (
                    <option key={s} value={s}>Size: {s}</option>
                  ))}
                </select>
                <select value={i.qty} onChange={(e) => update(i.id, { qty: Number(e.target.value) })} className="rounded bg-brand-50 px-2 py-1 text-xs font-bold outline-none" aria-label="Quantity">
                  {Array.from({ length: Math.max(1, Math.min(10, i.stock)) }).map((_, n) => (
                    <option key={n + 1} value={n + 1}>Qty: {n + 1}</option>
                  ))}
                </select>
              </div>
              <p className="mt-2 flex flex-wrap items-baseline gap-2 text-sm">
                <b>{rupee(i.product.price * i.qty)}</b>
                {i.product.discount_pct > 0 && (
                  <>
                    <s className="text-xs text-muted">{rupee(i.product.mrp * i.qty)}</s>
                    <span className="text-xs font-bold text-deal">{i.product.discount_pct}% OFF</span>
                  </>
                )}
              </p>
              {!i.available && <p className="mt-1 text-xs font-bold text-red-600">Only {i.stock} left in this size</p>}
              <div className="mt-3 flex gap-4 text-xs font-bold">
                <button onClick={() => remove(i.id)} className="flex items-center gap-1 text-muted hover:text-red-600">
                  <Trash2 size={13} /> Remove
                </button>
                <button onClick={() => remove(i.id, true)} className="flex items-center gap-1 text-muted hover:text-brand-700">
                  <Heart size={13} /> Move to wishlist
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-line p-4">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-muted">Coupons</p>
          {bag.coupon?.valid ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold"><Tag size={15} className="text-emerald-600" /> {bag.coupon.code} applied</p>
                <p className="text-xs text-emerald-700">{bag.coupon.message}</p>
              </div>
              <button onClick={removeCoupon} className="text-xs font-bold text-deal">Remove</button>
            </div>
          ) : (
            <button onClick={() => setCouponOpen(true)} className="flex w-full items-center justify-between text-sm font-bold">
              <span className="flex items-center gap-2"><Tag size={15} /> Apply coupons</span>
              <span className="rounded border border-brand-700 px-3 py-1 text-xs text-brand-700">APPLY</span>
            </button>
          )}
        </div>
        <div className="rounded-xl border border-line p-4">
          <PriceDetails bag={bag} />
          <Button size="lg" className="mt-5 w-full" onClick={() => router.push("/checkout")}>
            Place order
          </Button>
        </div>
      </aside>

      <Modal open={couponOpen} onClose={() => setCouponOpen(false)} title="Apply coupon">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyCoupon(couponInput);
          }}
          className="mb-4 flex gap-2"
        >
          <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Enter coupon code" className="h-10 flex-1 rounded-md border border-line px-3 text-sm font-bold uppercase outline-none focus:border-brand-500" />
          <Button type="submit">Check</Button>
        </form>
        {coupons.length === 0 ? (
          <p className="text-sm text-muted">No active coupons right now.</p>
        ) : (
          <div className="space-y-3">
            {coupons.map((c) => (
              <div key={c.code} className="rounded-lg border border-dashed border-brand-300 p-3">
                <div className="flex items-center justify-between">
                  <span className="rounded bg-brand-50 px-2 py-0.5 font-mono text-sm font-bold text-brand-800">{c.code}</span>
                  <button onClick={() => applyCoupon(c.code)} className="text-xs font-bold text-brand-700">APPLY</button>
                </div>
                <p className="mt-2 text-sm font-semibold">{c.description}</p>
                <p className="mt-1 text-xs text-muted">
                  {c.min_order > 0 && `Min. order ${rupee(c.min_order)}. `}
                  {c.max_discount && `Max discount ${rupee(c.max_discount)}. `}
                  {c.max_item_discount_pct != null && `Not valid on items already discounted over ${c.max_item_discount_pct}%. `}
                  {c.first_order_only && "First order only. "}
                  {c.valid_to && `Valid till ${date(c.valid_to)}.`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
