"""Razorpay (test mode) orders, signature verification and refunds via the REST API."""
import hashlib
import hmac

import httpx

from .. import config

API = "https://api.razorpay.com/v1"


class PaymentError(Exception):
    pass


def _auth():
    return (config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)


def create_order(amount_rupees: float, receipt: str, notes: dict | None = None) -> dict:
    r = httpx.post(f"{API}/orders", auth=_auth(), timeout=20, json={
        "amount": int(round(amount_rupees * 100)), "currency": "INR", "receipt": receipt, "notes": notes or {},
    })
    if r.status_code >= 400:
        raise PaymentError(r.text)
    return r.json()


def verify_signature(rp_order_id: str, rp_payment_id: str, signature: str) -> bool:
    expected = hmac.new(config.RAZORPAY_KEY_SECRET.encode(), f"{rp_order_id}|{rp_payment_id}".encode(),
                        hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature or "")


def fetch_payment(payment_id: str) -> dict:
    r = httpx.get(f"{API}/payments/{payment_id}", auth=_auth(), timeout=20)
    if r.status_code >= 400:
        raise PaymentError(r.text)
    return r.json()


def order_payments(rp_order_id: str) -> list[dict]:
    r = httpx.get(f"{API}/orders/{rp_order_id}/payments", auth=_auth(), timeout=20)
    if r.status_code >= 400:
        raise PaymentError(r.text)
    return r.json().get("items", [])


def refund(payment_id: str, amount_rupees: float, notes: dict | None = None) -> dict:
    r = httpx.post(f"{API}/payments/{payment_id}/refund", auth=_auth(), timeout=20, json={
        "amount": int(round(amount_rupees * 100)), "speed": "normal", "notes": notes or {},
    })
    if r.status_code >= 400:
        raise PaymentError(r.json().get("error", {}).get("description", r.text))
    return r.json()
