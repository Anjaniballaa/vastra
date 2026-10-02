"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, SearchX } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { Button, Empty, PageLoader } from "@/components/ui";
import { ProductCard, ProductSkeleton } from "@/components/store/ProductCard";

const SORTS = [
  ["popularity", "Popularity"],
  ["discount", "Better discount"],
  ["price_asc", "Price: low to high"],
  ["price_desc", "Price: high to low"],
  ["rating", "Customer rating"],
];
const PRICE_BANDS = [
  [0, 499],
  [500, 999],
  [1000, 1999],
  [2000, 3999],
  [4000, 100000],
];
const DISCOUNTS = [10, 30, 50, 70];

type Facet = { value: string; count: number; label?: string };

export default function ShopPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Shop />
    </Suspense>
  );
}

function Shop() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandSearch, setBrandSearch] = useState("");
  const key = params.toString();

  useEffect(() => {
    setLoading(true);
    setPage(1);
    const q = Object.fromEntries(params.entries());
    api("/api/products", { query: { ...q, page: 1 } })
      .then((d) => {
        setData(d);
        setItems(d.items);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (loadingMore) return; // a second click while a page is loading would fetch the same page twice
    setLoadingMore(true);
    try {
      const next = page + 1;
      const d = await api("/api/products", { query: { ...Object.fromEntries(params.entries()), page: next } });
      setItems((x) => {
        const seen = new Set(x.map((p) => p.id));
        return [...x, ...d.items.filter((p: any) => !seen.has(p.id))];
      });
      setPage(next);
    } finally {
      setLoadingMore(false);
    }
  };

  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null || v === "") p.delete(k);
    else p.set(k, v);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const toggleMulti = (k: string, v: string, sep = ",") => {
    const cur = (params.get(k) || "").split(sep).filter(Boolean);
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
    set(k, next.join(sep) || null);
  };
  const has = (k: string, v: string, sep = ",") => (params.get(k) || "").split(sep).includes(v);

  const heading = useMemo(() => {
    if (params.get("q")) return `Results for “${params.get("q")}”`;
    const cat = params.get("category");
    const catLabel = cat && data?.facets.category.find((c: Facet) => c.value === cat)?.label;
    return [params.get("gender"), catLabel || params.get("master") || params.get("brand")].filter(Boolean).join(" · ") || "All products";
  }, [params, data]);

  const active: [string, string][] = [];
  for (const k of ["gender", "category", "master", "color", "size"]) (params.get(k) || "").split(",").filter(Boolean).forEach((v) => active.push([k, v]));
  (params.get("brand") || "").split("|").filter(Boolean).forEach((v) => active.push(["brand", v]));
  if (params.get("min_discount")) active.push(["min_discount", `${params.get("min_discount")}%+ off`]);
  if (params.get("max_price")) active.push(["price", `₹${params.get("min_price") || 0}–₹${params.get("max_price")}`]);

  const f = data?.facets;
  const filters = f && (
    <div className="space-y-6">
      <FilterGroup title="Gender">
        {f.gender.map((g: Facet) => (
          <Check key={g.value} label={g.value} count={g.count} checked={has("gender", g.value)} onChange={() => toggleMulti("gender", g.value)} />
        ))}
      </FilterGroup>
      <FilterGroup title="Categories">
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {f.category.map((c: Facet) => (
            <Check key={c.value} label={c.label!} count={c.count} checked={has("category", c.value)} onChange={() => toggleMulti("category", c.value)} />
          ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Brand">
        <input value={brandSearch} onChange={(e) => setBrandSearch(e.target.value)} placeholder="Search brand" className="mb-2 h-8 w-full rounded border border-line px-2 text-xs outline-none focus:border-brand-500" />
        <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {f.brand
            .filter((b: Facet) => b.value.toLowerCase().includes(brandSearch.toLowerCase()))
            .map((b: Facet) => (
              <Check key={b.value} label={b.value} count={b.count} checked={has("brand", b.value, "|")} onChange={() => toggleMulti("brand", b.value, "|")} />
            ))}
        </div>
      </FilterGroup>
      <FilterGroup title="Price">
        {PRICE_BANDS.map(([lo, hi]) => {
          const on = params.get("min_price") === String(lo) && params.get("max_price") === String(hi);
          return (
            <Check
              key={lo}
              radio
              label={hi >= 100000 ? `₹${lo.toLocaleString("en-IN")} +` : `₹${lo} – ₹${hi.toLocaleString("en-IN")}`}
              checked={on}
              onChange={() => {
                const p = new URLSearchParams(params.toString());
                if (on) {
                  p.delete("min_price");
                  p.delete("max_price");
                } else {
                  p.set("min_price", String(lo));
                  p.set("max_price", String(hi));
                }
                router.push(`${pathname}?${p.toString()}`, { scroll: false });
              }}
            />
          );
        })}
      </FilterGroup>
      {f.color.length > 0 && (
        <FilterGroup title="Colour">
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {f.color.map((c: Facet) => (
              <Check key={c.value} label={c.value} count={c.count} checked={has("color", c.value)} onChange={() => toggleMulti("color", c.value)} swatch={c.value} />
            ))}
          </div>
        </FilterGroup>
      )}
      {f.size.length > 1 && (
        <FilterGroup title="Size">
          <div className="flex flex-wrap gap-2">
            {f.size.map((s: Facet) => (
              <button
                key={s.value}
                onClick={() => toggleMulti("size", s.value)}
                className={clsx("rounded-full border px-3 py-1 text-xs font-semibold", has("size", s.value) ? "border-brand-700 bg-brand-700 text-white" : "border-line hover:border-ink")}
              >
                {s.value}
              </button>
            ))}
          </div>
        </FilterGroup>
      )}
      <FilterGroup title="Discount">
        {DISCOUNTS.map((d) => (
          <Check key={d} radio label={`${d}% and above`} checked={params.get("min_discount") === String(d)} onChange={() => set("min_discount", params.get("min_discount") === String(d) ? null : String(d))} />
        ))}
      </FilterGroup>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold">{heading}</h1>
          <p className="text-sm text-muted">{data ? `${data.total.toLocaleString("en-IN")} items` : "Loading…"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={14} /> Filters
          </Button>
          <select value={params.get("sort") || "popularity"} onChange={(e) => set("sort", e.target.value)} className="h-8 rounded-md border border-line bg-white px-2 text-sm font-semibold outline-none" aria-label="Sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                Sort: {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      {active.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {active.map(([k, v]) => (
            <button
              key={k + v}
              onClick={() => {
                if (k === "min_discount") set("min_discount", null);
                else if (k === "price") {
                  const p = new URLSearchParams(params.toString());
                  p.delete("min_price");
                  p.delete("max_price");
                  router.push(`${pathname}?${p.toString()}`);
                } else toggleMulti(k, v, k === "brand" ? "|" : ",");
              }}
              className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-ink"
            >
              {data?.facets.category.find((c: Facet) => c.value === v)?.label || v} <X size={12} />
            </button>
          ))}
          <button onClick={() => router.push(params.get("q") ? `${pathname}?q=${params.get("q")}` : pathname)} className="px-2 text-xs font-bold text-deal">
            Clear all
          </button>
        </div>
      )}
      <div className="flex gap-8">
        <aside className="hidden w-60 shrink-0 lg:block">{filters}</aside>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty icon={<SearchX size={48} />} title="No matches" text="Try removing a filter or searching for something else." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </div>
              {items.length < data.total && (
                <div className="mt-10 text-center">
                  <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                    Show more ({data.total - items.length} left)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setFiltersOpen(false)}>
          <div className="absolute inset-y-0 right-0 w-80 max-w-full overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-bold">Filters</p>
              <button onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                <X size={20} />
              </button>
            </div>
            {filters}
            <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
              Show {data?.total ?? ""} items
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line pb-5">
      <p className="mb-3 text-xs font-extrabold uppercase tracking-widest">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

const SWATCH: Record<string, string> = {
  Black: "#111", White: "#fff", "Off White": "#f5f1e6", Grey: "#9ca3af", Charcoal: "#374151", Blue: "#2563eb", "Navy Blue": "#1e3a8a",
  Red: "#dc2626", Maroon: "#7f1d1d", Burgundy: "#6b1d2f", Green: "#16a34a", "Olive Green": "#4d5d23", Olive: "#556b2f", "Sea Green": "#2e8b57",
  "Mint Green": "#98f5c3", Teal: "#0d9488", Yellow: "#facc15", Mustard: "#d4a017", Orange: "#f97316", Peach: "#ffcba4", Coral: "#ff7f50",
  Pink: "#f472b6", Magenta: "#c026d3", Purple: "#7e22ce", Lavender: "#c4b5fd", Violet: "#8b5cf6", Brown: "#78350f", Tan: "#d2b48c",
  Beige: "#e8dcc4", Cream: "#fffdd0", Khaki: "#c3b091", Gold: "#d4af37", Silver: "#c0c0c0", Rust: "#b7410e", Turquoise: "#40e0d0",
  Nude: "#e3bc9a", Copper: "#b87333", Bronze: "#cd7f32", "Rose Gold": "#b76e79", "Lime Green": "#84cc16",
};

function Check({ label, count, checked, onChange, radio, swatch }: { label: string; count?: number; checked: boolean; onChange: () => void; radio?: boolean; swatch?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm hover:text-brand-700">
      <input type={radio ? "radio" : "checkbox"} checked={checked} onChange={onChange} className="h-4 w-4 accent-brand-700" />
      {swatch && <span className="h-3.5 w-3.5 rounded-full border border-line" style={{ background: SWATCH[swatch] || "linear-gradient(135deg,#f472b6,#60a5fa,#facc15)" }} />}
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="text-xs text-muted">({count})</span>}
    </label>
  );
}
