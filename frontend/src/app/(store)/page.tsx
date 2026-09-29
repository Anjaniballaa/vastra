"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BrainCircuit, ChevronLeft, ChevronRight, History, Siren } from "lucide-react";
import { api } from "@/lib/api";
import { img } from "@/lib/format";
import { ProductCard, ProductSkeleton } from "@/components/store/ProductCard";

type Home = {
  hero: { title: string; subtitle: string; image: string; link: string }[];
  categories: { slug: string; name: string; master: string; count: number; max_discount: number; image: string }[];
  brands: { brand: string; count: number; max_discount: number; image: string }[];
  deals: any[];
  trending: any[];
};

export default function HomePage() {
  const [data, setData] = useState<Home | null>(null);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    api<Home>("/api/home").then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    if (!data?.hero.length) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % data.hero.length), 5500);
    return () => clearInterval(t);
  }, [data?.hero.length]);

  return (
    <div>
      {/* hero */}
      <section className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 text-white">
        <div className="relative mx-auto grid max-w-7xl items-center gap-6 px-4 py-10 md:grid-cols-2 md:py-14">
          {data?.hero.length ? (
            data.hero.map((h, i) => (
              <div key={i} className={i === slide ? "contents" : "hidden"}>
                <div className="animate-fade-in">
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-saffron-400">Live deals</p>
                  <h1 className="mt-3 font-display text-4xl font-bold leading-tight md:text-6xl">{h.title}</h1>
                  <p className="mt-3 text-lg text-brand-100">{h.subtitle}</p>
                  <Link href={h.link} className="mt-6 inline-flex h-12 items-center gap-2 rounded-md bg-saffron-500 px-6 text-sm font-bold text-ink hover:bg-saffron-400">
                    Shop now <ArrowRight size={16} />
                  </Link>
                </div>
                <div className="relative mx-auto h-72 w-full max-w-md animate-fade-in md:h-96">
                  <div className="absolute inset-0 rotate-3 rounded-3xl bg-saffron-500/20" />
                  <img src={img(h.image, 700)} alt={h.title} className="relative h-full w-full rounded-3xl object-cover shadow-2xl" />
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 h-80 animate-pulse rounded-3xl bg-white/10" />
          )}
          {data && data.hero.length > 1 && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2">
              <button onClick={() => setSlide((s) => (s - 1 + data.hero.length) % data.hero.length)} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Previous">
                <ChevronLeft size={16} />
              </button>
              {data.hero.map((_, i) => (
                <button key={i} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i === slide ? "w-6 bg-saffron-400" : "w-1.5 bg-white/40"}`} aria-label={`Slide ${i + 1}`} />
              ))}
              <button onClick={() => setSlide((s) => (s + 1) % data.hero.length)} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20" aria-label="Next">
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* categories */}
      <Section title="Shop by category" subtitle={data ? `${data.categories.reduce((a, c) => a + c.count, 0).toLocaleString("en-IN")} styles across ${data.categories.length} categories` : ""}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
          {(data?.categories ?? Array.from({ length: 16 }).map(() => null)).map((c, i) =>
            c ? (
              <Link key={c.slug} href={`/shop?category=${c.slug}`} className="group text-center">
                <div className="aspect-square overflow-hidden rounded-2xl bg-brand-50">
                  <img src={img(c.image, 300)} alt={c.name} loading="lazy" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-110" />
                </div>
                <p className="mt-2 truncate text-xs font-bold sm:text-sm">{c.name}</p>
                <p className="text-[11px] font-semibold text-deal">Up to {c.max_discount}% off</p>
              </Link>
            ) : (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-brand-50" />
            ),
          )}
        </div>
      </Section>

      {/* deals */}
      <Section title="Deals of the day" subtitle="Biggest discounts on well-rated styles" href="/shop?min_discount=60&sort=discount">
        <Row items={data?.deals} />
      </Section>

      {/* memory pitch */}
      <section className="mx-auto mt-12 max-w-7xl px-4">
        <div className="grid gap-6 overflow-hidden rounded-3xl bg-saffron-50 p-6 ring-1 ring-saffron-100 md:grid-cols-[1.2fr_1fr] md:p-10">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-saffron-600">Vastra Care</p>
            <h2 className="mt-2 font-display text-3xl font-bold md:text-4xl">Support that remembers you.</h2>
            <p className="mt-3 max-w-lg text-muted">
              Your sizes, your past returns, the courier who couldn&apos;t find your building — our AI and human team remember it all, so you never repeat your story.
            </p>
            <Link href="/help" className="mt-5 inline-flex h-11 items-center gap-2 rounded-md bg-ink px-5 text-sm font-bold text-white hover:bg-black">
              Talk to Vastra Care <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid gap-3 text-sm">
            {[
              { icon: <History size={18} />, t: "Remembers every conversation", d: "Across chat, email and WhatsApp." },
              { icon: <BrainCircuit size={18} />, t: "Learns from every fix", d: "Solved once means solved faster for everyone." },
              { icon: <Siren size={18} />, t: "Spots problems early", d: "Repeated new issues alert our on-call team instantly." },
            ].map((x) => (
              <div key={x.t} className="flex items-start gap-3 rounded-xl bg-white p-4">
                <span className="text-brand-600">{x.icon}</span>
                <div>
                  <p className="font-bold">{x.t}</p>
                  <p className="text-muted">{x.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* brands */}
      <Section title="Top brands" subtitle="Most loved by shoppers">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(data?.brands ?? Array.from({ length: 6 }).map(() => null)).map((b, i) =>
            b ? (
              <Link key={b.brand} href={`/shop?brand=${encodeURIComponent(b.brand)}`} className="group relative overflow-hidden rounded-2xl">
                <img src={img(b.image, 400)} alt={b.brand} loading="lazy" className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-10 text-white">
                  <p className="truncate font-bold">{b.brand}</p>
                  <p className="text-xs text-saffron-400">Up to {b.max_discount}% off</p>
                </div>
              </Link>
            ) : (
              <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-brand-50" />
            ),
          )}
        </div>
      </Section>

      <Section title="Trending now" subtitle="Most-rated styles on Vastra" href="/shop?sort=popularity">
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {(data?.trending ?? Array.from({ length: 12 }).map(() => null)).map((p, i) => (p ? <ProductCard key={p.id} p={p} /> : <ProductSkeleton key={i} />))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, subtitle, href, children }: { title: string; subtitle?: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-12 max-w-7xl px-4">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold uppercase tracking-wider md:text-2xl">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="flex shrink-0 items-center gap-1 text-sm font-bold text-brand-700 hover:underline">
            View all <ArrowRight size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ items }: { items?: any[] }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
      {(items ?? Array.from({ length: 6 }).map(() => null)).map((p, i) => (
        <div key={p?.id ?? i} className="w-40 shrink-0 snap-start sm:w-48">
          {p ? <ProductCard p={p} compact /> : <ProductSkeleton />}
        </div>
      ))}
    </div>
  );
}
