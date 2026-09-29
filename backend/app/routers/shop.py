from datetime import datetime, timedelta, timezone

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from .. import config
from ..db import get_db
from ..models import (
    Address, CartItem, Coupon, Order, OrderItem, Product, ProductVariant, ReturnRequest, User, WishlistItem,
)
from ..realtime import hub
from ..security import current_user
from ..services import memory, notify, orders as order_svc, payments, pincode
from ..services.audit import audit
from .auth import normalize_phone
from .catalog import card

router = APIRouter(prefix="/api", tags=["shop"])
cloudinary.config(cloud_name=config.CLOUDINARY_CLOUD_NAME, api_key=config.CLOUDINARY_API_KEY,
                  api_secret=config.CLOUDINARY_API_SECRET, secure=True)


def utcnow():
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ wishlist

@router.get("/wishlist")
def wishlist(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(WishlistItem).filter_by(user_id=user.id).order_by(WishlistItem.id.desc()).all()
    prods = {p.id: p for p in db.query(Product).options(selectinload(Product.variants))
             .filter(Product.id.in_([r.product_id for r in rows])).all()}
    return {"items": [card(prods[r.product_id]) for r in rows if r.product_id in prods]}


@router.post("/wishlist/{pid}")
def wishlist_add(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not db.get(Product, pid):
        raise HTTPException(404, "Product not found")
    if not db.query(WishlistItem).filter_by(user_id=user.id, product_id=pid).first():
        db.add(WishlistItem(user_id=user.id, product_id=pid))
        db.commit()
    return {"ok": True}


@router.delete("/wishlist/{pid}")
def wishlist_remove(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(WishlistItem).filter_by(user_id=user.id, product_id=pid).delete()
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ cart

class CartIn(BaseModel):
    product_id: int
    size: str
    qty: int = Field(1, ge=1, le=10)


def cart_summary(db: Session, user: User, coupon_code: str | None = None, use_points: bool = False) -> dict:
    rows = db.query(CartItem).filter_by(user_id=user.id).order_by(CartItem.id).all()
    prods = {p.id: p for p in db.query(Product).options(selectinload(Product.variants))
             .filter(Product.id.in_([r.product_id for r in rows])).all()}
    items, mrp_total, item_total = [], 0.0, 0.0
    for r in rows:
        p = prods.get(r.product_id)
        if not p:
            continue
        stock = next((v.stock for v in p.variants if v.size == r.size), 0)
        items.append({"id": r.id, "product": card(p), "size": r.size, "qty": r.qty, "stock": stock,
                      "available": p.is_active and stock >= r.qty, "sizes": [v.size for v in p.variants]})
        if p.is_active and stock >= r.qty:
            mrp_total += p.mrp * r.qty
            item_total += p.price * r.qty
    coupon = None
    coupon_discount = 0.0
    if coupon_code:
        coupon, coupon_discount, msg = evaluate_coupon(db, user, coupon_code, items)
        coupon = {"code": coupon_code.upper(), "valid": coupon is not None, "discount": coupon_discount, "message": msg}
    shipping = 0 if item_total >= config.FREE_SHIPPING_ABOVE or item_total == 0 else config.SHIPPING_FEE
    subtotal = item_total - coupon_discount + shipping
    max_points = int(min(user.loyalty_points, subtotal * config.MAX_POINTS_REDEEM_PCT / 100))
    points_used = max_points if use_points else 0
    return {"items": items, "count": sum(i["qty"] for i in items), "mrp_total": round(mrp_total),
            "discount_on_mrp": round(mrp_total - item_total), "item_total": round(item_total),
            "coupon": coupon, "coupon_discount": round(coupon_discount), "shipping_fee": shipping,
            "points_available": user.loyalty_points, "points_redeemable": max_points, "points_used": points_used,
            "total": round(subtotal - points_used), "free_shipping_above": config.FREE_SHIPPING_ABOVE}


def evaluate_coupon(db: Session, user: User, code: str, items: list[dict]):
    c = db.query(Coupon).filter(Coupon.code == code.strip().upper()).first()
    if not c or not c.is_active:
        return None, 0, "This coupon code doesn't exist or has ended"
    if c.valid_to and order_svc.aware(c.valid_to) < utcnow():
        return None, 0, f"This coupon expired on {c.valid_to:%d %b %Y}"
    if c.usage_limit and c.used_count >= c.usage_limit:
        return None, 0, "This coupon has reached its usage limit"
    if c.first_order_only and db.query(Order).filter(Order.user_id == user.id,
                                                     Order.status.notin_(("pending_payment", "payment_failed"))).count():
        return None, 0, "This coupon is only for your first order"
    eligible = [i for i in items if i["available"] and
                (c.max_item_discount_pct is None or i["product"]["discount_pct"] <= c.max_item_discount_pct)]
    base = sum(i["product"]["price"] * i["qty"] for i in eligible)
    if not eligible:
        return None, 0, (f"Not applicable: items already discounted more than {c.max_item_discount_pct}% are excluded"
                         if c.max_item_discount_pct is not None else "No eligible items in your bag")
    if base < c.min_order:
        return None, 0, f"Add items worth ₹{c.min_order - base:.0f} more to use this coupon (minimum ₹{c.min_order:.0f} on eligible items)"
    disc = base * c.value / 100 if c.kind == "percent" else c.value
    if c.max_discount:
        disc = min(disc, c.max_discount)
    note = ""
    if len(eligible) < len([i for i in items if i["available"]]):
        note = f" (applied to {len(eligible)} eligible item(s); items discounted above {c.max_item_discount_pct}% excluded)"
    return c, round(min(disc, base)), f"You saved ₹{min(disc, base):.0f}{note}"


@router.get("/cart")
def get_cart(coupon: str | None = None, use_points: bool = False, user: User = Depends(current_user),
             db: Session = Depends(get_db)):
    return cart_summary(db, user, coupon, use_points)


@router.post("/cart")
def add_to_cart(body: CartIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    v = db.query(ProductVariant).filter_by(product_id=body.product_id, size=body.size).first()
    if not v:
        raise HTTPException(400, "Select a valid size")
    row = db.query(CartItem).filter_by(user_id=user.id, product_id=body.product_id, size=body.size).first()
    qty = (row.qty if row else 0) + body.qty
    if qty > v.stock:
        raise HTTPException(400, f"Only {v.stock} left in size {body.size}")
    if row:
        row.qty = min(qty, 10)
    else:
        db.add(CartItem(user_id=user.id, product_id=body.product_id, size=body.size, qty=body.qty))
    db.commit()
    return cart_summary(db, user)


class CartUpdate(BaseModel):
    size: str | None = None
    qty: int | None = Field(None, ge=1, le=10)


@router.patch("/cart/{item_id}")
def update_cart(item_id: int, body: CartUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(CartItem).filter_by(id=item_id, user_id=user.id).first()
    if not row:
        raise HTTPException(404, "Item not in bag")
    if body.size:
        row.size = body.size
    if body.qty:
        row.qty = body.qty
    db.commit()
    return cart_summary(db, user)


@router.delete("/cart/{item_id}")
def remove_cart(item_id: int, to_wishlist: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(CartItem).filter_by(id=item_id, user_id=user.id).first()
    if row:
        if to_wishlist and not db.query(WishlistItem).filter_by(user_id=user.id, product_id=row.product_id).first():
            db.add(WishlistItem(user_id=user.id, product_id=row.product_id))
        db.delete(row)
        db.commit()
    return cart_summary(db, user)


@router.get("/coupons")
def coupons(db: Session = Depends(get_db)):
    rows = db.query(Coupon).filter(Coupon.is_active.is_(True)).order_by(Coupon.id.desc()).all()
    return {"items": [{"code": c.code, "description": c.description, "min_order": c.min_order,
                       "max_discount": c.max_discount, "kind": c.kind, "value": c.value,
                       "valid_to": c.valid_to, "max_item_discount_pct": c.max_item_discount_pct,
                       "first_order_only": c.first_order_only}
                      for c in rows if not (c.valid_to and order_svc.aware(c.valid_to) < utcnow())]}


# ------------------------------------------------------------------ addresses

class AddressIn(BaseModel):
    name: str
    phone: str
    line1: str
    line2: str | None = None
    landmark: str | None = None
    pincode: str
    city: str | None = None
    state: str | None = None
    kind: str = "home"
    is_default: bool = False


def addr_out(a: Address) -> dict:
    return {k: getattr(a, k) for k in ("id", "name", "phone", "line1", "line2", "landmark", "city", "state",
                                       "pincode", "kind", "is_default")}


@router.get("/addresses")
def addresses(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return {"items": [addr_out(a) for a in db.query(Address).filter_by(user_id=user.id)
                      .order_by(Address.is_default.desc(), Address.id.desc()).all()]}


@router.post("/addresses")
def add_address(body: AddressIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    info = pincode.lookup(body.pincode)
    if info is None:
        raise HTTPException(400, "We couldn't find that pincode")
    first = db.query(Address).filter_by(user_id=user.id).count() == 0
    if body.is_default or first:
        db.query(Address).filter_by(user_id=user.id).update({"is_default": False})
    a = Address(user_id=user.id, name=body.name.strip(), phone=normalize_phone(body.phone), line1=body.line1.strip(),
                line2=body.line2, landmark=body.landmark, pincode=body.pincode,
                city=body.city or info.get("city") or "", state=body.state or info.get("state") or "",
                kind=body.kind if body.kind in ("home", "work") else "home", is_default=body.is_default or first)
    db.add(a)
    db.commit()
    return addr_out(a)


@router.put("/addresses/{aid}")
def edit_address(aid: int, body: AddressIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.query(Address).filter_by(id=aid, user_id=user.id).first()
    if not a:
        raise HTTPException(404, "Address not found")
    if body.is_default:
        db.query(Address).filter_by(user_id=user.id).update({"is_default": False})
    for k in ("name", "line1", "line2", "landmark", "pincode", "city", "state", "kind", "is_default"):
        v = getattr(body, k)
        if v is not None:
            setattr(a, k, v)
    a.phone = normalize_phone(body.phone)
    db.commit()
    return addr_out(a)


@router.delete("/addresses/{aid}")
def delete_address(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(Address).filter_by(id=aid, user_id=user.id).delete()
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ checkout & payment

class CheckoutIn(BaseModel):
    address_id: int
    payment_method: str = "razorpay"
    coupon_code: str | None = None
    use_points: bool = False


@router.post("/checkout")
def checkout(body: CheckoutIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.payment_method not in ("razorpay", "cod"):
        raise HTTPException(400, "Choose a payment method")
    addr = db.query(Address).filter_by(id=body.address_id, user_id=user.id).first()
    if not addr:
        raise HTTPException(400, "Select a delivery address")
    summary = cart_summary(db, user, body.coupon_code, body.use_points)
    items = [i for i in summary["items"] if i["available"]]
    if not items:
        raise HTTPException(400, "Your bag is empty or items are out of stock")
    if body.coupon_code and not (summary["coupon"] and summary["coupon"]["valid"]):
        raise HTTPException(400, summary["coupon"]["message"] if summary["coupon"] else "Invalid coupon")
    est = pincode.estimate(addr.pincode)
    if body.payment_method == "cod" and (not est.get("cod_available") or summary["total"] > 10000):
        raise HTTPException(400, "Cash on Delivery isn't available for this order")

    order = Order(user_id=user.id, status="pending_payment" if body.payment_method == "razorpay" else "placed",
                  payment_method=body.payment_method, payment_status="pending",
                  mrp_total=summary["mrp_total"], item_total=summary["item_total"],
                  coupon_code=summary["coupon"]["code"] if summary["coupon"] else None,
                  coupon_discount=summary["coupon_discount"], points_used=summary["points_used"],
                  shipping_fee=summary["shipping_fee"], total=summary["total"],
                  address={k: getattr(addr, k) for k in ("name", "phone", "line1", "line2", "landmark", "city", "state", "pincode")},
                  expected_delivery=utcnow() + timedelta(days=est.get("days", 5)))
    db.add(order)
    db.flush()
    order_svc.assign_code(order)
    for i in items:
        p = i["product"]
        v = db.query(ProductVariant).filter_by(product_id=p["id"], size=i["size"]).with_for_update().first()
        if v.stock < i["qty"]:
            db.rollback()
            raise HTTPException(409, f"{p['brand']} {p['name']} in size {i['size']} just went out of stock")
        v.stock -= i["qty"]
        order.items.append(OrderItem(product_id=p["id"], name=p["name"], brand=p["brand"], image=p["image"],
                                     size=i["size"], qty=i["qty"], price=p["price"], mrp=p["mrp"]))
    if summary["points_used"]:
        user.loyalty_points -= summary["points_used"]
    order_svc.add_event(db, order, order.status, "Order created", user.name)

    if body.payment_method == "razorpay":
        try:
            rp = payments.create_order(order.total, order.code, {"order": order.code, "customer": str(user.id)})
        except payments.PaymentError as e:
            db.rollback()
            raise HTTPException(502, f"Payment gateway error: {e}")
        order.razorpay_order_id = rp["id"]
        db.commit()
        return {"order_code": order.code, "payment": {"key": config.RAZORPAY_KEY_ID, "order_id": rp["id"],
                                                      "amount": rp["amount"], "currency": "INR", "name": "Vastra",
                                                      "prefill": {"name": user.name, "email": user.email, "contact": user.phone}}}
    _finalize_order(db, order, user)
    return {"order_code": order.code, "payment": None}


def _finalize_order(db: Session, order: Order, user: User):
    """Order is confirmed (paid online or COD): clear bag, count coupon use, notify, remember."""
    db.query(CartItem).filter_by(user_id=user.id).delete()
    if order.coupon_code:
        c = db.query(Coupon).filter_by(code=order.coupon_code).first()
        if c:
            c.used_count += 1
    db.commit()
    items = ", ".join(f"{i.brand} {i.name} (size {i.size})" for i in order.items)
    notify.notify_user(user, f"Order confirmed — {order.code}",
                       f"Thanks for shopping with Vastra! Your order {order.code} for ₹{order.total:.0f} is confirmed.\n\n"
                       f"Items: {items}\nExpected delivery by {order.expected_delivery:%a, %d %b}.",
                       cta_label="Track order", cta_url=f"{config.FRONTEND_URL}/orders/{order.code}",
                       related=f"order:{order.code}")
    memory.in_background(memory.retain_customer, user.id,
                         f"{user.name} ordered {items} (order {order.code}, ₹{order.total:.0f}, {order.payment_method}) "
                         f"for delivery to {order.address.get('city')} {order.address.get('pincode')}.",
                         "order placed", ["order", "sizes"], user.name)
    hub.to_staff("order.created", {"code": order.code, "total": order.total})


class PaymentVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/orders/{code}/verify-payment")
def verify_payment(code: str, body: PaymentVerify, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = db.query(Order).filter_by(code=code, user_id=user.id).first()
    if not order or order.razorpay_order_id != body.razorpay_order_id:
        raise HTTPException(404, "Order not found")
    if order.payment_status == "paid":
        return {"ok": True, "order_code": order.code}
    if not payments.verify_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        order_svc.add_event(db, order, "payment_failed", "Payment signature verification failed", "system")
        db.commit()
        raise HTTPException(400, "Payment verification failed")
    order.razorpay_payment_id = body.razorpay_payment_id
    order.payment_status = "paid"
    if order.status in ("pending_payment", "payment_failed"):
        if order.status == "payment_failed":  # stock was released; take it again
            for i in order.items:
                v = db.query(ProductVariant).filter_by(product_id=i.product_id, size=i.size).first()
                if v:
                    v.stock -= i.qty
        order.status = "placed"
    order_svc.add_event(db, order, "placed", f"Payment received (Razorpay {body.razorpay_payment_id})", "system")
    _finalize_order(db, order, user)
    return {"ok": True, "order_code": order.code}


@router.post("/orders/{code}/pay")
def retry_payment(code: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Re-open Razorpay checkout for an order whose payment was abandoned or failed."""
    order = db.query(Order).filter_by(code=code.upper(), user_id=user.id).first()
    if not order or order.payment_method != "razorpay" or order.status not in ("pending_payment", "payment_failed"):
        raise HTTPException(400, "This order doesn't need payment")
    if order.status == "payment_failed":
        for i in order.items:
            v = db.query(ProductVariant).filter_by(product_id=i.product_id, size=i.size).with_for_update().first()
            if not v or v.stock < i.qty:
                raise HTTPException(409, f"{i.brand} {i.name} in size {i.size} is no longer in stock")
        for i in order.items:
            db.query(ProductVariant).filter_by(product_id=i.product_id, size=i.size).first().stock -= i.qty
        order.status, order.payment_status, order.created_at = "pending_payment", "pending", utcnow()
    try:
        rp = payments.create_order(order.total, order.code, {"order": order.code, "retry": "1"})
    except payments.PaymentError as e:
        raise HTTPException(502, f"Payment gateway error: {e}")
    order.razorpay_order_id = rp["id"]
    order_svc.add_event(db, order, "payment_retry", "Customer retried payment", user.name)
    db.commit()
    return {"order_code": order.code, "payment": {"key": config.RAZORPAY_KEY_ID, "order_id": rp["id"], "amount": rp["amount"],
                                                  "currency": "INR", "name": "Vastra",
                                                  "prefill": {"name": user.name, "email": user.email, "contact": user.phone}}}


class PaymentFailure(BaseModel):
    reason: str | None = None


@router.post("/orders/{code}/payment-failed")
def payment_failed(code: str, body: PaymentFailure, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = db.query(Order).filter_by(code=code, user_id=user.id).first()
    if not order or order.payment_status == "paid":
        return {"ok": True}
    order_svc.add_event(db, order, "payment_attempt_failed", body.reason or "Payment attempt failed", "Razorpay")
    db.commit()
    memory.in_background(memory.retain_customer, user.id,
                         f"A payment attempt for order {order.code} (₹{order.total:.0f}) failed: {body.reason or 'unknown reason'}.",
                         "payment failure", ["payment"], user.name)
    return {"ok": True}


# ------------------------------------------------------------------ orders

@router.get("/orders")
def my_orders(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (db.query(Order).filter(Order.user_id == user.id, Order.code.isnot(None))
            .order_by(Order.id.desc()).limit(50).all())
    return {"items": [order_svc.serialize_order(db, o, full=False) for o in rows]}


@router.get("/orders/{code}")
def order_detail(code: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper(), user_id=user.id).first()
    if not o:
        raise HTTPException(404, "Order not found")
    return order_svc.serialize_order(db, o)


class CancelIn(BaseModel):
    reason: str


@router.post("/orders/{code}/cancel")
def cancel(code: str, body: CancelIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper(), user_id=user.id).first()
    if not o:
        raise HTTPException(404, "Order not found")
    try:
        order_svc.cancel_order(db, o, user.name, body.reason)
    except order_svc.OrderError as e:
        raise HTTPException(400, str(e))
    audit(db, user, "order.cancel", o.code, body.reason)
    db.commit()
    return order_svc.serialize_order(db, o)


class DeliveryDetails(BaseModel):
    landmark: str | None = None
    alternate_phone: str | None = None
    instructions: str | None = None


@router.post("/orders/{code}/delivery-details")
def delivery_details(code: str, body: DeliveryDetails, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper(), user_id=user.id).first()
    if not o or o.status in ("delivered", "cancelled"):
        raise HTTPException(400, "This order can't be updated")
    addr = dict(o.address)
    for k in ("landmark", "alternate_phone", "instructions"):
        if getattr(body, k):
            addr[k] = getattr(body, k)
    o.address = addr
    order_svc.add_event(db, o, "address_updated", "Customer updated delivery details", user.name)
    db.commit()
    return order_svc.serialize_order(db, o)


class ReturnIn(BaseModel):
    item_id: int
    kind: str = "refund"
    reason: str
    comment: str | None = None
    exchange_size: str | None = None
    photo_url: str | None = None


@router.post("/orders/{code}/returns")
def create_return(code: str, body: ReturnIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper(), user_id=user.id).first()
    item = db.get(OrderItem, body.item_id)
    if not o or not item:
        raise HTTPException(404, "Order item not found")
    try:
        order_svc.create_return(db, o, item, body.kind if body.kind in ("refund", "exchange") else "refund",
                                body.reason, body.comment, body.exchange_size, body.photo_url, "customer")
    except order_svc.OrderError as e:
        raise HTTPException(400, str(e))
    return order_svc.serialize_order(db, o)


@router.post("/uploads")
def upload(file: UploadFile = File(...), user: User = Depends(current_user)):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/heic"):
        raise HTTPException(400, "Upload a JPG, PNG or WEBP photo")
    data = file.file.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Photo must be under 8 MB")
    res = cloudinary.uploader.upload(data, folder=f"vastra/uploads/{user.id}", resource_type="image")
    return {"url": res["secure_url"]}
