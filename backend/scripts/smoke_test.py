"""End-to-end smoke test against a running API. Creates temporary *.test accounts and removes everything afterwards.

    python -m scripts.smoke_test --api http://127.0.0.1:8000
"""
import argparse
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Address, AuditLog, CartItem, Incident, IncidentEvent, IncidentSignal, Lesson, Message, Notification, Order,
    OrderEvent, OrderItem, OtpCode, ProductVariant, Refund, ReturnRequest, Review, Ticket, User, WishlistItem,
)
from app.security import hash_secret  # noqa: E402
from app.services import memory  # noqa: E402

RUN = str(int(time.time()))[-6:]


def step(msg):
    print(f"\n=== {msg}")


def login_customer(c: httpx.Client, email: str, name: str, phone: str) -> str:
    r = c.post("/api/auth/otp/request", json={"email": email})
    r.raise_for_status()
    code = r.json().get("dev_code")
    assert code, "dev_code missing (email is configured — run with EMAIL disabled for smoke tests)"
    r = c.post("/api/auth/otp/verify", json={"email": email, "code": code, "name": name, "phone": phone})
    r.raise_for_status()
    return r.json()["token"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    c = httpx.Client(base_url=args.api, timeout=120)
    db = SessionLocal()
    created_users = []

    # temporary staff
    ops = User(email=f"ops.{RUN}@smoketest.example.com", name="Test Ops", role="ops", password_hash=hash_secret("smoke-test-pw"))
    lead = User(email=f"lead.{RUN}@smoketest.example.com", name="Test Lead", role="lead", password_hash=hash_secret("smoke-test-pw"))
    db.add_all([ops, lead])
    db.commit()
    created_users += [ops.id, lead.id]

    try:
        ops_h = {"Authorization": "Bearer " + c.post("/api/auth/staff/login", json={"email": ops.email, "password": "smoke-test-pw"}).json()["token"]}
        lead_h = {"Authorization": "Bearer " + c.post("/api/auth/staff/login", json={"email": lead.email, "password": "smoke-test-pw"}).json()["token"]}
        step("customer signup via OTP")
        tok = login_customer(c, f"cust.{RUN}@smoketest.example.com", "Test Customer", "9000000001")
        h = {"Authorization": f"Bearer {tok}"}
        me = c.get("/api/auth/me", headers=h).json()
        created_users.append(me["id"])
        print("customer", me["id"], me["phone"])

        step("browse + add to bag")
        prods = c.get("/api/products", params={"category": "tshirts", "gender": "Men"}).json()["items"]
        p = next(x for x in prods if "M" in x["sizes"])
        print("product", p["id"], p["brand"], p["name"], p["price"])
        r = c.post("/api/cart", json={"product_id": p["id"], "size": "M", "qty": 1}, headers=h)
        r.raise_for_status()
        print("bag total", r.json()["total"])

        step("address + COD checkout")
        a = c.post("/api/addresses", json={"name": "Test Customer", "phone": "9000000001", "line1": "Flat 4, Test Residency",
                                           "pincode": "500081"}, headers=h).json()
        print("address", a["city"], a["state"])
        r = c.post("/api/checkout", json={"address_id": a["id"], "payment_method": "cod"}, headers=h)
        r.raise_for_status()
        code = r.json()["order_code"]
        print("order", code)

        step("ops: pack -> ship -> out for delivery -> failed")
        for status, extra in [("packed", {}), ("shipped", {"courier": "Delhivery", "awb": f"TEST{RUN}"}),
                              ("out_for_delivery", {}), ("delivery_failed", {"note": "Address not found"})]:
            r = c.post(f"/api/ops/orders/{code}/status", json={"status": status, **extra}, headers=ops_h)
            r.raise_for_status()
            print(" ->", r.json()["status"])

        step("customer chats about the failed delivery (known flow: order_data)")
        t0 = time.time()
        r = c.post("/api/support/chat", json={"message": f"My order {code} says delivery failed?? the courier never even called me",
                                               "order_code": code}, headers=h)
        r.raise_for_status()
        t = r.json()
        print(f"({time.time() - t0:.1f}s) status={t['status']}")
        print("AI:", t["messages"][-1]["body"][:500])

        r = c.post("/api/support/chat", json={"ticket_id": t["id"], "message": "Landmark is opposite Ratnadeep supermarket. Please deliver tomorrow"}, headers=h)
        print("AI:", r.json()["messages"][-1]["body"][:400])

        step("customer 2 reports a brand-new issue -> should route to human + open incident")
        tok2 = login_customer(c, f"cust2.{RUN}@smoketest.example.com", "Test Customer Two", "9000000002")
        h2 = {"Authorization": f"Bearer {tok2}"}
        created_users.append(c.get("/api/auth/me", headers=h2).json()["id"])
        r = c.post("/api/support/chat", json={"message": "The size chart popup on product pages is showing blank white box on my iPhone Safari, cannot see any sizes"}, headers=h2)
        t2 = r.json()
        print("status:", t2["status"], "|", t2["messages"][-1]["body"][:300])
        tk = db.get(Ticket, t2["id"])
        db.refresh(tk)
        print("is_new_issue:", tk.is_new_issue, "incident:", tk.incident_id, "assigned:", tk.assigned_to)

        step("customers 3,4 report the same thing -> severity rises (sev3 at 3 customers)")
        for n in (3, 4):
            tokn = login_customer(c, f"cust{n}.{RUN}@smoketest.example.com", f"Test Customer {n}", f"900000000{n}")
            hn = {"Authorization": f"Bearer {tokn}"}
            created_users.append(c.get("/api/auth/me", headers=hn).json()["id"])
            r = c.post("/api/support/chat", json={"message": "size guide not loading on iphone, it's just an empty white box"}, headers=hn)
            print(f" customer {n}:", r.json()["status"])
        if tk.incident_id:
            inc = c.get(f"/api/staff/incidents/{tk.incident_id}", headers=lead_h).json()
            print("incident", inc["code"], inc["severity"], "customers:", inc["customer_count"])
            for e in inc["events"]:
                print("   ", e["kind"], "-", e["detail"][:120])
            step("lead resolves incident -> customers notified + playbook lesson")
            r = c.post(f"/api/staff/incidents/{tk.incident_id}/resolve",
                       json={"note": "Safari blocked the size-chart iframe; fixed by rendering the chart inline. Customers should refresh the page."},
                       headers=lead_h)
            print("resolved:", r.json()["status"])

        step("staff metrics")
        print(c.get("/api/staff/metrics", headers=lead_h).json()["totals"])
        print("\nSMOKE TEST PASSED")
    finally:
        if args.keep:
            print("keeping test data")
        else:
            cleanup(db, created_users)
        db.close()


def cleanup(db, user_ids):
    step("cleanup")
    time.sleep(3)
    user_ids = sorted(set(user_ids) | {u.id for u in db.query(User).filter(User.email.like("%@smoketest.example.com")).all()})
    tickets = [t.id for t in db.query(Ticket).filter(Ticket.customer_id.in_(user_ids)).all()]
    incident_ids = {s.incident_id for s in db.query(IncidentSignal).filter(IncidentSignal.customer_id.in_(user_ids)).all()}
    orders = [o.id for o in db.query(Order).filter(Order.user_id.in_(user_ids)).all()]
    for oi in db.query(OrderItem).filter(OrderItem.order_id.in_(orders)).all():
        v = db.query(ProductVariant).filter_by(product_id=oi.product_id, size=oi.size).first()
        if v and oi.status not in ("cancelled",):
            v.stock += oi.qty
    db.query(Lesson).filter((Lesson.ticket_id.in_(tickets)) | (Lesson.incident_id.in_(incident_ids))).delete(synchronize_session=False)
    db.query(Refund).filter(Refund.order_id.in_(orders)).delete(synchronize_session=False)
    db.query(Message).filter(Message.ticket_id.in_(tickets)).delete(synchronize_session=False)
    db.query(IncidentSignal).filter(IncidentSignal.incident_id.in_(incident_ids)).delete(synchronize_session=False)
    db.query(IncidentEvent).filter(IncidentEvent.incident_id.in_(incident_ids)).delete(synchronize_session=False)
    db.query(Ticket).filter(Ticket.id.in_(tickets)).delete(synchronize_session=False)
    db.query(Incident).filter(Incident.id.in_(incident_ids)).delete(synchronize_session=False)
    db.query(Review).filter(Review.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(ReturnRequest).filter(ReturnRequest.order_id.in_(orders)).delete(synchronize_session=False)
    db.query(OrderEvent).filter(OrderEvent.order_id.in_(orders)).delete(synchronize_session=False)
    db.query(OrderItem).filter(OrderItem.order_id.in_(orders)).delete(synchronize_session=False)
    db.query(Order).filter(Order.id.in_(orders)).delete(synchronize_session=False)
    for M in (Address, CartItem, WishlistItem):
        db.query(M).filter(M.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(Notification).filter(Notification.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(AuditLog).filter(AuditLog.actor_id.in_(user_ids)).delete(synchronize_session=False)
    emails = [u.email for u in db.query(User).filter(User.id.in_(user_ids)).all()]
    db.query(OtpCode).filter(OtpCode.email.in_(emails)).delete(synchronize_session=False)
    db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    c = memory._client()
    banks = [memory.customer_bank(uid) for uid in user_ids]
    if config.PLAYBOOK_BANK != "vastra-playbook":  # only ever delete an isolated test playbook
        banks.append(config.PLAYBOOK_BANK)
    for b in banks:
        try:
            c.delete_bank(b)
        except Exception:
            pass
    print(f"removed {len(user_ids)} test users, {len(orders)} orders, {len(tickets)} tickets, "
          f"{len(incident_ids)} incidents, {len(banks)} memory banks")


if __name__ == "__main__":
    main()
