"use client";

import Link from "next/link";
import { Heart, Star } from "lucide-react";
import clsx from "clsx";
import { img, rupee } from "@/lib/format";
import { useShop } from "@/lib/shop";

export type ProductCardData = {
  id: number;
  name: string;
  brand: string;
  price: number;
  mrp: number;
  discount_pct: number;
  rating: number;
  rating_count: number;
  image: string | null;
  images?: string[];
  in_stock?: boolean;
};

export function ProductCard({ p, compact }: { p: ProductCardData; compact?: boolean }) {
  const { wishlist, toggleWishlist } = useShop();
  const saved = wishlist.has(p.id);
  const second = p.images?.[1];
  return (
    <div className="group relative">
      <Link href={`/product/${p.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-brand-50">
          <img
            src={img(p.image, 480)}
            alt={`${p.brand} ${p.name}`}
            loading="lazy"
            className={clsx("h-full w-full object-cover transition duration-500", second ? "group-hover:opacity-0" : "group-hover:scale-105")}
          />
          {second && (
            <img src={img(second, 480)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100" />
          )}
          {p.rating > 0 && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-white/90 px-1.5 py-0.5 text-[11px] font-bold">
              {p.rating.toFixed(1)} <Star size={10} className="fill-emerald-600 text-emerald-600" />
              <span className="font-medium text-muted">| {p.rating_count >= 1000 ? `${(p.rating_count / 1000).toFixed(1)}k` : p.rating_count}</span>
            </span>
          )}
          {p.in_stock === false && (
            <span className="absolute inset-0 grid place-items-center bg-white/70 text-xs font-bold uppercase tracking-widest text-muted">Out of stock</span>
          )}
        </div>
        <div className={clsx("pt-2", compact ? "px-0.5" : "px-1")}>
          <p className="truncate text-sm font-bold">{p.brand}</p>
          <p className="truncate text-[13px] text-muted">{p.name}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-bold">{rupee(p.price)}</span>
            {p.mrp > p.price && <span className="text-xs text-muted line-through">{rupee(p.mrp)}</span>}
            {p.discount_pct > 0 && <span className="text-xs font-bold text-deal">({p.discount_pct}% OFF)</span>}
          </p>
        </div>
      </Link>
      <button
        onClick={() => toggleWishlist(p.id)}
        aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:scale-110"
      >
        <Heart size={16} className={saved ? "fill-deal text-deal" : "text-ink"} />
      </button>
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[3/4] rounded-md bg-brand-50" />
      <div className="mt-2 h-3 w-2/3 rounded bg-brand-50" />
      <div className="mt-1.5 h-3 w-1/2 rounded bg-brand-50" />
    </div>
  );
}
