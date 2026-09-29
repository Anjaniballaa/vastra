"""Support console API for agents and leads."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import (
    Incident, Lesson, Message, Order, Refund, ReturnRequest, Ticket, User,
)
from ..realtime import hub
from ..security import require_roles
from ..services import agent, incidents as inc_engine, lessons, memory, notify, orders as order_svc
from ..services.audit import audit
from .auth import user_out

router = APIRouter(prefix="/api/staff", tags=["staff"])
support_staff = require_roles("agent", "lead")
leads = require_roles("lead")


def utcnow():
    return datetime.now(timezone.utc)


def t_row(t: Ticket) -> dict:
    last = next((m for m in reversed(t.messages) if not m.is_draft and not m.is_internal), None)
    return {"id": t.id, "code": t.code, "subject": t.subject, "status": t.status, "priority": t.priority,
            "channel": t.channel, "category": t.category, "customer": {"id": t.customer.id, "name": t.customer.name},
            "assignee": t.assignee.name if t.assignee else None, "assigned_to": t.assigned_to,
            "is_new_issue": t.is_new_issue, "incident_id": t.incident_id, "frustration": t.frustration,
            "matched_memory": t.matched_memory, "ai_turns": t.ai_turns, "human_turns": t.human_turns,
            "created_at": t.created_at, "updated_at": t.updated_at, "handoff_reason": t.handoff_reason,
            "last_message": {"sender": last.sender, "body": last.body[:160], "at": last.created_at} if last else None}


@router.get("/overview")
def overview(user: User = Depends(support_staff), db: Session = Depends(get_db)):
    by_status = dict(db.query(Ticket.status, func.count(Ticket.id)).group_by(Ticket.status).all())
    open_inc = db.query(Incident).filter(Incident.status != "resolved").all()
    today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "tickets": by_status,
        "my_open": db.query(Ticket).filter(Ticket.assigned_to == user.id,
                                           Ticket.status.in_(("needs_human", "human_active"))).count(),
        "incidents": {s: len([i for i in open_inc if i.severity == s]) for s in ("sev1", "sev2", "sev3", "new")},
        "unacked_incidents": [inc_engine.serialize(db, i) for i in open_inc if i.status == "open" and i.severity != "new"],
        "pending_refunds": db.query(Refund).filter_by(status="pending_approval").count(),
        "today": {
            "tickets": db.query(Ticket).filter(Ticket.created_at >= today).count(),
            "resolved_ai": db.query(Ticket).filter(Ticket.resolved_at >= today, Ticket.resolved_by == "ai").count(),
            "resolved_human": db.query(Ticket).filter(Ticket.resolved_at >= today, Ticket.resolved_by == "human").count(),
            "lessons": db.query(Lesson).filter(Lesson.created_at >= today).count(),
        },
    }


@router.get("/tickets")
def tickets(status: str | None = None, q: str | None = None, mine: bool = False, new_issue: bool = False,
            user: User = Depends(support_staff), db: Session = Depends(get_db)):
    query = db.query(Ticket)
    if status == "open":
        query = query.filter(Ticket.status.in_(("ai_active", "needs_human", "human_active", "waiting_customer")))
    elif status:
        query = query.filter(Ticket.status.in_(status.split(",")))
    if mine:
        query = query.filter(Ticket.assigned_to == user.id)
    if new_issue:
        query = query.filter(Ticket.is_new_issue.is_(True))
    if q:
        like = f"%{q}%"
        query = query.join(User, Ticket.customer_id == User.id).filter(
            or_(Ticket.code.ilike(like), Ticket.subject.ilike(like), User.name.ilike(like), User.email.ilike(like)))
    rows = query.order_by(Ticket.updated_at.desc()).limit(150).all()
    return {"items": [t_row(t) for t in rows]}


@router.get("/tickets/{tid}")
def ticket_detail(tid: int, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Ticket not found")
    c = t.customer
    orders = (db.query(Order).filter(Order.user_id == c.id, Order.code.isnot(None)).order_by(Order.id.desc()).limit(8).all())
    d = t_row(t)
    d.update({
        "messages": [{"id": m.id, "sender": m.sender, "body": m.body, "at": m.created_at, "channel": m.channel,
                      "is_draft": m.is_draft, "is_internal": m.is_internal, "meta": m.meta or {},
                      "author": m.author.name if m.author else None} for m in t.messages],
        "customer": {**user_out(c), "orders_count": db.query(Order).filter(Order.user_id == c.id, Order.code.isnot(None)).count(),
                     "tickets_count": db.query(Ticket).filter_by(customer_id=c.id).count(),
                     "lifetime_value": db.query(func.coalesce(func.sum(Order.total), 0)).filter(
                         Order.user_id == c.id, Order.payment_status.in_(("paid", "partially_refunded"))).scalar()},
        "orders": [order_svc.serialize_order(db, o, full=False) for o in orders],
        "incident": inc_engine.serialize(db, db.get(Incident, t.incident_id)) if t.incident_id else None,
        "refunds": [{"id": r.id, "amount": r.amount, "status": r.status, "reason": r.reason, "order": r.order.code}
                    for r in db.query(Refund).filter_by(ticket_id=t.id).all()],
        "resolution_note": t.resolution_note, "csat": t.csat,
    })
    return d


@router.get("/customers/{cid}/memory")
def customer_memory(cid: int, q: str | None = None, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    c = db.get(User, cid)
    if not c:
        raise HTTPException(404, "Customer not found")
    summary = memory.reflect_customer(
        cid, f"Brief a support agent about {c.name} in 4-6 bullet points: sizes/fit, past issues and how they were "
             f"resolved, delivery quirks, preferences, and mood. Only include facts you actually know.")
    return {"summary": summary, "recalled": memory.recall_customer(cid, q) if q else [],
            "memories": memory.list_memories(memory.customer_bank(cid), limit=60)}


@router.post("/tickets/{tid}/draft")
def make_draft(tid: int, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Ticket not found")
    d = agent.draft_for_agent(db, t)
    if not d:
        raise HTTPException(503, "AI is unavailable right now")
    return {"id": d.id, "body": d.body, "meta": d.meta}


class ReplyIn(BaseModel):
    body: str = Field(min_length=1, max_length=6000)
    internal: bool = False
    from_draft: str | None = None


@router.post("/tickets/{tid}/reply")
def reply(tid: int, body: ReplyIn, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    if not t:
        raise HTTPException(404, "Ticket not found")
    db.add(Message(ticket_id=t.id, sender="agent", author_id=user.id, body=body.body, channel=t.channel,
                   is_internal=body.internal))
    if not body.internal:
        t.human_turns += 1
        t.assigned_to = t.assigned_to or user.id
        t.status = "waiting_customer"
        t.first_response_at = t.first_response_at or utcnow()
        for d in [m for m in t.messages if m.is_draft]:
            db.delete(d)
    db.commit()
    if not body.internal:
        hub.to_user(t.customer_id, "ticket.message", {"ticket_id": t.id})
        subject = f"Re: {t.subject[:80]} [{t.code}]"
        if t.channel == "whatsapp":
            notify.send_whatsapp(t.customer.phone, f"{body.body}\n— {user.name.split()[0]}, Vastra Care",
                                 user_id=t.customer_id, related=f"ticket:{t.code}")
        else:
            notify.send_email(t.customer.email, subject, f"{body.body}\n\n— {user.name.split()[0]}, Vastra Care",
                              title=f"Reply from Vastra Care ({t.code})", cta_label="View conversation",
                              cta_url=f"{config.FRONTEND_URL}/help?ticket={t.id}", user_id=t.customer_id,
                              related=f"ticket:{t.code}")
        memory.in_background(memory.retain_customer, t.customer_id,
                             f"Human agent {user.name} replied on ticket {t.code}: \"{body.body}\"",
                             "support agent reply", ["support"], t.customer.name)
        if body.from_draft:
            lessons.record_correction_async(t.id, body.from_draft, body.body, user.name)
    hub.to_staff("ticket.updated", {"id": t.id})
    return {"ok": True}


@router.post("/tickets/{tid}/claim")
def claim(tid: int, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    t.assigned_to = user.id
    if t.status in ("ai_active", "needs_human"):
        t.status = "human_active"
    db.commit()
    hub.to_staff("ticket.updated", {"id": t.id})
    return {"ok": True}


class ResolveIn(BaseModel):
    note: str = Field(min_length=3)


@router.post("/tickets/{tid}/resolve")
def resolve_ticket(tid: int, body: ResolveIn, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    t.resolved_by = "human" if t.human_turns or t.status != "ai_active" else "ai"
    t.status = "resolved"
    t.resolution_note = body.note
    t.resolved_at = utcnow()
    audit(db, user, "ticket.resolve", t.code, body.note)
    db.commit()
    lessons.write_lesson_async(t.id)
    hub.to_staff("ticket.updated", {"id": t.id})
    hub.to_user(t.customer_id, "ticket.message", {"ticket_id": t.id})
    return {"ok": True}


@router.post("/tickets/{tid}/handback")
def handback(tid: int, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    t = db.get(Ticket, tid)
    t.status = "ai_active"
    db.add(Message(ticket_id=t.id, sender="system", body=f"{user.name} handed this conversation back to Vastra Care AI.",
                   is_internal=True))
    db.commit()
    hub.to_staff("ticket.updated", {"id": t.id})
    return {"ok": True}


# ------------------------------------------------------------------ refunds needing approval

@router.get("/refunds")
def refunds(status: str = "pending_approval", user: User = Depends(support_staff), db: Session = Depends(get_db)):
    rows = db.query(Refund).filter_by(status=status).order_by(Refund.id.desc()).limit(100).all()
    return {"items": [{"id": r.id, "order": r.order.code, "amount": r.amount, "reason": r.reason, "status": r.status,
                       "initiated_by": r.initiated_by, "ticket_id": r.ticket_id, "created_at": r.created_at,
                       "customer": r.order.user.name, "order_total": r.order.total} for r in rows]}


@router.post("/refunds/{rid}/{action}")
def refund_action(rid: int, action: str, user: User = Depends(leads), db: Session = Depends(get_db)):
    r = db.get(Refund, rid)
    if not r or r.status != "pending_approval":
        raise HTTPException(400, "Refund isn't awaiting approval")
    if action == "approve":
        order = r.order
        db.delete(r)
        db.commit()
        try:
            ref = order_svc.refund_order_amount(db, order, r.amount, r.reason, f"{user.name} (approved)",
                                                ticket_id=r.ticket_id, approved_by=user.id)
        except order_svc.OrderError as e:
            raise HTTPException(400, str(e))
        audit(db, user, "refund.approve", order.code, f"₹{ref.amount}")
    elif action == "reject":
        r.status = "rejected"
        r.approved_by = user.id
        audit(db, user, "refund.reject", r.order.code, f"₹{r.amount}")
    else:
        raise HTTPException(400, "Unknown action")
    db.commit()
    hub.to_staff("refund.updated", {"id": rid})
    return {"ok": True}


# ------------------------------------------------------------------ incidents

@router.get("/incidents")
def incidents(status: str | None = None, user: User = Depends(require_roles("agent", "lead", "ops", "catalog")),
              db: Session = Depends(get_db)):
    q = db.query(Incident)
    if status == "active":
        q = q.filter(Incident.status != "resolved")
    elif status:
        q = q.filter(Incident.status == status)
    rows = q.order_by(Incident.status == "resolved", Incident.last_seen.desc()).limit(100).all()
    return {"items": [inc_engine.serialize(db, i) for i in rows]}


@router.get("/severity-rules")
def severity_rules(user: User = Depends(require_roles("agent", "lead", "ops", "catalog")), db: Session = Depends(get_db)):
    from ..services.settings import get_setting
    return {"rules": get_setting(db, "severity_rules"), "alerting": get_setting(db, "alerting")}


@router.get("/incidents/{iid}")
def incident(iid: int, user: User = Depends(require_roles("agent", "lead", "ops", "catalog")), db: Session = Depends(get_db)):
    i = db.get(Incident, iid)
    if not i:
        raise HTTPException(404, "Incident not found")
    return inc_engine.serialize(db, i, full=True)


@router.post("/incidents/{iid}/ack")
def ack(iid: int, user: User = Depends(require_roles("agent", "lead", "ops")), db: Session = Depends(get_db)):
    i = db.get(Incident, iid)
    inc_engine.acknowledge(db, i, user)
    return inc_engine.serialize(db, i, full=True)


class IncidentResolve(BaseModel):
    note: str = Field(min_length=5)
    customer_message: str | None = None


@router.post("/incidents/{iid}/resolve")
def resolve_incident(iid: int, body: IncidentResolve, user: User = Depends(require_roles("lead", "ops")),
                     db: Session = Depends(get_db)):
    i = db.get(Incident, iid)
    inc_engine.resolve(db, i, user, body.note, body.customer_message)
    audit(db, user, "incident.resolve", i.code, body.note)
    db.commit()
    return inc_engine.serialize(db, i, full=True)


class IncidentPatch(BaseModel):
    severity: str | None = None
    title: str | None = None
    note: str | None = None


@router.patch("/incidents/{iid}")
def patch_incident(iid: int, body: IncidentPatch, user: User = Depends(leads), db: Session = Depends(get_db)):
    i = db.get(Incident, iid)
    if body.severity and body.severity in inc_engine.SEV_LABEL and body.severity != i.severity:
        inc_engine._event(db, i, "severity_manual", f"{user.name} changed severity {i.severity} → {body.severity}", user.id)
        up = inc_engine.SEVERITY_ORDER[body.severity] > inc_engine.SEVERITY_ORDER[i.severity]
        i.severity = body.severity
        if up:
            db.flush()
            inc_engine.send_alerts(db, i, f"Manually raised by {user.name}")
    if body.title:
        i.title = body.title
    if body.note:
        inc_engine._event(db, i, "note", body.note, user.id)
    db.commit()
    hub.to_staff("incident.updated", inc_engine.serialize(db, i))
    return inc_engine.serialize(db, i, full=True)


@router.post("/incidents/{iid}/escalate")
def escalate_incident(iid: int, user: User = Depends(require_roles("agent", "lead")), db: Session = Depends(get_db)):
    i = db.get(Incident, iid)
    inc_engine.escalate(db, i, f"Manually escalated by {user.name}", user)
    return inc_engine.serialize(db, i, full=True)


# ------------------------------------------------------------------ memory & learning

@router.get("/playbook")
def playbook(user: User = Depends(support_staff), db: Session = Depends(get_db)):
    rows = db.query(Lesson).order_by(Lesson.id.desc()).limit(100).all()
    return {
        "known_issues": memory.known_issues_model(),
        "lessons": [{"id": l.id, "kind": l.kind, "category": l.category, "symptom": l.symptom, "cause": l.cause,
                     "fix": l.fix, "faster_path": l.faster_path, "turns": l.turns, "retained": l.retained,
                     "ticket_id": l.ticket_id, "incident_id": l.incident_id, "created_at": l.created_at} for l in rows],
        "memories": memory.list_memories(config.PLAYBOOK_BANK, limit=60),
    }


class CompareIn(BaseModel):
    customer_id: int
    message: str


@router.post("/compare")
def compare(body: CompareIn, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    c = db.get(User, body.customer_id)
    if not c or c.role != "customer":
        raise HTTPException(404, "Customer not found")
    try:
        return agent.compare_memory(db, c, body.message)
    except agent.llm.LLMUnavailable as e:
        raise HTTPException(503, f"AI unavailable: {e}")


@router.get("/customers")
def customers(q: str | None = None, user: User = Depends(support_staff), db: Session = Depends(get_db)):
    query = db.query(User).filter(User.role == "customer")
    if q:
        like = f"%{q}%"
        query = query.filter(or_(User.name.ilike(like), User.email.ilike(like), User.phone.ilike(like)))
    rows = query.order_by(User.id.desc()).limit(50).all()
    return {"items": [{**user_out(u),
                       "tickets": db.query(Ticket).filter_by(customer_id=u.id).count(),
                       "orders": db.query(Order).filter(Order.user_id == u.id, Order.code.isnot(None)).count()} for u in rows]}


@router.get("/metrics")
def metrics(days: int = 14, user: User = Depends(require_roles("agent", "lead")), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(days=days)
    tickets = db.query(Ticket).filter(Ticket.created_at >= since).all()
    daily = defaultdict(lambda: {"tickets": 0, "resolved": 0, "resolved_ai": 0, "turns": 0, "handoffs": 0,
                                 "memory_hits": 0, "first_contact": 0, "csat_sum": 0, "csat_n": 0})
    for t in tickets:
        d = daily[t.created_at.date().isoformat()]
        d["tickets"] += 1
        d["memory_hits"] += t.memory_hits
        if t.handoff_reason:
            d["handoffs"] += 1
        if t.status in ("resolved", "closed"):
            d["resolved"] += 1
            d["turns"] += t.ai_turns + t.human_turns
            if t.resolved_by == "ai":
                d["resolved_ai"] += 1
            if t.ai_turns + t.human_turns <= 1:
                d["first_contact"] += 1
        if t.csat:
            d["csat_sum"] += t.csat
            d["csat_n"] += 1
    series = []
    for i in range(days, -1, -1):
        day = (utcnow() - timedelta(days=i)).date().isoformat()
        d = daily.get(day)
        if not d:
            series.append({"date": day, "tickets": 0})
            continue
        series.append({
            "date": day, "tickets": d["tickets"], "resolved": d["resolved"],
            "avg_replies_to_resolve": round(d["turns"] / d["resolved"], 2) if d["resolved"] else None,
            "ai_resolution_rate": round(100 * d["resolved_ai"] / d["resolved"]) if d["resolved"] else None,
            "first_contact_rate": round(100 * d["first_contact"] / d["resolved"]) if d["resolved"] else None,
            "handoff_rate": round(100 * d["handoffs"] / d["tickets"]),
            "memory_hits_per_ticket": round(d["memory_hits"] / d["tickets"], 1),
            "csat": round(d["csat_sum"] / d["csat_n"], 2) if d["csat_n"] else None,
        })
    by_match = defaultdict(lambda: [0, 0])
    for t in tickets:
        if t.status in ("resolved", "closed") and t.matched_memory:
            by_match[t.matched_memory][0] += t.ai_turns + t.human_turns
            by_match[t.matched_memory][1] += 1
    resolved = [t for t in tickets if t.status in ("resolved", "closed")]
    return {
        "series": series,
        "totals": {
            "tickets": len(tickets), "resolved": len(resolved),
            "ai_resolved": len([t for t in resolved if t.resolved_by == "ai"]),
            "new_issues": len([t for t in tickets if t.is_new_issue]),
            "lessons": db.query(Lesson).count(),
            "avg_csat": round(sum(t.csat for t in tickets if t.csat) / max(1, len([t for t in tickets if t.csat])), 2),
        },
        "replies_by_memory_match": {k: round(v[0] / v[1], 2) for k, v in by_match.items() if v[1]},
    }
