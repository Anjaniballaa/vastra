"""Background jobs: incident re-alerts/escalation, email inbox, follow-ups, stale payments and tickets."""
import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler

from . import config
from .db import session_scope
from .models import Message, Order, Ticket
from .realtime import hub
from .services import incidents, inbox, notify, orders as order_svc
from .services.settings import get_setting

log = logging.getLogger("scheduler")
scheduler = BackgroundScheduler(timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1})


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


def expire_unpaid_orders():
    """Release stock held by checkouts that were never paid (30 min)."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    with session_scope() as db:
        for o in db.query(Order).filter(Order.status == "pending_payment", Order.created_at < cutoff).all():
            o.status = "payment_failed"
            o.payment_status = "failed"
            order_svc.restore_stock(db, o)
            order_svc.add_event(db, o, "payment_failed", "Payment not completed within 30 minutes", "system")


def followups():
    """Ask customers whether the fix held, and close tickets that went quiet."""
    with session_scope() as db:
        s = get_setting(db, "support")
        now = datetime.now(timezone.utc)
        due = now - timedelta(hours=float(s["followup_after_hours"]))
        for t in db.query(Ticket).filter(Ticket.status == "resolved", Ticket.followup_sent.is_(False),
                                         Ticket.resolved_at < due).limit(20).all():
            text = (f"Hi {t.customer.name.split()[0]}, following up on {t.code} (\"{t.subject[:60]}\"). "
                    f"Did our fix work? Reply to this message if anything is still wrong, or rate us from your support page.")
            db.add(Message(ticket_id=t.id, sender="system", body=text, channel=t.channel, meta={"followup": True}))
            t.followup_sent = True
            notify.notify_user(t.customer, f"Did we fix it? ({t.code})", text,
                               cta_label="Rate your experience", cta_url=f"{config.FRONTEND_URL}/help?ticket={t.id}",
                               related=f"ticket:{t.code}")
        stale = now - timedelta(hours=float(s["auto_close_waiting_hours"]))
        for t in db.query(Ticket).filter(Ticket.status == "waiting_customer", Ticket.updated_at < stale).all():
            t.status = "resolved"
            t.resolved_at = now
            t.resolved_by = t.resolved_by or ("human" if t.human_turns else "ai")
            hub.to_staff("ticket.updated", {"id": t.id})


def start():
    scheduler.add_job(incidents.tick, "interval", seconds=30, id="incidents")
    scheduler.add_job(inbox.poll, "interval", seconds=30, id="inbox")
    scheduler.add_job(expire_unpaid_orders, "interval", minutes=5, id="unpaid")
    scheduler.add_job(followups, "interval", minutes=10, id="followups")
    scheduler.start()
    log.info("scheduler started")


def stop():
    scheduler.shutdown(wait=False)
