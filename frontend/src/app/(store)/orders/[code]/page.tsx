"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Camera, Check, CircleAlert, CreditCard, Headset, MapPin, PartyPopper, RotateCcw, Star, Truck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { date, dateTime, img, rupee } from "@/lib/format";
import { payWithRazorpay } from "@/lib/razorpay";
import { useRealtime } from "@/lib/realtime";
import { Badge, Button, Input, Modal, PageLoader, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { RequireCustomer } from "@/components/store/RequireCustomer";
import { OrderStatus } from "@/components/store/OrderStatus";

const STAGES = [
  ["placed", "Ordered"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
];
const RETURN_REASONS = ["Size too small", "Size too large", "Damaged or defective", "Wrong item delivered", "Quality not as expected", "Colour different from picture", "Changed my mind"];
const CANCEL_REASONS = ["Ordered by mistake", "Found a better price", "Delivery is taking too long", "Want to change size/colour", "Other"];

export default function OrderPage() {
  return (
    <RequireCustomer>
      <Suspense fallback={<PageLoader />}>
        <OrderDetail />
      </Suspense>
    </RequireCustomer>
  );
}

function OrderDetail() {
  const { code } = useParams<{ code: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const [o, setO] = useState<any>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnItem, setReturnItem] = useState<any>(null);
  const [reviewItem, setReviewItem] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(() => api(`/api/orders/${code}`).then(setO), [code]);
  useEffect(() => {
    load().catch(() => router.replace("/orders"));
  }, [load, router]);
  useRealtime((e, d) => e === "order.updated" && d.code === code && load(), [code]);

  if (!o) return <PageLoader />;
  const reached = (s: string) => o.events.find((e: any) => e.status === s);
  const stageIndex = STAGES.reduce((acc, [s], i) => (reached(s) ? i : acc), -1);
  const placedBanner = params.get("placed");

  const retryPay = async () => {
    try {
      const r = await api(`/api/orders/${o.code}/pay`, { method: "POST" });
      const paid = await payWithRazorpay(o.code, r.payment);
      if (paid) toast.success("Payment successful");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {placedBanner && (o.payment_method === "cod" || o.payment_status === "paid") && o.status === "placed" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
          <PartyPopper size={24} />
          <div>
            <p className="font-bold">Order placed! Thank you for shopping with Vastra.</p>
            <p className="text-sm">We&apos;ve sent the confirmation by email and WhatsApp.</p>
          </div>
        </div>
      )}
      {["pending_payment", "payment_failed"].includes(o.status) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CircleAlert size={18} /> {o.status === "payment_failed" ? "Payment wasn't completed, so the order wasn't placed." : "Payment pending — complete it to confirm your order."}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={retryPay}>
              <CreditCard size={14} /> Pay {rupee(o.total)}
            </Button>
            <Link href={`/help?order=${o.code}`}>
              <Button size="sm" variant="outline">Money debited?</Button>
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold">Order {o.code}</h1>
          <p className="text-sm text-muted">Placed on {dateTime(o.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <OrderStatus status={o.status} label={o.status_label} />
          <Link href={`/help?order=${o.code}`}>
            <Button size="sm" variant="secondary">
              <Headset size={14} /> Get help with this order
            </Button>
          </Link>
        </div>
      </div>

      {!["cancelled", "pending_payment", "payment_failed"].includes(o.status) && (
        <div className="mt-6 rounded-xl border border-line p-5">
          <div className="flex items-center justify-between">
            {STAGES.map(([s, label], i) => {
              const ev = reached(s);
              const done = i <= stageIndex;
              return (
                <div key={s} className="relative flex flex-1 flex-col items-center text-center">
                  {i > 0 && <div className={clsx("absolute right-1/2 top-3.5 h-0.5 w-full", i <= stageIndex ? "bg-emerald-500" : "bg-line")} />}
                  <div className={clsx("relative z-10 grid h-7 w-7 place-items-center rounded-full", done ? "bg-emerald-500 text-white" : "bg-line text-muted")}>
                    {done ? <Check size={15} /> : <span className="h-2 w-2 rounded-full bg-white" />}
                  </div>
                  <p className={clsx("mt-2 text-[11px] font-bold sm:text-xs", !done && "text-muted")}>{label}</p>
                  {ev && <p className="hidden text-[10px] text-muted sm:block">{dateTime(ev.at)}</p>}
                </div>
              );
            })}
          </div>
          {o.status === "delivery_failed" && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-100">
              <span className="flex items-center gap-2">
                <XCircle size={16} /> Delivery attempt {o.delivery_attempts} failed: {o.delivery_note || "reason not given"}. We&apos;ll retry soon.
              </span>
              <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>
                <MapPin size={14} /> Add landmark / alternate number
              </Button>
            </div>
          )}
          {o.courier && (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted">
              <Truck size={15} /> {o.courier} · AWB <span className="font-mono font-bold text-ink">{o.awb}</span>
              {o.status !== "delivered" && o.expected_delivery && <> · Expected by {date(o.expected_delivery, { weekday: "short", day: "numeric", month: "short" })}</>}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {o.items.map((i: any) => (
            <div key={i.id} className="flex gap-4 rounded-xl border border-line p-3">
              <Link href={`/product/${i.product_id}`} className="shrink-0">
                <img src={img(i.image, 200)} alt="" className="h-28 w-21 rounded object-cover" />
              </Link>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-bold">{i.brand}</p>
                <p className="truncate text-muted">{i.name}</p>
                <p className="mt-1 text-xs text-muted">
                  Size {i.size} · Qty {i.qty} · {i.price ? rupee(i.price * i.qty) : "Exchange"}
                </p>
                {i.return && (
                  <p className="mt-2">
                    <Badge tone={i.return.status === "completed" ? "green" : i.return.status === "rejected" || i.return.status === "qc_failed" ? "red" : "amber"}>
                      {i.return.kind} {i.return.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="ml-2 text-xs text-muted">{i.return.reason}</span>
                  </p>
                )}
                {i.status === "cancelled" && <Badge className="mt-2" tone="neutral">Cancelled</Badge>}
                {i.status === "delivered" && !i.return && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.return_window_ends && new Date(o.return_window_ends) > new Date() && (
                      <Button size="sm" variant="outline" onClick={() => setReturnItem(i)}>
                        <RotateCcw size={13} /> Return / exchange
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setReviewItem(i)}>
                      <Star size={13} /> Rate & review
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {o.return_window_ends && <p className="text-xs text-muted">Return/exchange window closes on {date(o.return_window_ends)}.</p>}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-line p-4 text-sm">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">Delivery address</p>
            <p className="font-bold">{o.address.name}</p>
            <p className="text-muted">
              {o.address.line1}
              {o.address.line2 ? `, ${o.address.line2}` : ""}, {o.address.city}, {o.address.state} – {o.address.pincode}
            </p>
            {o.address.landmark && <p className="mt-1 text-muted">Landmark: {o.address.landmark}</p>}
            {o.address.alternate_phone && <p className="text-muted">Alt. phone: {o.address.alternate_phone}</p>}
            <p className="mt-1">Phone: {o.address.phone}</p>
            {!["delivered", "cancelled"].includes(o.status) && (
              <button onClick={() => setDetailsOpen(true)} className="mt-2 text-xs font-bold text-brand-700">Update delivery instructions</button>
            )}
          </div>
          <div className="space-y-1.5 rounded-xl border border-line p-4 text-sm">
            <p className="mb-2 text-xs font-extrabold uppercase tracking-wider text-muted">Payment</p>
            <Line l="Items" r={rupee(o.item_total)} />
            {o.coupon_discount > 0 && <Line l={`Coupon ${o.coupon_code}`} r={`−${rupee(o.coupon_discount)}`} />}
            {o.points_used > 0 && <Line l="Points" r={`−${rupee(o.points_used)}`} />}
            <Line l="Shipping" r={o.shipping_fee ? rupee(o.shipping_fee) : "FREE"} />
            <div className="flex justify-between border-t border-line pt-2 font-extrabold">
              <span>Total</span>
              <span>{rupee(o.total)}</span>
            </div>
            <p className="pt-1 text-xs text-muted">
              {o.payment_method === "cod" ? "Cash on delivery" : "Paid online"} · {o.payment_status.replace(/_/g, " ")}
            </p>
            {o.refunds.map((r: any) => (
              <p key={r.id} className="text-xs text-emerald-700">
                Refund {rupee(r.amount)} · {r.status} {r.razorpay_refund_id && `· ${r.razorpay_refund_id}`}
              </p>
            ))}
            {o.points_earned > 0 && <p className="text-xs text-saffron-600">+{o.points_earned} Vastra points earned</p>}
          </div>
          {o.can_cancel && (
            <Button variant="outline" className="w-full" onClick={() => setCancelOpen(true)}>
              Cancel order
            </Button>
          )}
        </aside>
      </div>

      <div className="mt-8 rounded-xl border border-line p-5">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-wider text-muted">Order history</p>
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {[...o.events].reverse().map((e: any, i: number) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-400" />
              <p className="font-semibold">{e.label}</p>
              {e.note && <p className="text-muted">{e.note}</p>}
              <p className="text-xs text-muted">{dateTime(e.at)}</p>
            </li>
          ))}
        </ol>
      </div>

      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} code={o.code} onDone={(x) => { setO(x); toast.success("Order cancelled"); }} />
      <ReturnModal item={returnItem} code={o.code} onClose={() => setReturnItem(null)} onDone={(x) => { setO(x); toast.success("Request submitted"); }} />
      <ReviewModal item={reviewItem} onClose={() => setReviewItem(null)} />
      <DetailsModal open={detailsOpen} onClose={() => setDetailsOpen(false)} code={o.code} onDone={(x) => { setO(x); toast.success("Delivery details updated"); }} />
    </div>
  );
}

function Line({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{l}</span>
      <span>{r}</span>
    </div>
  );
}

function CancelModal({ open, onClose, code, onDone }: { open: boolean; onClose: () => void; code: string; onDone: (o: any) => void }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Modal open={open} onClose={onClose} title="Cancel order">
      <Select label="Why are you cancelling?" value={reason} onChange={(e) => setReason(e.target.value)}>
        {CANCEL_REASONS.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </Select>
      <p className="mt-3 text-xs text-muted">Prepaid amounts are refunded to the original payment method in 5–7 business days.</p>
      <Button
        variant="danger"
        className="mt-4 w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            onDone(await api(`/api/orders/${code}/cancel`, { method: "POST", body: { reason } }));
            onClose();
          } catch (e: any) {
            toast.error(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirm cancellation
      </Button>
    </Modal>
  );
}

function ReturnModal({ item, code, onClose, onDone }: { item: any; code: string; onClose: () => void; onDone: (o: any) => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"refund" | "exchange">("refund");
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [comment, setComment] = useState("");
  const [size, setSize] = useState("");
  const [sizes, setSizes] = useState<any[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setKind("refund");
    setPhoto(null);
    setComment("");
    api(`/api/products/${item.product_id}`).then((p) => setSizes(p.variants.filter((v: any) => v.size !== item.size)));
  }, [item]);

  const needsPhoto = ["Damaged or defective", "Wrong item delivered"].includes(reason);
  return (
    <Modal open={!!item} onClose={onClose} title="Return or exchange">
      {item && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["refund", "exchange"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={clsx("flex-1 rounded-lg border p-3 text-sm font-bold", kind === k ? "border-brand-700 bg-brand-50" : "border-line")}>
                {k === "refund" ? "Return for refund" : "Exchange size"}
              </button>
            ))}
          </div>
          <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {RETURN_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
          {kind === "exchange" && (
            <Select label="New size" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Select size</option>
              {sizes.map((v) => (
                <option key={v.size} value={v.size} disabled={v.stock < item.qty}>
                  {v.size} {v.stock < item.qty ? "(out of stock)" : ""}
                </option>
              ))}
            </Select>
          )}
          <Textarea label="Anything else? (optional)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          <div>
            <p className="mb-1 text-xs font-semibold text-muted">Photo {needsPhoto ? "(required)" : "(optional)"}</p>
            {photo ? (
              <img src={photo} alt="Uploaded" className="h-24 rounded object-cover" />
            ) : (
              <label className="flex h-20 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-muted hover:border-brand-400">
                <Camera size={18} /> {uploading ? "Uploading…" : "Upload a photo"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    const fd = new FormData();
                    fd.append("file", f);
                    try {
                      setPhoto((await api("/api/uploads", { method: "POST", body: fd })).url);
                    } catch (err: any) {
                      toast.error(err.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
              </label>
            )}
          </div>
          <Button
            className="w-full"
            loading={busy}
            disabled={(kind === "exchange" && !size) || (needsPhoto && !photo)}
            onClick={async () => {
              setBusy(true);
              try {
                onDone(await api(`/api/orders/${code}/returns`, { method: "POST", body: { item_id: item.id, kind, reason, comment, exchange_size: size || undefined, photo_url: photo } }));
                onClose();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Submit request
          </Button>
        </div>
      )}
    </Modal>
  );
}

function ReviewModal({ item, onClose }: { item: any; onClose: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [fit, setFit] = useState("");
  return (
    <Modal open={!!item} onClose={onClose} title="Rate this product">
      <div className="space-y-4">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((r) => (
            <button key={r} onClick={() => setRating(r)} aria-label={`${r} stars`}>
              <Star size={30} className={r <= rating ? "fill-saffron-400 text-saffron-400" : "text-line"} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {[["small", "Runs small"], ["true", "True to size"], ["large", "Runs large"]].map(([v, l]) => (
            <button key={v} onClick={() => setFit(v)} className={clsx("rounded-full border px-3 py-1 text-xs font-bold", fit === v ? "border-brand-700 bg-brand-50" : "border-line")}>
              {l}
            </button>
          ))}
        </div>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Review" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button
          className="w-full"
          disabled={!rating}
          onClick={async () => {
            try {
              await api(`/api/products/${item.product_id}/reviews`, { method: "POST", body: { order_item_id: item.id, rating, title, body, fit: fit || undefined } });
              toast.success("Thanks for your review!");
              onClose();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          Submit review
        </Button>
      </div>
    </Modal>
  );
}

function DetailsModal({ open, onClose, code, onDone }: { open: boolean; onClose: () => void; code: string; onDone: (o: any) => void }) {
  const toast = useToast();
  const [landmark, setLandmark] = useState("");
  const [alt, setAlt] = useState("");
  const [ins, setIns] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Help the courier find you">
      <div className="space-y-3">
        <Input label="Landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g. Opposite Ratnadeep supermarket" />
        <Input label="Alternate phone" value={alt} onChange={(e) => setAlt(e.target.value)} inputMode="tel" />
        <Textarea label="Instructions" rows={2} value={ins} onChange={(e) => setIns(e.target.value)} placeholder="e.g. Call before arriving, gate 2" />
        <Button
          className="w-full"
          onClick={async () => {
            try {
              onDone(await api(`/api/orders/${code}/delivery-details`, { method: "POST", body: { landmark, alternate_phone: alt, instructions: ins } }));
              onClose();
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
