"""Operations console: fulfilment, shipping, delivery outcomes, returns pickup & QC."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Order, ReturnRequest, User
from ..security import require_roles
from ..services import orders as order_svc
from ..services.audit import audit

router = APIRouter(prefix="/api/ops", tags=["ops"])
ops = require_roles("ops", "lead")
COURIERS = ["Delhivery", "Ekart", "Blue Dart", "XpressBees", "Shadowfax", "India Post"]
FAILURE_REASONS = ["Customer not reachable", "Address not found", "Customer unavailable", "Customer refused delivery",
                   "Area not serviceable today", "Payment (COD) not ready", "Other"]


@router.get("/meta")
def meta(user: User = Depends(ops)):
    return {"couriers": COURIERS, "failure_reasons": FAILURE_REASONS, "transitions": {k: sorted(v) for k, v in order_svc.TRANSITIONS.items()},
            "return_flow": {k: sorted(v) for k, v in order_svc.RETURN_FLOW.items()}}


@router.get("/summary")
def summary(user: User = Depends(ops), db: Session = Depends(get_db)):
    counts = dict(db.query(Order.status, func.count(Order.id)).filter(Order.code.isnot(None)).group_by(Order.status).all())
    returns = dict(db.query(ReturnRequest.status, func.count(ReturnRequest.id)).group_by(ReturnRequest.status).all())
    return {"orders": counts, "returns": returns}


@router.get("/orders")
def orders(status: str | None = None, q: str | None = None, user: User = Depends(ops), db: Session = Depends(get_db)):
    query = db.query(Order).filter(Order.code.isnot(None))
    if status:
        query = query.filter(Order.status.in_(status.split(",")))
    if q:
        query = query.filter(Order.code.ilike(f"%{q}%"))
    rows = query.order_by(Order.id.desc()).limit(200).all()
    out = []
    for o in rows:
        d = order_svc.serialize_order(db, o, full=False)
        d["customer"] = {"id": o.user.id, "name": o.user.name, "phone": o.user.phone}
        out.append(d)
    return {"items": out}


@router.get("/orders/{code}")
def order(code: str, user: User = Depends(ops), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper()).first()
    if not o:
        raise HTTPException(404, "Order not found")
    d = order_svc.serialize_order(db, o)
    d["customer"] = {"id": o.user.id, "name": o.user.name, "phone": o.user.phone, "email": o.user.email}
    return d


class StatusIn(BaseModel):
    status: str
    note: str | None = None
    courier: str | None = None
    awb: str | None = None


@router.post("/orders/{code}/status")
def set_status(code: str, body: StatusIn, user: User = Depends(ops), db: Session = Depends(get_db)):
    o = db.query(Order).filter_by(code=code.upper()).first()
    if not o:
        raise HTTPException(404, "Order not found")
    try:
        order_svc.transition(db, o, body.status, user, body.note, body.courier, body.awb)
    except order_svc.OrderError as e:
        raise HTTPException(400, str(e))
    audit(db, user, f"order.{body.status}", o.code, body.note)
    db.commit()
    return order(code, user, db)


@router.get("/returns")
def returns(status: str | None = None, user: User = Depends(ops), db: Session = Depends(get_db)):
    q = db.query(ReturnRequest)
    if status:
        q = q.filter(ReturnRequest.status.in_(status.split(",")))
    rows = q.order_by(ReturnRequest.id.desc()).limit(200).all()
    return {"items": [{**order_svc.serialize_return(r), "order": r.order.code, "customer": r.order.user.name,
                       "item": order_svc.serialize_item(r.item), "address": r.order.address} for r in rows]}


class ReturnStatusIn(BaseModel):
    status: str
    note: str | None = None


@router.post("/returns/{rid}/status")
def return_status(rid: int, body: ReturnStatusIn, user: User = Depends(ops), db: Session = Depends(get_db)):
    r = db.get(ReturnRequest, rid)
    if not r:
        raise HTTPException(404, "Return not found")
    try:
        order_svc.advance_return(db, r, body.status, user, body.note)
    except order_svc.OrderError as e:
        raise HTTPException(400, str(e))
    audit(db, user, f"return.{body.status}", r.order.code, body.note)
    db.commit()
    return order_svc.serialize_return(r)
