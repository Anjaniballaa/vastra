"""Admin-editable runtime settings stored in the database."""
from copy import deepcopy

from sqlalchemy.orm import Session

from ..models import Setting

DEFAULTS: dict[str, dict] = {
    # Severity rules: distinct customers reporting the same new issue within a time window.
    "severity_rules": {
        "sev3": {"customers": 3, "window_minutes": 1440},
        "sev2": {"customers": 5, "window_minutes": 60},
        "sev1": {"customers": 10, "window_minutes": 30},
        "sev1_critical": {"customers": 3, "window_minutes": 15, "categories": ["payment", "security"]},
    },
    # How often un-acknowledged incidents re-alert, and when Sev 1 escalates to the next on-call person.
    "alerting": {
        "sev2_repeat_minutes": 10,
        "sev1_repeat_minutes": 5,
        "sev1_escalate_after_minutes": 5,
    },
    # Ordered list of user ids on call (leads first). Empty = all active leads.
    "oncall": {"user_ids": []},
    "support": {
        "ai_refund_limit": 2000,
        "followup_after_hours": 48,
        "auto_close_waiting_hours": 72,
        "handoff_frustration": 4,
    },
    "policies": {
        "returns": "Most items can be returned or exchanged within 14 days of delivery if unused, unwashed and with tags intact. Innerwear, lingerie, swimwear, beauty and perfume products are not returnable once delivered. Jewellery can be returned only if the seal is intact.",
        "refunds": "Refunds for prepaid orders go back to the original payment method within 5-7 business days of the return passing quality check or the order being cancelled. COD refunds are credited as Vastra points (1 point = ₹1) instantly, or to a bank account on request within 7 business days.",
        "cancellation": "Orders can be cancelled free of charge until they are shipped. After shipping, the customer can refuse delivery or raise a return after delivery.",
        "shipping": "Free shipping on orders above ₹799, otherwise a ₹79 shipping fee. Orders ship from our Hyderabad warehouse. Typical delivery: 2 days within Hyderabad, 3 days within Telangana, 4 days to other southern states, 5-7 days elsewhere in India.",
        "delivery_failed": "If a delivery attempt fails, the courier retries up to 2 more times over the next 3 days. Customers can add a landmark or alternate phone number before the next attempt. After 3 failed attempts the order returns to our warehouse and a full refund is issued.",
        "coupons": "Only one coupon per order. Coupons may have a minimum order value, a maximum discount, a validity date and may exclude items that are already heavily discounted. Coupon terms are shown on the checkout page.",
        "payments": "We accept UPI, cards, net banking and wallets through Razorpay, and Cash on Delivery. If money is debited but the order is not confirmed, the amount is automatically refunded within 5-7 business days; support can verify the payment and issue the refund immediately.",
        "loyalty": "Vastra Insider points: earn 1 point per ₹100 spent when an order is delivered. Redeem points at checkout (1 point = ₹1) for up to 10% of the order value.",
        "damaged_wrong_item": "If an item arrives damaged, defective or different from what was ordered, the customer should raise a return within 48 hours with a photo. We arrange a free pickup and offer a replacement or full refund.",
    },
}


def get_setting(db: Session, key: str) -> dict:
    row = db.get(Setting, key)
    base = deepcopy(DEFAULTS.get(key, {}))
    if row and isinstance(row.value, dict):
        base.update(row.value)
    return base


def set_setting(db: Session, key: str, value: dict) -> dict:
    row = db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
    db.commit()
    return get_setting(db, key)
