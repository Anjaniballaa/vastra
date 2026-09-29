"""Outbound notifications: email (Gmail SMTP or Resend), WhatsApp and voice via Twilio.

Every attempt is logged in the `notifications` table so staff can see exactly what went out.
Sends run on a small thread pool so API requests never wait on SMTP/Twilio.
"""
import html
import logging
import smtplib
import ssl
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

import httpx

from .. import config
from ..db import session_scope
from ..models import Notification, User

log = logging.getLogger("notify")
_pool = ThreadPoolExecutor(max_workers=6, thread_name_prefix="notify")
_twilio = None


def _twilio_client():
    global _twilio
    if _twilio is None and config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN:
        from twilio.rest import Client
        _twilio = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
    return _twilio


def _log(channel: str, to: str, body: str, status: str, subject: str | None = None, error: str | None = None,
         provider_id: str | None = None, user_id: int | None = None, related: str | None = None):
    try:
        with session_scope() as db:
            db.add(Notification(channel=channel, to=to, subject=subject, body=body[:4000], status=status,
                                error=(error or None) and error[:2000], provider_id=provider_id,
                                user_id=user_id, related=related))
    except Exception:  # logging must never break a send
        log.exception("failed to log notification")


def email_html(title: str, text: str, cta_label: str | None = None, cta_url: str | None = None) -> str:
    paragraphs = "".join(
        f"<p style='margin:0 0 12px;line-height:1.55'>{html.escape(p).replace(chr(10), '<br>')}</p>"
        for p in text.split("\n\n")
    )
    cta = ""
    if cta_label and cta_url:
        cta = (f"<p style='margin:20px 0'><a href='{html.escape(cta_url)}' style='background:#3b2f8f;color:#fff;"
               f"padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:600'>{html.escape(cta_label)}</a></p>")
    return f"""<!doctype html><html><body style="margin:0;background:#f5f4fb;font-family:Segoe UI,Arial,sans-serif;color:#1f1d2b">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;overflow:hidden">
<tr><td style="background:#3b2f8f;padding:18px 24px;color:#fff;font-size:22px;font-weight:800;letter-spacing:.5px">VASTRA</td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 14px;font-size:19px">{html.escape(title)}</h2>{paragraphs}{cta}</td></tr>
<tr><td style="padding:14px 24px;background:#faf9fe;color:#6b6880;font-size:12px">You're receiving this because you have an account or open request with Vastra. Reply to this email to reach our support team.</td></tr>
</table></td></tr></table></body></html>"""


def _send_email_now(to: str, subject: str, text: str, html_body: str, user_id=None, related=None,
                    reply_to: str | None = None, message_id: str | None = None):
    if not config.email_configured():
        _log("email", to, text, "skipped", subject, "Email provider not configured", user_id=user_id, related=related)
        return
    try:
        if config.EMAIL_PROVIDER == "resend":
            payload = {
                "from": formataddr((config.EMAIL_FROM_NAME, config.RESEND_FROM)),
                "to": [to], "subject": subject, "html": html_body, "text": text,
            }
            if config.GMAIL_ADDRESS:
                payload["reply_to"] = config.GMAIL_ADDRESS
            r = httpx.post("https://api.resend.com/emails", json=payload,
                           headers={"Authorization": f"Bearer {config.RESEND_API_KEY}"}, timeout=20)
            r.raise_for_status()
            _log("email", to, text, "sent", subject, provider_id=r.json().get("id"), user_id=user_id, related=related)
        else:
            msg = EmailMessage()
            msg["From"] = formataddr((config.EMAIL_FROM_NAME, config.GMAIL_ADDRESS))
            msg["To"] = to
            msg["Subject"] = subject
            msg["Message-ID"] = message_id or make_msgid(domain="vastra.support")
            if reply_to:
                msg["Reply-To"] = reply_to
            msg.set_content(text)
            msg.add_alternative(html_body, subtype="html")
            with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
                s.login(config.GMAIL_ADDRESS, config.GMAIL_APP_PASSWORD)
                s.send_message(msg)
            _log("email", to, text, "sent", subject, provider_id=msg["Message-ID"], user_id=user_id, related=related)
    except Exception as e:
        log.warning("email to %s failed: %s", to, e)
        _log("email", to, text, "failed", subject, str(e), user_id=user_id, related=related)


def send_email(to: str, subject: str, text: str, *, title: str | None = None, cta_label: str | None = None,
               cta_url: str | None = None, user_id: int | None = None, related: str | None = None, sync=False):
    body = email_html(title or subject, text, cta_label, cta_url)
    if sync:
        _send_email_now(to, subject, text, body, user_id, related)
    else:
        _pool.submit(_send_email_now, to, subject, text, body, user_id, related)


def _wa_address(phone: str) -> str:
    return phone if phone.startswith("whatsapp:") else f"whatsapp:{phone}"


def _send_whatsapp_now(phone: str, text: str, user_id=None, related=None):
    client = _twilio_client()
    if not client or not phone:
        _log("whatsapp", phone or "-", text, "skipped", error="Twilio or phone not configured", user_id=user_id, related=related)
        return
    try:
        m = client.messages.create(from_=config.TWILIO_WHATSAPP_FROM, to=_wa_address(phone), body=text[:1500])
        _log("whatsapp", phone, text, "sent", provider_id=m.sid, user_id=user_id, related=related)
    except Exception as e:
        log.warning("whatsapp to %s failed: %s", phone, e)
        _log("whatsapp", phone, text, "failed", error=str(e), user_id=user_id, related=related)


def send_whatsapp(phone: str | None, text: str, *, user_id: int | None = None, related: str | None = None, sync=False):
    if not phone:
        return
    if sync:
        _send_whatsapp_now(phone, text, user_id, related)
    else:
        _pool.submit(_send_whatsapp_now, phone, text, user_id, related)


def _call_now(phone: str, incident_id: int, speech: str, user_id=None, related=None):
    client = _twilio_client()
    if not config.TWILIO_VOICE_ENABLED or not client or not config.TWILIO_PHONE_NUMBER:
        _log("voice", phone, speech, "skipped", error="Voice calls disabled (TWILIO_VOICE_ENABLED=false or no number)",
             user_id=user_id, related=related)
        return
    try:
        url = f"{config.PUBLIC_API_URL}/api/twilio/voice/alert?incident_id={incident_id}"
        c = client.calls.create(to=phone, from_=config.TWILIO_PHONE_NUMBER, url=url, method="POST")
        _log("voice", phone, speech, "sent", provider_id=c.sid, user_id=user_id, related=related)
    except Exception as e:
        _log("voice", phone, speech, "failed", error=str(e), user_id=user_id, related=related)


def place_alert_call(phone: str | None, incident_id: int, speech: str, *, user_id=None, related=None):
    if phone:
        _pool.submit(_call_now, phone, incident_id, speech, user_id, related)


def notify_user(user: User, subject: str, text: str, *, channels=("email", "whatsapp"), cta_label=None,
                cta_url=None, related: str | None = None, whatsapp_text: str | None = None):
    if "email" in channels and user.email:
        send_email(user.email, subject, text, cta_label=cta_label, cta_url=cta_url, user_id=user.id, related=related)
    if "whatsapp" in channels and user.phone and user.whatsapp_opt_in:
        send_whatsapp(user.phone, whatsapp_text or f"*{subject}*\n\n{text}", user_id=user.id, related=related)
