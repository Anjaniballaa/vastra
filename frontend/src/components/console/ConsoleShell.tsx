"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BarChart3, BookOpenCheck, Boxes, ClipboardList, FlaskConical, Image as ImageIcon, IndianRupee, Inbox, LogOut, Menu,
  PackageSearch, ScrollText, Settings, ShieldAlert, Store, Tag, Undo2, Users, UsersRound, X, BellRing,
} from "lucide-react";
import { useAuth, type Role } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { Badge, PageLoader } from "@/components/ui";
import { IncidentAlarm } from "./IncidentAlarm";

type NavItem = { href: string; label: string; icon: React.ReactNode; roles: Role[] };

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Support",
    items: [
      { href: "/console", label: "Inbox", icon: <Inbox size={17} />, roles: ["agent", "lead", "admin"] },
      { href: "/console/incidents", label: "Incidents", icon: <ShieldAlert size={17} />, roles: ["agent", "lead", "ops", "catalog", "admin"] },
      { href: "/console/refunds", label: "Refund approvals", icon: <IndianRupee size={17} />, roles: ["agent", "lead", "admin"] },
      { href: "/console/customers", label: "Customers", icon: <UsersRound size={17} />, roles: ["agent", "lead", "admin"] },
    ],
  },
  {
    section: "Memory & learning",
    items: [
      { href: "/console/playbook", label: "Playbook", icon: <BookOpenCheck size={17} />, roles: ["agent", "lead", "admin"] },
      { href: "/console/memory-lab", label: "Memory lab", icon: <FlaskConical size={17} />, roles: ["agent", "lead", "admin"] },
      { href: "/console/metrics", label: "Learning metrics", icon: <BarChart3 size={17} />, roles: ["agent", "lead", "admin"] },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/ops", label: "Orders", icon: <ClipboardList size={17} />, roles: ["ops", "lead", "admin"] },
      { href: "/ops/returns", label: "Returns", icon: <Undo2 size={17} />, roles: ["ops", "lead", "admin"] },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/catalog", label: "Products & stock", icon: <PackageSearch size={17} />, roles: ["catalog", "admin"] },
      { href: "/catalog/coupons", label: "Coupons", icon: <Tag size={17} />, roles: ["catalog", "admin"] },
      { href: "/catalog/banners", label: "Home banners", icon: <ImageIcon size={17} />, roles: ["catalog", "admin"] },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin", label: "Team & roles", icon: <Users size={17} />, roles: ["admin"] },
      { href: "/admin/settings", label: "Alerting & policies", icon: <Settings size={17} />, roles: ["admin"] },
      { href: "/admin/notifications", label: "Notification log", icon: <BellRing size={17} />, roles: ["admin", "lead"] },
      { href: "/admin/audit", label: "Audit log", icon: <ScrollText size={17} />, roles: ["admin"] },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = { customer: "Customer", agent: "Support agent", lead: "Support lead", ops: "Operations", catalog: "Catalog manager", admin: "Administrator" };

export function ConsoleShell({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const connected = useRealtime(() => {});

  useEffect(() => {
    if (loading) return;
    if (!user || user.role === "customer") router.replace("/staff/login");
  }, [loading, user, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (loading || !user || user.role === "customer") return <PageLoader />;
  const allowed = roles.includes(user.role) || user.role === "admin";

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {NAV.map((sec) => {
        const items = sec.items.filter((i) => i.roles.includes(user.role));
        if (!items.length) return null;
        return (
          <div key={sec.section}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-300">{sec.section}</p>
            {items.map((i) => {
              const activeLink = i.href === pathname || (i.href !== "/console" && i.href !== "/ops" && i.href !== "/catalog" && i.href !== "/admin" && pathname.startsWith(i.href)) || (i.href === "/console" && pathname.startsWith("/console/tickets"));
              return (
                <Link key={i.href} href={i.href} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition", activeLink ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white")}>
                  {i.icon}
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-brand-900 text-white">
      <div className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white font-display text-lg font-bold text-brand-800">V</span>
          <span>
            <span className="block font-display text-base font-bold tracking-[0.18em]">VASTRA</span>
            <span className="block text-[10px] uppercase tracking-widest text-brand-300">Staff console</span>
          </span>
        </Link>
        <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>
      {nav}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-2">
          <span className={clsx("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-amber-400")} title={connected ? "Live" : "Reconnecting"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{user.name}</p>
            <p className="text-[11px] text-brand-300">{ROLE_LABEL[user.role]}</p>
          </div>
          <button
            onClick={() => {
              signOut();
              router.push("/staff/login");
            }}
            className="rounded p-1.5 text-brand-200 hover:bg-white/10"
            aria-label="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
        <Link href="/" className="mt-3 flex items-center gap-2 text-xs text-brand-300 hover:text-white">
          <Store size={13} /> View storefront
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <aside className="hidden lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={22} />
          </button>
          <span className="font-display font-bold tracking-[0.18em]">VASTRA</span>
          <Badge tone="brand" className="ml-auto">{ROLE_LABEL[user.role]}</Badge>
        </div>
        <IncidentAlarm />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {allowed ? (
            children
          ) : (
            <div className="p-10 text-center">
              <Boxes className="mx-auto text-brand-300" size={48} />
              <p className="mt-3 font-bold">This area isn&apos;t part of your role.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line bg-white px-6 py-5">
      <div>
        <h1 className="text-xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
