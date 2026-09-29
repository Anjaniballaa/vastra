import clsx from "clsx";

const TONE: Record<string, string> = {
  pending_payment: "bg-amber-100 text-amber-800",
  payment_failed: "bg-red-100 text-red-700",
  placed: "bg-sky-100 text-sky-800",
  packed: "bg-sky-100 text-sky-800",
  shipped: "bg-brand-100 text-brand-800",
  out_for_delivery: "bg-brand-100 text-brand-800",
  delivered: "bg-emerald-100 text-emerald-800",
  delivery_failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

export function OrderStatus({ status, label }: { status: string; label?: string }) {
  return (
    <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold", TONE[status] || "bg-gray-100 text-gray-700")}>
      {label || status.replace(/_/g, " ")}
    </span>
  );
}
