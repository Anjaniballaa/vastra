"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Banknote, CreditCard, MapPin, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { date, img } from "@/lib/format";
import { payWithRazorpay } from "@/lib/razorpay";
import { useShop } from "@/lib/shop";
import { Button, PageLoader } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { RequireCustomer } from "@/components/store/RequireCustomer";
import { PriceDetails } from "@/components/store/PriceDetails";
import { AddressForm, type Address } from "@/components/store/AddressForm";

export default function CheckoutPage() {
  return (
    <RequireCustomer>
      <Checkout />
    </RequireCustomer>
  );
}

function Checkout() {
  const router = useRouter();
  const toast = useToast();
  const { refreshBag } = useShop();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<"razorpay" | "cod">("razorpay");
  const [usePoints, setUsePoints] = useState(false);
  const [bag, setBag] = useState<any>(null);
  const [eta, setEta] = useState<any>(null);
  const [placing, setPlacing] = useState(false);
  const [coupon, setCoupon] = useState("");

  useEffect(() => {
    let c = "";
    try {
      c = sessionStorage.getItem("vastra_coupon") || "";
    } catch {}
    setCoupon(c);
    api("/api/addresses").then((r) => {
      setAddresses(r.items);
      if (r.items.length) setAddressId(r.items[0].id);
      else setAdding(true);
    });
  }, []);

  useEffect(() => {
    api("/api/cart", { query: { coupon: coupon || undefined, use_points: usePoints } }).then((b) => {
      if (b.items.length === 0) router.replace("/bag");
      setBag(b);
    });
  }, [coupon, usePoints, router]);

  const selected = addresses?.find((a) => a.id === addressId);
  useEffect(() => {
    if (selected) api(`/api/pincode/${selected.pincode}`).then(setEta).catch(() => setEta(null));
  }, [selected?.pincode]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = async () => {
    if (!addressId) return toast.error("Add a delivery address");
    setPlacing(true);
    try {
      const r = await api("/api/checkout", {
        method: "POST",
        body: { address_id: addressId, payment_method: method, coupon_code: bag.coupon?.valid ? bag.coupon.code : undefined, use_points: usePoints },
      });
      try {
        sessionStorage.removeItem("vastra_coupon");
      } catch {}
      if (r.payment) {
        const paid = await payWithRazorpay(r.order_code, r.payment);
        await refreshBag();
        router.push(`/orders/${r.order_code}${paid ? "?placed=1" : "?payment=pending"}`);
      } else {
        await refreshBag();
        router.push(`/orders/${r.order_code}?placed=1`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!addresses || !bag) return <PageLoader />;
  const codAllowed = eta?.cod_available && bag.total <= 10000;

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-4 flex items-center gap-2 font-extrabold">
            <MapPin size={18} /> Delivery address
          </h2>
          <div className="space-y-3">
            {addresses.map((a) => (
              <label key={a.id} className={clsx("flex cursor-pointer gap-3 rounded-lg border p-4", addressId === a.id ? "border-brand-600 bg-brand-50/50" : "border-line")}>
                <input type="radio" checked={addressId === a.id} onChange={() => setAddressId(a.id)} className="mt-1 accent-brand-700" />
                <div className="text-sm">
                  <p className="font-bold">
                    {a.name} <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-muted">{a.kind}</span>
                  </p>
                  <p className="mt-1 text-muted">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ""}
                    {a.landmark ? ` (near ${a.landmark})` : ""}, {a.city}, {a.state} – {a.pincode}
                  </p>
                  <p className="mt-1">Mobile: {a.phone}</p>
                </div>
              </label>
            ))}
          </div>
          {adding ? (
            <div className="mt-4 rounded-lg border border-line p-4">
              <AddressForm
                onSaved={(a) => {
                  setAddresses((x) => [a, ...(x ?? [])]);
                  setAddressId(a.id);
                  setAdding(false);
                }}
                onCancel={addresses.length ? () => setAdding(false) : undefined}
              />
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="mt-4 flex items-center gap-2 text-sm font-bold text-brand-700">
              <Plus size={16} /> Add new address
            </button>
          )}
          {eta?.deliverable && (
            <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Estimated delivery by <b>{date(eta.eta, { weekday: "long", day: "numeric", month: "short" })}</b>
            </p>
          )}
        </section>

        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-4 font-extrabold">Payment</h2>
          <div className="space-y-3">
            <PayOption active={method === "razorpay"} onClick={() => setMethod("razorpay")} icon={<CreditCard size={18} />} title="UPI, cards, netbanking & wallets" text="Secured by Razorpay" />
            <PayOption
              active={method === "cod"}
              onClick={() => codAllowed && setMethod("cod")}
              disabled={!codAllowed}
              icon={<Banknote size={18} />}
              title="Cash on delivery"
              text={codAllowed ? "Pay when your order arrives" : "Not available for this address or order value"}
            />
          </div>
          {bag.points_available > 0 && (
            <label className="mt-4 flex items-center gap-3 rounded-lg bg-saffron-50 p-3 text-sm ring-1 ring-saffron-100">
              <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} className="accent-brand-700" />
              <Sparkles size={16} className="text-saffron-600" />
              Use {bag.points_redeemable} of your {bag.points_available} Vastra points
            </label>
          )}
        </section>

        <section className="rounded-xl border border-line p-5">
          <h2 className="mb-3 font-extrabold">Items ({bag.count})</h2>
          <div className="flex flex-wrap gap-3">
            {bag.items
              .filter((i: any) => i.available)
              .map((i: any) => (
                <div key={i.id} className="flex items-center gap-2 text-xs">
                  <img src={img(i.product.image, 120)} alt="" className="h-16 w-12 rounded object-cover" />
                  <div>
                    <p className="font-bold">{i.product.brand}</p>
                    <p className="text-muted">
                      Size {i.size} · Qty {i.qty}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-xl border border-line p-4">
          <PriceDetails bag={bag} />
          <Button size="lg" className="mt-5 w-full" onClick={place} loading={placing} disabled={!addressId}>
            {method === "cod" ? "Place order" : "Pay & place order"}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1 text-xs text-muted">
            <ShieldCheck size={13} /> Payments in test mode — use Razorpay test cards/UPI
          </p>
        </div>
      </aside>
    </div>
  );
}

function PayOption({ active, onClick, icon, title, text, disabled }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx("flex w-full items-center gap-3 rounded-lg border p-4 text-left", active ? "border-brand-600 bg-brand-50/50" : "border-line", disabled && "cursor-not-allowed opacity-50")}
    >
      <span className={clsx("grid h-5 w-5 place-items-center rounded-full border-2", active ? "border-brand-700" : "border-line")}>
        {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-700" />}
      </span>
      <span className="text-brand-600">{icon}</span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}
