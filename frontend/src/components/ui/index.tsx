"use client";

import { forwardRef, useEffect } from "react";
import clsx from "clsx";
import { Loader2, X } from "lucide-react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline" | "dark";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-55",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-sm tracking-wide",
        variant === "primary" && "bg-brand-700 text-white hover:bg-brand-800",
        variant === "dark" && "bg-ink text-white hover:bg-black",
        variant === "secondary" && "bg-brand-50 text-brand-800 hover:bg-brand-100",
        variant === "outline" && "border border-line bg-white text-ink hover:border-ink",
        variant === "ghost" && "text-ink hover:bg-brand-50",
        variant === "danger" && "bg-red-600 text-white hover:bg-red-700",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
});

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, className, id, ...rest }, ref) {
  const inputId = id || rest.name;
  return (
    <label className="block" htmlFor={inputId}>
      {label && <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>}
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          "h-11 w-full rounded-md border bg-white px-3 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
          error ? "border-red-400" : "border-line",
          className,
        )}
        {...rest}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
});

export function Textarea({ label, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>}
      <textarea
        className={clsx(
          "w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
          className,
        )}
        {...rest}
      />
    </label>
  );
}

export function Select({ label, className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>}
      <select
        className={clsx(
          "h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 animate-fade-in sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-slide-up sm:rounded-xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-brand-50 hover:text-ink">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "brand" | "green" | "red" | "amber" | "blue" | "dark"; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
        tone === "neutral" && "bg-gray-100 text-gray-700",
        tone === "brand" && "bg-brand-100 text-brand-800",
        tone === "green" && "bg-emerald-100 text-emerald-800",
        tone === "red" && "bg-red-100 text-red-700",
        tone === "amber" && "bg-amber-100 text-amber-800",
        tone === "blue" && "bg-sky-100 text-sky-800",
        tone === "dark" && "bg-ink text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-brand-600", className)} size={22} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-brand-300">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={clsx("rounded-xl border border-line bg-white", className)}>{children}</div>;
}

/** Tiny, safe formatter for AI/agent messages: **bold**, bullet lists, line breaks, links. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string, key: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g);
    return (
      <span key={key}>
        {parts.map((p, i) =>
          p.startsWith("**") && p.endsWith("**") ? (
            <strong key={i}>{p.slice(2, -2)}</strong>
          ) : /^https?:\/\//.test(p) ? (
            <a key={i} href={p} className="underline" target="_blank" rel="noreferrer">
              {p.replace(/^https?:\/\//, "").slice(0, 40)}
            </a>
          ) : (
            p
          ),
        )}
      </span>
    );
  };
  return (
    <div className={clsx("prose-chat", className)}>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), j)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {inline(l, j)}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
