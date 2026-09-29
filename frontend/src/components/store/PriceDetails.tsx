import { rupee } from "@/lib/format";

export function PriceDetails({ bag }: { bag: any }) {
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
        Price details ({bag.count} {bag.count === 1 ? "item" : "items"})
      </p>
      <Row l="Total MRP" r={rupee(bag.mrp_total)} />
      {bag.discount_on_mrp > 0 && <Row l="Discount on MRP" r={`−${rupee(bag.discount_on_mrp)}`} green />}
      {bag.coupon_discount > 0 && <Row l={`Coupon (${bag.coupon.code})`} r={`−${rupee(bag.coupon_discount)}`} green />}
      {bag.points_used > 0 && <Row l="Vastra points" r={`−${rupee(bag.points_used)}`} green />}
      <Row l="Shipping" r={bag.shipping_fee ? rupee(bag.shipping_fee) : "FREE"} green={!bag.shipping_fee} />
      <div className="flex justify-between border-t border-line pt-3 text-base font-extrabold">
        <span>Total amount</span>
        <span>{rupee(bag.total)}</span>
      </div>
    </div>
  );
}

function Row({ l, r, green }: { l: string; r: string; green?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{l}</span>
      <span className={green ? "text-emerald-700" : ""}>{r}</span>
    </div>
  );
}
