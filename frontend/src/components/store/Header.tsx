"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart, LogOut, Menu, Package, Search, ShoppingBag, User as UserIcon, LifeBuoy, X, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { STAFF_HOME, useAuth } from "@/lib/auth";
import { img } from "@/lib/format";
import { useShop } from "@/lib/shop";
import { Logo } from "./Logo";

export const NAV = [
  { label: "Men", href: "/shop?gender=Men" },
  { label: "Women", href: "/shop?gender=Women" },
  { label: "Ethnic", href: "/shop?master=Ethnic Wear" },
  { label: "Footwear", href: "/shop?master=Footwear" },
  { label: "Accessories", href: "/shop?master=Accessories" },
  { label: "Beauty", href: "/shop?master=Beauty" },
  { label: "Deals", href: "/shop?min_discount=60&sort=discount", accent: true },
];

function SearchBox({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const t = setTimeout(() => {
      api("/api/search/suggest", { query: { q } })
        .then((r) => setItems(r.suggestions))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    onDone?.();
    router.push(href);
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(`/shop?q=${encodeURIComponent(q.trim())}`);
        }}
        className="flex h-10 items-center gap-2 rounded-md bg-brand-50/70 px-3 ring-brand-200 focus-within:bg-white focus-within:ring-2"
      >
        <Search size={17} className="shrink-0 text-muted" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for brands, products and more"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
          aria-label="Search"
        />
      </form>
      {open && items.length > 0 && (
        <div className="absolute inset-x-0 top-11 z-50 overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          {items.map((s, i) => (
            <button key={i} onClick={() => go(s.href)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50">
              {s.image ? (
                <img src={img(s.image, 80)} alt="" className="h-9 w-7 rounded object-cover" />
              ) : (
                <Search size={15} className="text-muted" />
              )}
              <span className="flex-1 truncate">{s.label}</span>
              <span className="text-[11px] uppercase tracking-wide text-muted">{s.type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { user, signOut } = useAuth();
  const { bagCount, wishlist } = useShop();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const router = useRouter();
  const isStaff = user && user.role !== "customer";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:gap-8">
        <button className="xl:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <Logo className="shrink-0" />
        <nav className="hidden items-center gap-6 xl:flex">
          {NAV.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              className={`border-b-2 border-transparent py-5 text-[13px] font-bold uppercase tracking-wider hover:border-brand-600 ${n.accent ? "text-deal" : "text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden min-w-56 max-w-md flex-1 md:block">
          <SearchBox />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0 sm:gap-3">
          <div className="relative" onMouseLeave={() => setMenu(false)}>
            <button
              onClick={() => (user ? setMenu((m) => !m) : router.push("/login"))}
              onMouseEnter={() => user && setMenu(true)}
              className="flex flex-col items-center px-2 text-[11px] font-bold"
            >
              <UserIcon size={20} />
              <span className="hidden sm:block">{user ? user.name.split(" ")[0] : "Login"}</span>
            </button>
            {menu && user && (
              <div className="absolute right-0 top-full z-50 w-60 pt-2">
                <div className="rounded-lg border border-line bg-white py-2 shadow-xl">
                  <div className="border-b border-line px-4 pb-2">
                    <p className="text-sm font-bold">Hello {user.name.split(" ")[0]}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  {isStaff ? (
                    <MenuLink href={STAFF_HOME[user.role]} icon={<Sparkles size={16} />} label="Open staff console" />
                  ) : (
                    <>
                      <MenuLink href="/orders" icon={<Package size={16} />} label="Orders" />
                      <MenuLink href="/wishlist" icon={<Heart size={16} />} label="Wishlist" />
                      <MenuLink href="/help" icon={<LifeBuoy size={16} />} label="Help & support" />
                      <MenuLink href="/profile" icon={<UserIcon size={16} />} label="Profile & addresses" />
                      <div className="px-4 py-2 text-xs text-muted">
                        <span className="font-bold text-saffron-600">{user.loyalty_points}</span> Vastra points
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => {
                      signOut();
                      setMenu(false);
                      router.push("/");
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-brand-50"
                  >
                    <LogOut size={16} /> Log out
                  </button>
                </div>
              </div>
            )}
          </div>
          <Link href="/wishlist" className="relative flex flex-col items-center px-2 text-[11px] font-bold">
            <Heart size={20} />
            <span className="hidden sm:block">Wishlist</span>
            {wishlist.size > 0 && <Dot n={wishlist.size} />}
          </Link>
          <Link href="/bag" className="relative flex flex-col items-center px-2 text-[11px] font-bold">
            <ShoppingBag size={20} />
            <span className="hidden sm:block">Bag</span>
            {bagCount > 0 && <Dot n={bagCount} />}
          </Link>
        </div>
      </div>
      <div className="px-4 pb-3 md:hidden">
        <SearchBox />
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 bg-black/40 xl:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-72 bg-white p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <Logo />
              <button onClick={() => setDrawer(false)} aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            <nav className="flex flex-col">
              {NAV.map((n) => (
                <Link key={n.label} href={n.href} onClick={() => setDrawer(false)} className="border-b border-line py-3 text-sm font-bold uppercase tracking-wider">
                  {n.label}
                </Link>
              ))}
              <Link href="/help" onClick={() => setDrawer(false)} className="py-3 text-sm font-semibold text-brand-700">
                Help & support
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

function Dot({ n }: { n: number }) {
  return (
    <span className="absolute -right-0.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-deal px-1 text-[10px] font-bold text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-brand-50">
      {icon}
      {label}
    </Link>
  );
}
