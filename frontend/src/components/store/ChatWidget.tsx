"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, X, Maximize2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SupportChat } from "./SupportChat";

/** Floating Vastra Care chat on every storefront page. Resumes your latest open conversation. */
export function ChatWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !user || user.role !== "customer") return;
    api("/api/support/tickets")
      .then((r) => {
        const active = r.items.find((t: any) => !["resolved", "closed"].includes(t.status));
        setTicketId(active ? active.id : null);
      })
      .catch(() => {});
  }, [open, user]);

  if (pathname.startsWith("/help") || (user && user.role !== "customer")) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-50 flex h-[78vh] flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-2xl animate-slide-up sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[600px] sm:w-[400px] sm:rounded-2xl">
          <div className="flex items-center justify-between bg-brand-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">Vastra Care</p>
              <p className="text-[11px] text-brand-200">AI + human support · remembers your history</p>
            </div>
            <div className="flex items-center gap-1">
              <Link href={ticketId ? `/help?ticket=${ticketId}` : "/help"} onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-white/10" aria-label="Open full screen">
                <Maximize2 size={16} />
              </Link>
              <button onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-white/10" aria-label="Close chat">
                <X size={18} />
              </button>
            </div>
          </div>
          <SupportChat ticketId={ticketId} onTicket={(t) => setTicketId(t.id)} className="flex-1" />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-900/25 transition hover:bg-brand-800 sm:bottom-6 sm:right-6"
        aria-label="Chat with support"
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
        <span className="hidden sm:inline">{open ? "Close" : "Need help?"}</span>
      </button>
    </>
  );
}
