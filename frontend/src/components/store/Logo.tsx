import Link from "next/link";
import clsx from "clsx";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <Link href="/" className={clsx("group inline-flex items-center gap-2", className)} aria-label="Vastra home">
      <span
        className={clsx(
          "grid h-8 w-8 place-items-center rounded-lg font-display text-lg font-bold",
          light ? "bg-white text-brand-800" : "bg-brand-700 text-white",
        )}
      >
        V
      </span>
      <span className={clsx("font-display text-xl font-bold tracking-[0.18em]", light ? "text-white" : "text-ink")}>VASTRA</span>
    </Link>
  );
}
