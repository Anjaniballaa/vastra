"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import clsx from "clsx";
import { BadgeCheck, Heart, MapPin, Ruler, ShoppingBag, Star, Truck, RotateCcw, Banknote } from "lucide-react";
import { api } from "@/lib/api";
import { date, img, rupee } from "@/lib/format";
import { useShop } from "@/lib/shop";
import { Button, Empty, Modal, PageLoader } from "@/components/ui";
import { ProductCard } from "@/components/store/ProductCard";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToBag, wishlist, toggleWishlist } = useShop();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [chart, setChart] = useState(false);
  const [pin, setPin] = useState("");
  const [eta, setEta] = useState<any>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setP(null);
    setActive(0);
    setSize(null);
    setAdded(false);
    api(`/api/products/${id}`)
      .then((d) => {
        setP(d);
        if (d.variants.length === 1 && d.variants[0].stock > 0) setSize(d.variants[0].size);
      })
      .catch(() => setError(true));
    try {
      const saved = localStorage.getItem("vastra_pin");
      if (saved) setPin(saved);
    } catch {}
  }, [id]);

  const checkPin = async (value = pin) => {
    if (!/^\d{6}$/.test(value)) return;
    try {
      localStorage.setItem("vastra_pin", value);
    } catch {}
    setEta(await api(`/api/pincode/${value}`));
  };
  useEffect(() => {
    if (p && /^\d{6}$/.test(pin) && !eta) checkPin(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  if (error) return <Empty title="Product not found" text="It may have been removed." action={<Link href="/shop"><Button>Continue shopping</Button></Link>} />;
  if (!p) return <PageLoader />;

  const saved = wishlist.has(p.id);
  const stockOf = (s: string) => p.variants.find((v: any) => v.size === s)?.stock ?? 0;
  const add = async () => {
    if (!size) {
      setSizeError(true);
      return;
    }
    setAdding(true);
    const ok = await addToBag(p.id, size);
    setAdding(false);
    if (ok) setAdded(true);
  };
  const fitTotal = Object.values(p.fit_summary || {}).reduce((a: number, b: any) => a + b, 0) as number;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 text-xs text-muted">
        <Link href="/" className="hover:text-ink">Home</Link> / <Link href={`/shop?gender=${p.gender}`} className="hover:text-ink">{p.gender}</Link> /{" "}
        <Link href={`/shop?category=${p.category}`} className="hover:text-ink">{p.category_name}</Link> / <span className="text-ink">{p.brand}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr]">
        {/* gallery */}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <div className="scrollbar-none flex gap-2 overflow-x-auto sm:w-20 sm:flex-col">
            {p.images.map((u: string, i: number) => (
              <button key={u} onClick={() => setActive(i)} className={clsx("shrink-0 overflow-hidden rounded-md border-2", i === active ? "border-brand-600" : "border-transparent")}>
                <img src={img(u, 160)} alt="" className="h-24 w-[72px] object-cover sm:h-24 sm:w-20" />
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden rounded-xl bg-brand-50">
            <img src={img(p.images[active], 900)} alt={`${p.brand} ${p.name}`} className="aspect-[3/4] w-full object-cover" />
          </div>
        </div>

        {/* info */}
        <div>
          <h1 className="text-2xl font-extrabold">{p.brand}</h1>
          <p className="mt-1 text-lg text-muted">{p.title || p.name}</p>
          {p.rating > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded border border-line px-2 py-1 text-sm">
              <b>{p.rating.toFixed(1)}</b> <Star size={14} className="fill-emerald-600 text-emerald-600" />
              <span className="text-muted">| {p.rating_count.toLocaleString("en-IN")} ratings</span>
            </div>
          )}
          <hr className="my-5 border-line" />
          <p className="flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-extrabold">{rupee(p.price)}</span>
            {p.mrp > p.price && (
              <>
                <span className="text-lg text-muted">
                  MRP <s>{rupee(p.mrp)}</s>
                </span>
                <span className="text-lg font-bold text-deal">({p.discount_pct}% OFF)</span>
              </>
            )}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-700">inclusive of all taxes</p>

          {p.size_type !== "onesize" && (
            <div className="mt-6">
              <div className="mb-3 flex items-center gap-4">
                <p className="text-sm font-extrabold uppercase tracking-wider">Select size</p>
                <button onClick={() => setChart(true)} className="flex items-center gap-1 text-sm font-bold text-brand-700">
                  <Ruler size={14} /> Size chart
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {p.variants.map((v: any) => (
                  <button
                    key={v.size}
                    disabled={v.stock === 0}
                    onClick={() => {
                      setSize(v.size);
                      setSizeError(false);
                    }}
                    className={clsx(
                      "relative h-12 min-w-12 rounded-full border px-3 text-sm font-bold transition",
                      size === v.size ? "border-brand-700 bg-brand-700 text-white" : "border-line hover:border-brand-600",
                      v.stock === 0 && "cursor-not-allowed text-muted line-through opacity-50",
                    )}
                  >
                    {v.size.replace("UK", "UK ")}
                    {v.stock > 0 && v.stock <= 5 && (
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-deal">{v.stock} left</span>
                    )}
                  </button>
                ))}
              </div>
              {sizeError && <p className="mt-5 text-sm font-semibold text-red-600">Please select a size</p>}
              {fitTotal > 0 && (
                <p className="mt-6 text-xs text-muted">
                  Fit from verified buyers:{" "}
                  {Object.entries(p.fit_summary).map(([k, v]: any) => `${Math.round((100 * v) / fitTotal)}% say ${k === "true" ? "true to size" : `runs ${k}`}`).join(" · ")}
                </p>
              )}
            </div>
          )}

          <div className="mt-8 flex gap-3">
            {added ? (
              <Button size="lg" className="flex-1" variant="dark" onClick={() => router.push("/bag")}>
                <ShoppingBag size={18} /> Go to bag
              </Button>
            ) : (
              <Button size="lg" className="flex-1" onClick={add} loading={adding} disabled={p.variants.every((v: any) => v.stock === 0)}>
                <ShoppingBag size={18} /> {p.variants.every((v: any) => v.stock === 0) ? "Out of stock" : "Add to bag"}
              </Button>
            )}
            <Button size="lg" variant="outline" className="flex-1 sm:flex-none sm:px-8" onClick={() => toggleWishlist(p.id)}>
              <Heart size={18} className={saved ? "fill-deal text-deal" : ""} /> {saved ? "Wishlisted" : "Wishlist"}
            </Button>
          </div>

          <div className="mt-8">
            <p className="mb-2 flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider">
              Delivery options <Truck size={16} />
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                checkPin();
              }}
              className="flex max-w-xs items-center rounded-md border border-line pr-2 focus-within:border-brand-500"
            >
              <MapPin size={16} className="ml-3 text-muted" />
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter pincode" inputMode="numeric" className="h-10 flex-1 bg-transparent px-2 text-sm outline-none" />
              <button className="text-sm font-bold text-brand-700">Check</button>
            </form>
            {eta && (
              <div className="mt-3 space-y-1.5 text-sm">
                {eta.deliverable ? (
                  <>
                    <p className="flex items-center gap-2">
                      <Truck size={15} className="text-brand-600" /> Get it by <b>{date(eta.eta, { weekday: "short", day: "numeric", month: "short" })}</b>
                      {eta.city || eta.state ? <span className="text-muted">· {[eta.city, eta.state].filter(Boolean).join(", ")}</span> : null}
                    </p>
                    <p className="flex items-center gap-2">
                      <Banknote size={15} className="text-brand-600" /> {eta.cod_available ? "Pay on delivery available" : "Prepaid only for this pincode"}
                    </p>
                    <p className="flex items-center gap-2">
                      <RotateCcw size={15} className="text-brand-600" />
                      {["Beauty"].includes(p.master_category) ? "Not returnable (hygiene)" : "Easy 14-day returns & exchanges"}
                    </p>
                  </>
                ) : (
                  <p className="text-red-600">{eta.message}</p>
                )}
              </div>
            )}
          </div>

          {p.details?.length > 0 && (
            <div className="mt-8">
              <p className="mb-2 text-sm font-extrabold uppercase tracking-wider">Product details</p>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {p.details.map((d: string) => {
                  const [k, v] = d.split(": ");
                  return (
                    <li key={d} className="border-b border-line pb-1">
                      <span className="block text-xs text-muted">{k}</span>
                      {v}
                    </li>
                  );
                })}
                <li className="border-b border-line pb-1">
                  <span className="block text-xs text-muted">Category</span>
                  {p.category_name}
                </li>
                <li className="border-b border-line pb-1">
                  <span className="block text-xs text-muted">Ideal for</span>
                  {p.gender}
                </li>
              </ul>
            </div>
          )}

          <div className="mt-8">
            <p className="mb-3 text-sm font-extrabold uppercase tracking-wider">
              Verified buyer reviews {p.verified_rating && <span className="ml-2 text-emerald-700">{p.verified_rating} ★</span>}
            </p>
            {p.reviews.length === 0 ? (
              <p className="text-sm text-muted">No reviews from Vastra buyers yet. Buy it and be the first to review.</p>
            ) : (
              <div className="space-y-4">
                {p.reviews.map((r: any) => (
                  <div key={r.id} className="border-b border-line pb-3">
                    <p className="flex items-center gap-2 text-sm">
                      <span className="rounded bg-emerald-600 px-1.5 text-xs font-bold text-white">{r.rating} ★</span>
                      <b>{r.title}</b>
                    </p>
                    {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                      <BadgeCheck size={13} className="text-emerald-600" /> {r.author} · {date(r.created_at)}
                      {r.fit && ` · Fit: ${r.fit === "true" ? "true to size" : `runs ${r.fit}`}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {p.similar.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-lg font-extrabold uppercase tracking-wider">Similar products</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
            {p.similar.slice(0, 12).map((x: any) => (
              <ProductCard key={x.id} p={x} />
            ))}
          </div>
        </section>
      )}
      {p.more_from_brand.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-extrabold uppercase tracking-wider">More from {p.brand}</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
            {p.more_from_brand.slice(0, 6).map((x: any) => (
              <ProductCard key={x.id} p={x} />
            ))}
          </div>
        </section>
      )}

      <Modal open={chart} onClose={() => setChart(false)} title={`Size chart · ${p.brand}`}>
        {p.size_chart && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-brand-50 text-left">
                {p.size_chart.columns.map((c: string) => (
                  <th key={c} className="px-3 py-2 font-bold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.size_chart.rows.map((r: string[]) => (
                <tr key={r[0]} className={clsx("border-b border-line", size === r[0] && "bg-saffron-50 font-bold")}>
                  {r.map((c, i) => (
                    <td key={i} className="px-3 py-2">{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-muted">Not sure about your size? Ask Vastra Care — it remembers how past orders fit you.</p>
      </Modal>
    </div>
  );
}
