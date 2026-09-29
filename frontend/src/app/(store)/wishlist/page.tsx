"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, X } from "lucide-react";
import { api } from "@/lib/api";
import { img, rupee } from "@/lib/format";
import { useShop } from "@/lib/shop";
import { Button, Empty, Modal, PageLoader } from "@/components/ui";
import { RequireCustomer } from "@/components/store/RequireCustomer";

export default function WishlistPage() {
  return (
    <RequireCustomer>
      <Wishlist />
    </RequireCustomer>
  );
}

function Wishlist() {
  const { toggleWishlist, addToBag } = useShop();
  const [items, setItems] = useState<any[] | null>(null);
  const [picking, setPicking] = useState<any>(null);

  const load = () => api("/api/wishlist").then((r) => setItems(r.items));
  useEffect(() => {
    load();
  }, []);

  if (!items) return <PageLoader />;
  if (!items.length)
    return <Empty icon={<Heart size={56} />} title="Your wishlist is empty" text="Save items you like and buy them later." action={<Link href="/shop"><Button>Explore styles</Button></Link>} />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-lg font-extrabold">
        My wishlist <span className="font-normal text-muted">{items.length} items</span>
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((p) => (
          <div key={p.id} className="overflow-hidden rounded-lg border border-line">
            <div className="relative">
              <Link href={`/product/${p.id}`}>
                <img src={img(p.image, 400)} alt="" className="aspect-[3/4] w-full object-cover" />
              </Link>
              <button
                onClick={async () => {
                  await toggleWishlist(p.id);
                  load();
                }}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1"
                aria-label="Remove"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-3 text-center">
              <p className="truncate text-sm font-bold">{p.brand}</p>
              <p className="truncate text-xs text-muted">{p.name}</p>
              <p className="mt-1 text-sm">
                <b>{rupee(p.price)}</b>{" "}
                {p.discount_pct > 0 && (
                  <>
                    <s className="text-xs text-muted">{rupee(p.mrp)}</s> <span className="text-xs font-bold text-deal">({p.discount_pct}% OFF)</span>
                  </>
                )}
              </p>
            </div>
            <button onClick={() => setPicking(p)} disabled={!p.in_stock} className="w-full border-t border-line py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-50 disabled:text-muted">
              {p.in_stock ? "Move to bag" : "Out of stock"}
            </button>
          </div>
        ))}
      </div>
      <Modal open={!!picking} onClose={() => setPicking(null)} title="Select size">
        {picking && (
          <div className="flex flex-wrap gap-3">
            {picking.sizes.map((s: string) => (
              <button
                key={s}
                onClick={async () => {
                  if (await addToBag(picking.id, s)) {
                    await toggleWishlist(picking.id);
                    setPicking(null);
                    load();
                  }
                }}
                className="h-12 min-w-12 rounded-full border border-line px-3 text-sm font-bold hover:border-brand-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
