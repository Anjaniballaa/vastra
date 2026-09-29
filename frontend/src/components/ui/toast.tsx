"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import clsx from "clsx";

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
type ToastApi = { success: (t: string) => void; error: (t: string) => void; info: (t: string) => void };
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 3000);
  }, []);
  const apiValue: ToastApi = {
    success: (t) => push("success", t),
    error: (t) => push("error", t),
    info: (t) => push("info", t),
  };
  return (
    <ToastContext.Provider value={apiValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto flex max-w-md animate-slide-up items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg",
              t.kind === "success" && "bg-ink",
              t.kind === "error" && "bg-red-600",
              t.kind === "info" && "bg-brand-700",
            )}
          >
            {t.kind === "success" ? <CheckCircle2 size={18} /> : t.kind === "error" ? <XCircle size={18} /> : <Info size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return ctx;
}
