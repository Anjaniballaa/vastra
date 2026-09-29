"""Reads the support Gmail inbox (IMAP) so customers can open or continue tickets by email."""
import email
import imaplib
import logging
import re
from email.header import decode_header, make_header
from email.utils import parseaddr

from .. import config
from ..db import session_scope
from ..models import Ticket, User
from . import agent

log = logging.getLogger("inbox")
TICKET_RE = re.compile(r"TKT-\d+")
QUOTE_MARKERS = (re.compile(r"^On .+wrote:\s*$", re.M), re.compile(r"^-{2,}\s*Original Message", re.M | re.I),
                 re.compile(r"^From: .+$", re.M))


def _decode(value: str | None) -> str:
    return str(make_header(decode_header(value))) if value else ""


def _body(msg: email.message.Message) -> str:
    text = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition")):
                text = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                break
    else:
        text = msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace")
    for marker in QUOTE_MARKERS:
        m = marker.search(text)
        if m:
            text = text[:m.start()]
    lines = [l for l in text.splitlines() if not l.startswith(">")]
    return "\n".join(lines).strip()[:4000]


def poll():
    if not config.imap_configured():
        return
    try:
        box = imaplib.IMAP4_SSL("imap.gmail.com", timeout=30)
        box.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
        box.select("INBOX")
        _, data = box.search(None, "UNSEEN")
        ids = data[0].split()[:20]
        for num in ids:
            _, raw = box.fetch(num, "(RFC822)")
            msg = email.message_from_bytes(raw[0][1])
            sender_name, sender = parseaddr(_decode(msg.get("From")))
            sender = sender.lower()
            subject = _decode(msg.get("Subject"))
            if not sender or sender == config.GMAIL_ADDRESS.lower() or "mailer-daemon" in sender or "noreply" in sender:
                continue
            body = _body(msg)
            if not body:
                continue
            try:
                _handle(sender, sender_name, subject, body)
            except Exception:
                log.exception("failed to handle email from %s", sender)
        box.logout()
    except Exception as e:
        log.warning("imap poll failed: %s", e)


def _handle(sender: str, sender_name: str, subject: str, body: str):
    with session_scope() as db:
        user = db.query(User).filter_by(email=sender).first()
        if not user:
            user = User(email=sender, name=sender_name or sender.split("@")[0], role="customer")
            db.add(user)
            db.commit()
        if user.role != "customer":
            return
        ticket = None
        m = TICKET_RE.search(subject)
        if m:
            ticket = db.query(Ticket).filter_by(code=m.group(0), customer_id=user.id).first()
        text = body if ticket else f"{subject}\n\n{body}" if subject else body
        agent.handle_customer_message(db, user, text, channel="email", ticket=ticket)
