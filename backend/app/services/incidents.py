"""Incident engine: clusters of *new* (previously unseen) customer issues.

Each report from a distinct customer is a signal. Severity only ever goes up automatically:
  new  -> first report, routed to a human immediately
  sev3 -> N customers within a long window
  sev2 -> more customers within a shorter window
  sev1 -> many customers within a short window, or a few payment/security reports very quickly
Thresholds live in admin settings. Un-acknowledged Sev 2/1 incidents re-alert; Sev 1 escalates along the on-call list.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import distinct, func
from sqlalchemy.orm import Session

from .. import config
from ..db import session_scope
from ..models import (
    SEVERITY_ORDER, Incident, IncidentEvent, IncidentSignal, Lesson, Message, Ticket, User,
)
from ..realtime import hub
from . import memory, notify
from .settings import get_setting

log = logging.getLogger("incidents")
SEV_LABEL = {"new": "New issue", "sev3": "SEV 3", "sev2": "SEV 2", "sev1": "SEV 1"}


def utcnow():
    return datetime.now(timezone.utc)


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def serialize(db: Session, inc: Incident, full: bool = False) -> dict:
    d = {
        "id": inc.id, "code": inc.code, "title": inc.title, "summary": inc.summary, "category": inc.category,
        "severity": inc.severity, "severity_label": SEV_LABEL[inc.severity], "status": inc.status,
        "customer_count": inc.customer_count, "report_count": inc.report_count, "first_seen": inc.first_seen,
        "last_seen": inc.last_seen, "acknowledged_at": inc.acknowledged_at, "resolved_at": inc.resolved_at,
        "resolution_note": inc.resolution_note, "alert_count": inc.alert_count,
        "acknowledged_by": _name(db, inc.acknowledged_by), "resolved_by": _name(db, inc.resolved_by),
        "oncall": _name(db, current_oncall(db, inc)),
    }
    if full:
        d["signals"] = [{"id": s.id, "ticket_id": s.ticket_id, "customer_id": s.customer_id,
                         "customer": _name(db, s.customer_id), "text": s.text, "at": s.created_at} for s in inc.signals]
        d["events"] = [{"kind": e.kind, "detail": e.detail, "actor": _name(db, e.actor_id), "at": e.created_at}
                       for e in inc.events]
        d["tickets"] = [{"id": t.id, "code": t.code, "status": t.status, "customer": t.customer.name}
                        for t in db.query(Ticket).filter_by(incident_id=inc.id).order_by(Ticket.id).all()]
    return d


def _name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    u = db.get(User, user_id)
    return u.name if u else None


def _event(db: Session, inc: Incident, kind: str, detail: str, actor_id: int | None = None):
    db.add(IncidentEvent(incident_id=inc.id, kind=kind, detail=detail, actor_id=actor_id))


def open_incidents(db: Session) -> list[Incident]:
    return db.query(Incident).filter(Incident.status != "resolved").order_by(Incident.last_seen.desc()).limit(25).all()


def staff(db: Session, *roles: str) -> list[User]:
    return db.query(User).filter(User.role.in_(roles), User.is_active.is_(True)).order_by(User.id).all()


def oncall_list(db: Session) -> list[User]:
    ids = get_setting(db, "oncall").get("user_ids") or []
    users = [db.get(User, i) for i in ids]
    users = [u for u in users if u and u.is_active]
    return users or staff(db, "lead", "admin")


def current_oncall(db: Session, inc: Incident) -> int | None:
    lst = oncall_list(db)
    if not lst:
        return None
    return lst[min(inc.oncall_index, len(lst) - 1)].id


def pick_agent(db: Session) -> User | None:
    agents = staff(db, "agent") or staff(db, "lead", "admin")
    if not agents:
        return None
    loads = dict(db.query(Ticket.assigned_to, func.count(Ticket.id))
                 .filter(Ticket.status.in_(("needs_human", "human_active", "waiting_customer")))
                 .group_by(Ticket.assigned_to).all())
    return min(agents, key=lambda a: loads.get(a.id, 0))


def create_incident(db: Session, title: str, category: str, summary: str) -> Incident:
    inc = Incident(title=title[:255], category=category or "other", summary=summary, severity="new", status="open")
    db.add(inc)
    db.flush()
    inc.code = f"INC-{100 + inc.id}"
    _event(db, inc, "created", f"New issue detected: {title}")
    return inc


def add_signal(db: Session, inc: Incident, ticket: Ticket, customer_id: int, text: str) -> Incident:
    """Record a report and re-evaluate severity. Resolved incidents re-open if reports continue."""
    already = db.query(IncidentSignal).filter_by(incident_id=inc.id, customer_id=customer_id).first()
    db.add(IncidentSignal(incident_id=inc.id, ticket_id=ticket.id, customer_id=customer_id, text=text[:2000]))
    inc.report_count += 1
    inc.last_seen = utcnow()
    if inc.status == "resolved":
        inc.status = "open"
        inc.acknowledged_at = inc.acknowledged_by = None
        _event(db, inc, "reopened", "New reports arrived after resolution — incident re-opened")
    db.flush()
    inc.customer_count = db.query(func.count(distinct(IncidentSignal.customer_id))).filter_by(incident_id=inc.id).scalar()
    if not already:
        _event(db, inc, "report", f"Reported by customer #{customer_id} (ticket {ticket.code})")
    evaluate(db, inc)
    db.commit()
    hub.to_staff("incident.updated", serialize(db, inc))
    return inc


def _distinct_customers_since(db: Session, inc: Incident, minutes: int) -> int:
    since = utcnow() - timedelta(minutes=minutes)
    return db.query(func.count(distinct(IncidentSignal.customer_id))).filter(
        IncidentSignal.incident_id == inc.id, IncidentSignal.created_at >= since).scalar() or 0


def target_severity(db: Session, inc: Incident) -> tuple[str, str]:
    rules = get_setting(db, "severity_rules")
    crit = rules.get("sev1_critical", {})
    if inc.category in crit.get("categories", []):
        n = _distinct_customers_since(db, inc, crit["window_minutes"])
        if n >= crit["customers"]:
            return "sev1", f"{n} customers reported a {inc.category} issue within {crit['window_minutes']} min"
    for sev in ("sev1", "sev2", "sev3"):
        r = rules[sev]
        n = _distinct_customers_since(db, inc, r["window_minutes"])
        if n >= r["customers"]:
            return sev, f"{n} distinct customers within {r['window_minutes']} min (threshold {r['customers']})"
    return "new", "single report"


def evaluate(db: Session, inc: Incident):
    target, reason = target_severity(db, inc)
    if SEVERITY_ORDER[target] > SEVERITY_ORDER[inc.severity]:
        old = inc.severity
        inc.severity = target
        inc.status = "open"  # an escalation needs a fresh acknowledgement
        inc.acknowledged_at = inc.acknowledged_by = None
        inc.oncall_index = 0
        _event(db, inc, "severity_up", f"{SEV_LABEL[old]} → {SEV_LABEL[target]}: {reason}")
        db.flush()
        send_alerts(db, inc, reason)
        hub.to_staff("incident.escalated", serialize(db, inc))


def _alert_text(inc: Incident, reason: str) -> tuple[str, str]:
    link = f"{config.FRONTEND_URL}/console/incidents/{inc.id}"
    subj = f"[{SEV_LABEL[inc.severity]}] {inc.code}: {inc.title}"
    body = (f"{SEV_LABEL[inc.severity]} — {inc.title}\n\nCategory: {inc.category}. Customers affected: {inc.customer_count} "
            f"({inc.report_count} reports).\nWhy: {reason}\n\n{inc.summary or ''}\n\nAcknowledge: {link}")
    return subj, body


def send_alerts(db: Session, inc: Incident, reason: str, repeat: bool = False):
    subj, body = _alert_text(inc, reason)
    if repeat:
        subj = "[REMINDER] " + subj
    related = f"incident:{inc.code}"
    team = staff(db, "agent", "lead", "admin")
    oncall_id = current_oncall(db, inc)
    oncall = db.get(User, oncall_id) if oncall_id else None
    leads = staff(db, "lead", "admin")
    sent_to = []

    if inc.severity in ("sev3", "sev2", "sev1") and not repeat:
        for u in team:
            notify.send_email(u.email, subj, body, title=subj, cta_label="Open incident",
                              cta_url=f"{config.FRONTEND_URL}/console/incidents/{inc.id}", user_id=u.id, related=related)
        sent_to.append(f"email to {len(team)} support staff")
    wa = f"🚨 *{subj}*\n{inc.customer_count} customers affected.\n{reason}\nAck: {config.FRONTEND_URL}/console/incidents/{inc.id}"
    if inc.severity == "sev3" and oncall and not repeat:
        notify.send_whatsapp(oncall.phone, wa, user_id=oncall.id, related=related)
        sent_to.append(f"WhatsApp to {oncall.name}")
    if inc.severity == "sev2" and oncall:
        notify.send_whatsapp(oncall.phone, wa, user_id=oncall.id, related=related)
        sent_to.append(f"WhatsApp to on-call {oncall.name}")
    if inc.severity == "sev1":
        targets = {u.id: u for u in leads}
        if oncall:
            targets[oncall.id] = oncall
        for u in targets.values():
            notify.send_whatsapp(u.phone, wa, user_id=u.id, related=related)
        sent_to.append(f"WhatsApp to {len(targets)} leads")
        if oncall:
            speech = (f"Vastra severity one alert. {inc.title}. {inc.customer_count} customers affected. "
                      f"Press 1 to acknowledge. Press 2 to escalate.")
            notify.place_alert_call(oncall.phone, inc.id, speech, user_id=oncall.id, related=related)
            sent_to.append(f"phone call to {oncall.name}")
    if sent_to:
        inc.last_alert_at = utcnow()
        inc.alert_count += 1
        _event(db, inc, "alert", ("Reminder: " if repeat else "") + "; ".join(sent_to))


def acknowledge(db: Session, inc: Incident, user: User, via: str = "console"):
    if inc.status == "resolved":
        return inc
    inc.status = "acknowledged"
    inc.acknowledged_by = user.id
    inc.acknowledged_at = utcnow()
    _event(db, inc, "ack", f"Acknowledged by {user.name} via {via}", user.id)
    db.commit()
    hub.to_staff("incident.updated", serialize(db, inc))
    return inc


def escalate(db: Session, inc: Incident, reason: str, actor: User | None = None):
    lst = oncall_list(db)
    if inc.oncall_index + 1 < len(lst):
        inc.oncall_index += 1
    nxt = lst[inc.oncall_index] if lst else None
    _event(db, inc, "escalated", f"Escalated to {nxt.name if nxt else 'nobody (on-call list exhausted)'}: {reason}",
           actor.id if actor else None)
    db.flush()
    send_alerts(db, inc, reason, repeat=True)
    db.commit()
    hub.to_staff("incident.updated", serialize(db, inc))


def resolve(db: Session, inc: Incident, user: User, note: str, customer_message: str | None) -> Incident:
    inc.status = "resolved"
    inc.resolved_by = user.id
    inc.resolved_at = utcnow()
    inc.resolution_note = note
    inc.customer_message = customer_message
    _event(db, inc, "resolved", f"Resolved by {user.name}: {note}", user.id)
    lesson = Lesson(incident_id=inc.id, kind="incident", category=inc.category, symptom=inc.title,
                    cause=inc.summary, fix=note, turns=0)
    db.add(lesson)
    db.flush()

    notified = set()
    msg = customer_message or f"Good news — the issue you reported ({inc.title}) has been fixed. {note}"
    for t in db.query(Ticket).filter_by(incident_id=inc.id).all():
        db.add(Message(ticket_id=t.id, sender="agent", author_id=user.id, body=msg, channel=t.channel,
                       meta={"incident_update": inc.code}))
        if t.status not in ("resolved", "closed"):
            t.status = "waiting_customer"
        if t.customer_id not in notified:
            notified.add(t.customer_id)
            notify.notify_user(t.customer, f"Update on your request {t.code}", msg,
                               cta_label="View request", cta_url=f"{config.FRONTEND_URL}/help?ticket={t.id}",
                               related=f"incident:{inc.code}")
        hub.to_user(t.customer_id, "ticket.message", {"ticket_id": t.id})
    _event(db, inc, "customers_notified", f"Resolution sent to {len(notified)} affected customers", user.id)
    db.commit()

    text = (f"Incident {inc.code} ({inc.category}): '{inc.title}'. Reported by {inc.customer_count} customers. "
            f"Root cause / details: {inc.summary}. Resolution: {note}. If a customer reports these symptoms after "
            f"{inc.resolved_at:%d %b %Y %H:%M} UTC, treat it as a known issue: apply this resolution first.")
    lesson.retained = memory.retain_playbook(text, "incident resolution", ["incident", inc.category])
    db.commit()
    memory.in_background(memory.refresh_known_issues)
    hub.to_staff("incident.updated", serialize(db, inc))
    return inc


def tick():
    """Scheduler job: re-alert and escalate un-acknowledged Sev 2 / Sev 1 incidents."""
    try:
        with session_scope() as db:
            alerting = get_setting(db, "alerting")
            now = utcnow()
            for inc in db.query(Incident).filter(Incident.status == "open",
                                                 Incident.severity.in_(("sev2", "sev1"))).all():
                last = _aware(inc.last_alert_at) or _aware(inc.first_seen)
                mins = (now - last).total_seconds() / 60
                if inc.severity == "sev1" and mins >= alerting["sev1_escalate_after_minutes"]:
                    escalate(db, inc, f"Not acknowledged within {alerting['sev1_escalate_after_minutes']} minutes")
                elif inc.severity == "sev2" and mins >= alerting["sev2_repeat_minutes"]:
                    send_alerts(db, inc, f"Still not acknowledged after {int(mins)} minutes", repeat=True)
                    db.commit()
                    hub.to_staff("incident.updated", serialize(db, inc))
    except Exception:
        log.exception("incident tick failed")
