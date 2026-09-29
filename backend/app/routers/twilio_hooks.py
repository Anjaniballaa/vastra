"""Twilio webhooks: customers chatting on WhatsApp, and Sev 1 voice-call acknowledgement."""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db, session_scope
from ..models import Incident, Ticket, User
from ..services import agent, incidents as inc_engine, notify

log = logging.getLogger("twilio")
router = APIRouter(prefix="/api/twilio", tags=["twilio"])


async def _form(request: Request) -> dict:
    form = dict(await request.form())
    if config.TWILIO_VALIDATE_SIGNATURE:
        from twilio.request_validator import RequestValidator
        url = f"{config.PUBLIC_API_URL}{request.url.path}"
        if request.url.query:
            url += f"?{request.url.query}"
        if not RequestValidator(config.TWILIO_AUTH_TOKEN).validate(url, form, request.headers.get("X-Twilio-Signature", "")):
            raise HTTPException(403, "Invalid Twilio signature")
    return form


def twiml(body: str = "") -> Response:
    return Response(f'<?xml version="1.0" encoding="UTF-8"?><Response>{body}</Response>', media_type="application/xml")


def _process_whatsapp(phone: str, text: str):
    with session_scope() as db:
        user = db.query(User).filter(or_(User.phone == phone, User.phone == phone.lstrip("+"))).first()
        if not user:
            notify.send_whatsapp(phone, f"Hi! 👋 This is Vastra Care. Please sign up at {config.FRONTEND_URL} with this "
                                        f"mobile number so we can find your orders, then message us again.")
            return
        if user.role != "customer":
            return
        ticket = (db.query(Ticket).filter(Ticket.customer_id == user.id, Ticket.channel == "whatsapp",
                                          Ticket.status != "closed").order_by(Ticket.updated_at.desc()).first())
        if ticket and ticket.status == "resolved" and ticket.resolved_at and (
                (agent.utcnow() - inc_engine._aware(ticket.resolved_at)).total_seconds() > 6 * 3600):
            ticket = None  # a new topic starts a fresh conversation
        agent.handle_customer_message(db, user, text, "whatsapp", ticket)


@router.post("/whatsapp")
async def whatsapp_inbound(request: Request, background: BackgroundTasks):
    form = await _form(request)
    phone = form.get("From", "").replace("whatsapp:", "")
    text = (form.get("Body") or "").strip()
    if phone and text:
        background.add_task(_process_whatsapp, phone, text)  # reply goes out via the Twilio API
    return twiml()


@router.post("/voice/alert")
async def voice_alert(request: Request, incident_id: int, db: Session = Depends(get_db)):
    await _form(request)
    inc = db.get(Incident, incident_id)
    if not inc:
        return twiml("<Say>Incident not found.</Say>")
    say = (f"Vastra {inc_engine.SEV_LABEL[inc.severity]} alert. {inc.title}. {inc.customer_count} customers affected. "
           f"Press 1 to acknowledge. Press 2 to escalate.")
    action = f"{config.PUBLIC_API_URL}/api/twilio/voice/ack?incident_id={incident_id}"
    return twiml(f'<Gather numDigits="1" action="{action}" method="POST" timeout="8">'
                 f'<Say voice="Polly.Aditi">{say}</Say></Gather><Say>No input received. Goodbye.</Say>')


@router.post("/voice/ack")
async def voice_ack(request: Request, incident_id: int, db: Session = Depends(get_db)):
    form = await _form(request)
    digit = form.get("Digits")
    called = form.get("To", "")
    inc = db.get(Incident, incident_id)
    user = db.query(User).filter(User.phone == called).first()
    if not inc or not user:
        return twiml("<Say>Sorry, we couldn't match this call.</Say>")
    if digit == "1":
        inc_engine.acknowledge(db, inc, user, via="phone call")
        return twiml(f"<Say>Acknowledged. Thank you {user.name.split()[0]}. The incident is assigned to you.</Say>")
    if digit == "2":
        inc_engine.escalate(db, inc, f"{user.name} pressed 2 on the alert call", user)
        return twiml("<Say>Escalating to the next person on call.</Say>")
    return twiml("<Say>Goodbye.</Say>")
