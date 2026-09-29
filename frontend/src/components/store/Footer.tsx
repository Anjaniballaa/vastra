import Link from "next/link";
import { BrainCircuit, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-7xl gap-6 border-b border-line px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <Truck size={22} />, t: "Free shipping over ₹799", d: "Ships from Hyderabad in 24 hours" },
          { icon: <RotateCcw size={22} />, t: "14-day returns", d: "Free pickup, refund to source" },
          { icon: <ShieldCheck size={22} />, t: "Secure payments", d: "UPI, cards, netbanking & COD" },
          { icon: <BrainCircuit size={22} />, t: "Support that remembers", d: "Never repeat your story twice" },
        ].map((x) => (
          <div key={x.t} className="flex items-start gap-3">
            <div className="text-brand-600">{x.icon}</div>
            <div>
              <p className="text-sm font-bold">{x.t}</p>
              <p className="text-xs text-muted">{x.d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-muted">
            Fashion from 400+ brands, with a support team — human and AI — that remembers every conversation you&apos;ve had with us.
          </p>
        </div>
        <FooterCol title="Shop" links={[["Men", "/shop?gender=Men"], ["Women", "/shop?gender=Women"], ["Footwear", "/shop?master=Footwear"], ["Beauty", "/shop?master=Beauty"], ["Deals", "/shop?min_discount=60&sort=discount"]]} />
        <FooterCol title="Help" links={[["Help centre", "/help"], ["Track your order", "/orders"], ["Returns & refunds", "/help#returns"], ["Shipping", "/help#shipping"]]} />
        <FooterCol title="Account" links={[["Profile", "/profile"], ["Wishlist", "/wishlist"], ["Bag", "/bag"], ["Staff sign in", "/staff/login"]]} />
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} Vastra · Built for HackWithHyderabad 3.0 · Product data: public Kaggle fashion dataset (CC0)
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-bold uppercase tracking-widest text-ink">{title}</p>
      <ul className="space-y-2">
        {links.map(([l, h]) => (
          <li key={l}>
            <Link href={h} className="text-sm text-muted hover:text-brand-700">
              {l}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
