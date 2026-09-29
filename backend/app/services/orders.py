"""Order lifecycle, cancellations, returns/exchanges and refunds. Shared by storefront, ops console and AI agent."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .. import config
from ..models import (
    Order, OrderEvent, OrderItem, Product, ProductVariant, Refund, ReturnRequest, User,
)
from ..realtime import hub
from . import memory, notify
from .settings import get_setting

STATUS_LABELS = {
    "pending_payment": "Awaiting payment", "payment_failed": "Payment failed", "placed": "Order placed",
    "packed": "Packed", "shipped": "Shipped", "out_for_delivery": "Out for delivery", "delivered": "Delivered",
    "delivery_failed": "Delivery attempt failed", "cancelled": "Cancelled",
}
TRANSITIONS = {
    "placed": {"packed", "cancelled"},
    "packed": {"shipped", "cancelled"},
    "shipped": {"out_for_delivery", "delivery_failed"},
    "out_for_delivery": {"delivered", "delivery_failed"},
    "delivery_failed": {"out_for_delivery", "cancelled"},
}
CANCELLABLE = {"pending_payment", "placed", "packed"}
NON_RETURNABLE_CATEGORIES = {"lipstick", "perfume-and-body-mist"}
RETURN_WINDOW_DAYS = 14
RETURN_FLOW = {
    "requested": {"approved", "rejected"},
    "approved": {"pickup_scheduled"},
    "pickup_scheduled": {"picked"},
    "picked": {"qc_passed", "qc_failed"},
    "qc_passed": {"completed"},
}


class OrderError(Exception):
    pass


def utcnow():
    return datetime.now(timezone.utc)


def aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def assign_code(order: Order):
    order.code = f"VST{100000 + order.id}"


def add_event(db: Session, order: Order, status: str, note: str | None = None, actor: str = "system"):
    db.add(OrderEvent(order_id=order.id, status=status, note=note, actor=actor))


def delivered_at(order: Order) -> datetime | None:
    for e in order.events:
        if e.status == "delivered":
            return aware(e.created_at)
    return None


def serialize_item(i: OrderItem, ret: ReturnRequest | None = None) -> dict:
    return {
        "id": i.id, "product_id": i.product_id, "name": i.name, "brand": i.brand, "image": i.image,
        "size": i.size, "qty": i.qty, "price": i.price, "mrp": i.mrp, "status": i.status,
        "return": serialize_return(ret) if ret else None,
    }


def serialize_return(r: ReturnRequest) -> dict:
    return {"id": r.id, "kind": r.kind, "reason": r.reason, "comment": r.comment, "status": r.status,
            "exchange_size": r.exchange_size, "photo_url": r.photo_url, "created_at": r.created_at,
            "order_item_id": r.order_item_id}


def serialize_order(db: Session, o: Order, full: bool = True) -> dict:
    returns = {r.order_item_id: r for r in db.query(ReturnRequest).filter_by(order_id=o.id).all()}
    data = {
        "id": o.id, "code": o.code, "status": o.status, "status_label": STATUS_LABELS.get(o.status, o.status),
        "created_at": o.created_at, "total": o.total, "item_total": o.item_total, "mrp_total": o.mrp_total,
        "coupon_code": o.coupon_code, "coupon_discount": o.coupon_discount, "points_used": o.points_used,
        "shipping_fee": o.shipping_fee, "payment_method": o.payment_method, "payment_status": o.payment_status,
        "refunded_amount": o.refunded_amount, "expected_delivery": o.expected_delivery, "courier": o.courier,
        "awb": o.awb, "delivery_attempts": o.delivery_attempts, "delivery_note": o.delivery_note,
        "points_earned": o.points_earned, "address": o.address,
        "items": [serialize_item(i, returns.get(i.id)) for i in o.items],
        "can_cancel": o.status in CANCELLABLE,
    }
    if full:
        data["events"] = [{"status": e.status, "label": STATUS_LABELS.get(e.status, e.status.replace("_", " ").title()),
                           "note": e.note, "actor": e.actor, "at": e.created_at} for e in o.events]
        data["refunds"] = [{"id": r.id, "amount": r.amount, "status": r.status, "reason": r.reason,
                            "created_at": r.created_at, "razorpay_refund_id": r.razorpay_refund_id}
                           for r in db.query(Refund).filter_by(order_id=o.id).order_by(Refund.id).all()]
        d = delivered_at(o)
        data["delivered_at"] = d
        data["return_window_ends"] = (d + timedelta(days=RETURN_WINDOW_DAYS)) if d else None
    return data


def _publish(order: Order, kind: str = "order.updated"):
    payload = {"code": order.code, "status": order.status, "id": order.id}
    hub.to_user(order.user_id, kind, payload)
    hub.to_staff(kind, payload)


def restore_stock(db: Session, order: Order, items: list[OrderItem] | None = None):
    for it in items or order.items:
        v = db.query(ProductVariant).filter_by(product_id=it.product_id, size=it.size).first()
        if v:
            v.stock += it.qty


def _items_text(order: Order) -> str:
    return ", ".join(f"{i.brand} {i.name} (size {i.size})" for i in order.items)


def transition(db: Session, order: Order, new_status: str, actor: User | str, note: str | None = None,
               courier: str | None = None, awb: str | None = None) -> Order:
    allowed = TRANSITIONS.get(order.status, set())
    if new_status not in allowed:
        raise OrderError(f"Can't move an order from '{order.status}' to '{new_status}'")
    actor_label = actor if isinstance(actor, str) else f"{actor.name} ({actor.role})"
    if new_status == "cancelled":
        return cancel_order(db, order, actor_label, note or "Cancelled by operations")
    if new_status == "shipped":
        if not courier or not awb:
            raise OrderError("Courier and AWB number are required to ship")
        order.courier, order.awb = courier, awb
    if new_status == "delivery_failed":
        order.delivery_attempts += 1
        order.delivery_note = note
    order.status = new_status
    add_event(db, order, new_status, note, actor_label)
    customer = db.get(User, order.user_id)

    if new_status == "delivered":
        pts = int(order.total // 100) * config.POINTS_PER_100
        order.points_earned = pts
        customer.loyalty_points += pts
        for i in order.items:
            if i.status == "active":
                i.status = "delivered"
    db.commit()

    link = f"{config.FRONTEND_URL}/orders/{order.code}"
    messages = {
        "packed": ("Your order is packed", f"Good news! Order {order.code} is packed and will ship soon."),
        "shipped": ("Your order has shipped", f"Order {order.code} has shipped with {courier}. Tracking number (AWB): {awb}."),
        "out_for_delivery": ("Out for delivery today", f"Order {order.code} is out for delivery today. Please keep your phone reachable."),
        "delivered": ("Delivered!", f"Order {order.code} was delivered. You earned {order.points_earned} Vastra points. Not happy with something? You can return or exchange within {RETURN_WINDOW_DAYS} days."),
        "delivery_failed": ("Delivery attempt failed", f"We couldn't deliver order {order.code}. Reason: {note or 'not specified'}. We'll try again — you can add a landmark or alternate number from your order page or reply to this message."),
    }
    if new_status in messages:
        subj, text = messages[new_status]
        notify.notify_user(customer, subj, text, cta_label="View order", cta_url=link, related=f"order:{order.code}")

    if new_status == "delivery_failed":
        memory.in_background(memory.retain_customer, customer.id,
                             f"Delivery attempt {order.delivery_attempts} for order {order.code} to "
                             f"{order.address.get('city')} ({order.address.get('pincode')}) failed. Courier note: {note}.",
                             "delivery event", ["delivery"], customer.name)
    elif new_status == "delivered":
        memory.in_background(memory.retain_customer, customer.id,
                             f"Order {order.code} delivered to {order.address.get('city')}: {_items_text(order)}. "
                             f"Took {order.delivery_attempts + 1} attempt(s).", "delivery event", ["delivery"], customer.name)
    _publish(order)
    return order


def refund_order_amount(db: Session, order: Order, amount: float, reason: str, initiated_by: str,
                        ticket_id: int | None = None, return_id: int | None = None, approved_by: int | None = None) -> Refund:
    """Actually move money back (Razorpay refund or Vastra points for COD)."""
    from . import payments

    remaining = round(order.total - order.refunded_amount, 2)
    amount = round(min(amount, remaining), 2)
    if amount <= 0:
        raise OrderError("Nothing left to refund on this order")
    ref = Refund(order_id=order.id, amount=amount, reason=reason, initiated_by=initiated_by, ticket_id=ticket_id,
                 return_id=return_id, approved_by=approved_by, status="processing")
    db.add(ref)
    db.flush()
    customer = db.get(User, order.user_id)
    try:
        if order.payment_method == "razorpay" and order.razorpay_payment_id:
            res = payments.refund(order.razorpay_payment_id, amount, {"order": order.code, "reason": reason[:200]})
            ref.razorpay_refund_id = res.get("id")
            ref.status = "processed"
            dest = "your original payment method within 5-7 business days"
        else:
            customer.loyalty_points += int(round(amount))
            ref.status = "processed"
            dest = f"your Vastra points balance ({int(round(amount))} points) instantly"
    except Exception as e:
        ref.status = "failed"
        ref.error = str(e)
        db.commit()
        raise OrderError(f"Refund failed: {e}")
    order.refunded_amount = round(order.refunded_amount + amount, 2)
    order.payment_status = "refunded" if order.refunded_amount >= order.total - 0.5 else "partially_refunded"
    add_event(db, order, "refund", f"₹{amount:.0f} refunded — {reason}", initiated_by)
    db.commit()
    notify.notify_user(customer, "Refund processed",
                       f"We've refunded ₹{amount:.0f} for order {order.code}. It will reach {dest}. Refund reference: "
                       f"{ref.razorpay_refund_id or ref.id}.", cta_label="View order",
                       cta_url=f"{config.FRONTEND_URL}/orders/{order.code}", related=f"order:{order.code}")
    memory.in_background(memory.retain_customer, customer.id,
                         f"Refund of ₹{amount:.0f} issued for order {order.code}. Reason: {reason}. Initiated by {initiated_by}.",
                         "refund event", ["refund"], customer.name)
    _publish(order)
    return ref


def request_refund(db: Session, order: Order, amount: float, reason: str, initiated_by: str,
                   ticket_id: int | None = None) -> tuple[Refund, bool]:
    """AI/agent refund request: auto-processed within the AI limit, otherwise queued for human approval."""
    limit = float(get_setting(db, "support")["ai_refund_limit"])
    if order.payment_status not in ("paid", "partially_refunded") and order.payment_method != "cod":
        raise OrderError("This order has no captured payment to refund")
    if initiated_by == "ai" and amount > limit:
        ref = Refund(order_id=order.id, amount=round(amount, 2), reason=reason, initiated_by=initiated_by,
                     ticket_id=ticket_id, status="pending_approval")
        db.add(ref)
        db.commit()
        hub.to_staff("refund.pending", {"id": ref.id, "order": order.code, "amount": ref.amount})
        return ref, False
    return refund_order_amount(db, order, amount, reason, initiated_by, ticket_id=ticket_id), True


def cancel_order(db: Session, order: Order, actor_label: str, reason: str) -> Order:
    if order.status not in CANCELLABLE and order.status != "delivery_failed":
        raise OrderError(f"Order is already {STATUS_LABELS.get(order.status, order.status).lower()} and can't be cancelled")
    was_paid = order.payment_status == "paid"
    order.status = "cancelled"
    for i in order.items:
        i.status = "cancelled"
    restore_stock(db, order)
    if order.points_used:
        db.get(User, order.user_id).loyalty_points += order.points_used
    add_event(db, order, "cancelled", reason, actor_label)
    db.commit()
    customer = db.get(User, order.user_id)
    notify.notify_user(customer, "Order cancelled", f"Order {order.code} has been cancelled. Reason: {reason}.",
                       cta_label="View order", cta_url=f"{config.FRONTEND_URL}/orders/{order.code}",
                       related=f"order:{order.code}")
    if was_paid:
        refund_order_amount(db, order, order.total, f"Order cancelled: {reason}", actor_label)
    memory.in_background(memory.retain_customer, customer.id,
                         f"Order {order.code} ({_items_text(order)}) was cancelled by {actor_label}. Reason: {reason}.",
                         "order cancellation", ["order"], customer.name)
    _publish(order)
    return order


def change_item_size(db: Session, order: Order, item: OrderItem, new_size: str, actor_label: str, note: str | None = None):
    """Swap the size of an item on an order that hasn't been packed yet."""
    if order.status != "placed":
        raise OrderError(f"Size can only be changed before the order is packed (it's already {STATUS_LABELS.get(order.status, order.status).lower()})")
    if item.order_id != order.id or item.status != "active":
        raise OrderError("This item can't be changed")
    if new_size == item.size:
        raise OrderError(f"The item is already size {new_size}")
    new_v = db.query(ProductVariant).filter_by(product_id=item.product_id, size=new_size).with_for_update().first()
    if not new_v:
        raise OrderError(f"Size {new_size} doesn't exist for this product")
    if new_v.stock < item.qty:
        raise OrderError(f"Size {new_size} is out of stock")
    old_v = db.query(ProductVariant).filter_by(product_id=item.product_id, size=item.size).first()
    new_v.stock -= item.qty
    if old_v:
        old_v.stock += item.qty
    old = item.size
    item.size = new_size
    add_event(db, order, "size_changed", f"{item.brand} {item.name}: size {old} → {new_size}", actor_label)
    db.commit()
    customer = db.get(User, order.user_id)
    notify.notify_user(customer, "Size updated", f"We've changed {item.brand} {item.name} on order {order.code} from size {old} to {new_size}.",
                       cta_label="View order", cta_url=f"{config.FRONTEND_URL}/orders/{order.code}", related=f"order:{order.code}")
    memory.in_background(memory.retain_customer, customer.id,
                         f"Customer changed {item.brand} {item.name} on order {order.code} from size {old} to size {new_size} "
                         f"before shipping.{' ' + note if note else ''}", "size change", ["fit", "sizes"], customer.name)
    _publish(order)
    return old


def create_return(db: Session, order: Order, item: OrderItem, kind: str, reason: str, comment: str | None,
                  exchange_size: str | None, photo_url: str | None, created_by: str) -> ReturnRequest:
    if item.order_id != order.id:
        raise OrderError("Item doesn't belong to this order")
    if item.status != "delivered":
        raise OrderError("Only delivered items can be returned or exchanged")
    product = db.get(Product, item.product_id)
    if product and product.category in NON_RETURNABLE_CATEGORIES:
        raise OrderError("Beauty and perfume products can't be returned once delivered (hygiene policy)")
    d = delivered_at(order)
    if d and utcnow() > d + timedelta(days=RETURN_WINDOW_DAYS):
        raise OrderError(f"The {RETURN_WINDOW_DAYS}-day return window for this item ended on {(d + timedelta(days=RETURN_WINDOW_DAYS)).date()}")
    if db.query(ReturnRequest).filter_by(order_item_id=item.id).filter(ReturnRequest.status != "rejected").first():
        raise OrderError("A return is already in progress for this item")
    if kind == "exchange":
        if not exchange_size:
            raise OrderError("Pick the size you want in exchange")
        v = db.query(ProductVariant).filter_by(product_id=item.product_id, size=exchange_size).first()
        if not v or v.stock < item.qty:
            raise OrderError(f"Size {exchange_size} is out of stock — you can choose a refund instead")
    r = ReturnRequest(order_id=order.id, order_item_id=item.id, user_id=order.user_id, kind=kind, reason=reason,
                      comment=comment, exchange_size=exchange_size, photo_url=photo_url, created_by=created_by)
    item.status = "return_requested" if kind == "refund" else "exchange_requested"
    db.add(r)
    add_event(db, order, "return_requested",
              f"{'Exchange' if kind == 'exchange' else 'Return'} requested for {item.brand} {item.name} (size {item.size}): {reason}",
              created_by)
    db.commit()
    customer = db.get(User, order.user_id)
    notify.notify_user(customer, f"{'Exchange' if kind == 'exchange' else 'Return'} request received",
                       f"We've received your {kind} request for {item.brand} {item.name} (size {item.size}) from order "
                       f"{order.code}. We'll schedule a free pickup shortly.",
                       cta_label="Track request", cta_url=f"{config.FRONTEND_URL}/orders/{order.code}",
                       related=f"order:{order.code}")
    fit_note = f" Customer wants size {exchange_size} instead." if exchange_size else ""
    memory.in_background(memory.retain_customer, customer.id,
                         f"Customer requested a {kind} of {item.brand} {item.name} ({product.category_name if product else ''}), "
                         f"size {item.size}, from order {order.code}. Reason: {reason}. {comment or ''}{fit_note}",
                         "return request", ["return", "fit"], customer.name)
    hub.to_staff("return.created", {"id": r.id, "order": order.code})
    _publish(order)
    return r


def advance_return(db: Session, r: ReturnRequest, new_status: str, actor: User, note: str | None = None) -> ReturnRequest:
    if new_status not in RETURN_FLOW.get(r.status, set()):
        raise OrderError(f"Can't move a return from '{r.status}' to '{new_status}'")
    order, item = r.order, r.item
    r.status = new_status
    actor_label = f"{actor.name} ({actor.role})"
    add_event(db, order, f"return_{new_status}", note or f"Return {new_status.replace('_', ' ')}", actor_label)
    customer = db.get(User, order.user_id)
    if new_status == "rejected":
        item.status = "delivered"
    if new_status == "qc_failed":
        item.status = "delivered"
        notify.notify_user(customer, "Return quality check failed",
                           f"The returned {item.name} didn't pass our quality check: {note or 'item used or damaged'}. It will be shipped back to you.",
                           related=f"order:{order.code}")
    db.commit()
    if new_status == "pickup_scheduled":
        notify.notify_user(customer, "Pickup scheduled",
                           f"A courier will pick up {item.brand} {item.name} from your address within 1-2 days. Please keep it packed with tags on.",
                           related=f"order:{order.code}")
    if new_status == "completed":
        if r.kind == "refund":
            item.status = "returned"
            share = item.price * item.qty
            if order.item_total > 0 and order.coupon_discount:
                share -= order.coupon_discount * (item.price * item.qty) / order.item_total
            db.commit()
            refund_order_amount(db, order, share, f"Return of {item.name}", actor_label, return_id=r.id)
        else:
            item.status = "exchanged"
            replacement = Order(user_id=order.user_id, status="placed", payment_method=order.payment_method,
                                payment_status="exchange", address=order.address, total=0, item_total=0, mrp_total=0,
                                expected_delivery=utcnow() + timedelta(days=4))
            db.add(replacement)
            db.flush()
            assign_code(replacement)
            replacement.items.append(OrderItem(product_id=item.product_id, name=item.name, brand=item.brand,
                                               image=item.image, size=r.exchange_size, qty=item.qty, price=0, mrp=item.mrp))
            v = db.query(ProductVariant).filter_by(product_id=item.product_id, size=r.exchange_size).first()
            if v:
                v.stock -= item.qty
            add_event(db, replacement, "placed", f"Exchange for order {order.code} (size {item.size} → {r.exchange_size})", actor_label)
            add_event(db, order, "exchange", f"Replacement order {replacement.code} created in size {r.exchange_size}", actor_label)
            db.commit()
            notify.notify_user(customer, "Exchange confirmed",
                               f"Your replacement {item.name} in size {r.exchange_size} is on its way as order {replacement.code}.",
                               cta_label="Track", cta_url=f"{config.FRONTEND_URL}/orders/{replacement.code}",
                               related=f"order:{replacement.code}")
    _publish(order)
    return r
