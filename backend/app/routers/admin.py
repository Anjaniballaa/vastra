"""Admin: staff accounts & roles, severity thresholds, on-call rotation, policies, notification and audit logs."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import ROLES, AuditLog, Notification, User
from ..security import hash_secret, require_roles
from ..services import notify
from ..services.audit import audit
from ..services.settings import DEFAULTS, get_setting, set_setting
from .auth import normalize_phone, user_out

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin = require_roles("admin")


@router.get("/users")
def users(role: str | None = None, user: User = Depends(admin), db: Session = Depends(get_db)):
    q = db.query(User)
    q = q.filter(User.role == role) if role else q.filter(User.role != "customer")
    return {"items": [{**user_out(u), "is_active": u.is_active, "last_login_at": u.last_login_at}
                      for u in q.order_by(User.id).all()]}


class StaffIn(BaseModel):
    email: EmailStr
    name: str
    phone: str | None = None
    role: str
    password: str


@router.post("/users")
def create_staff(body: StaffIn, user: User = Depends(admin), db: Session = Depends(get_db)):
    if body.role not in ROLES or body.role == "customer":
        raise HTTPException(400, "Pick a staff role")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if db.query(User).filter_by(email=body.email.lower()).first():
        raise HTTPException(400, "A user with this email exists")
    u = User(email=body.email.lower(), name=body.name, phone=normalize_phone(body.phone), role=body.role,
             password_hash=hash_secret(body.password))
    db.add(u)
    audit(db, user, "staff.create", u.email, body.role)
    db.commit()
    notify.send_email(u.email, "Your Vastra staff account",
                      f"Hi {u.name}, {user.name} created a Vastra {u.role} account for you.\n\n"
                      f"Sign in at {config.FRONTEND_URL}/staff/login with this email. Your administrator will share your password.",
                      cta_label="Sign in", cta_url=f"{config.FRONTEND_URL}/staff/login", user_id=u.id)
    return user_out(u)


class StaffPatch(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    phone: str | None = None
    password: str | None = None
    name: str | None = None


@router.patch("/users/{uid}")
def patch_user(uid: int, body: StaffPatch, user: User = Depends(admin), db: Session = Depends(get_db)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    if body.role:
        if body.role not in ROLES:
            raise HTTPException(400, "Unknown role")
        if u.id == user.id and body.role != "admin":
            raise HTTPException(400, "You can't remove your own admin role")
        u.role = body.role
    if body.is_active is not None:
        if u.id == user.id and not body.is_active:
            raise HTTPException(400, "You can't deactivate yourself")
        u.is_active = body.is_active
    if body.phone is not None:
        u.phone = normalize_phone(body.phone)
    if body.name:
        u.name = body.name
    if body.password:
        if len(body.password) < 8:
            raise HTTPException(400, "Password must be at least 8 characters")
        u.password_hash = hash_secret(body.password)
    audit(db, user, "staff.update", u.email, body.model_dump_json(exclude_none=True, exclude={"password"}))
    db.commit()
    return user_out(u)


@router.get("/settings")
def settings(user: User = Depends(admin), db: Session = Depends(get_db)):
    return {k: get_setting(db, k) for k in DEFAULTS}


@router.put("/settings/{key}")
def put_setting(key: str, value: dict, user: User = Depends(admin), db: Session = Depends(get_db)):
    if key not in DEFAULTS:
        raise HTTPException(404, "Unknown setting")
    if key == "severity_rules":
        for sev in ("sev3", "sev2", "sev1"):
            r = value.get(sev, {})
            if int(r.get("customers", 0)) < 1 or int(r.get("window_minutes", 0)) < 1:
                raise HTTPException(400, f"{sev} needs customers ≥ 1 and window ≥ 1 minute")
        if not (value["sev3"]["customers"] <= value["sev2"]["customers"] <= value["sev1"]["customers"]):
            raise HTTPException(400, "Thresholds must increase from Sev 3 to Sev 1")
    audit(db, user, "settings.update", key)
    return set_setting(db, key, value)


@router.get("/notifications")
def notifications(channel: str | None = None, user: User = Depends(require_roles("admin", "lead")),
                  db: Session = Depends(get_db)):
    q = db.query(Notification)
    if channel:
        q = q.filter_by(channel=channel)
    rows = q.order_by(Notification.id.desc()).limit(200).all()
    return {"items": [{k: getattr(n, k) for k in ("id", "channel", "to", "subject", "body", "status", "error",
                                                  "related", "created_at")} for n in rows]}


@router.get("/audit")
def audit_log(user: User = Depends(admin), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(300).all()
    return {"items": [{k: getattr(a, k) for k in ("id", "actor_label", "action", "target", "detail", "created_at")}
                      for a in rows]}


@router.get("/integrations")
def integrations(user: User = Depends(admin)):
    return {
        "email": {"provider": config.EMAIL_PROVIDER, "configured": config.email_configured(),
                  "inbox": config.imap_configured()},
        "whatsapp": {"configured": bool(config.TWILIO_ACCOUNT_SID), "from": config.TWILIO_WHATSAPP_FROM,
                     "inbound_webhook": f"{config.PUBLIC_API_URL}/api/twilio/whatsapp"},
        "voice": {"enabled": config.TWILIO_VOICE_ENABLED, "number": config.TWILIO_PHONE_NUMBER or None},
        "hindsight": {"configured": bool(config.HINDSIGHT_API_KEY), "playbook_bank": config.PLAYBOOK_BANK},
        "llm": {"main": config.GROQ_MODEL_MAIN, "fast": config.GROQ_MODEL_FAST},
        "payments": {"razorpay_mode": "test" if config.RAZORPAY_KEY_ID.startswith("rzp_test") else "live"},
    }


class TestMessage(BaseModel):
    channel: str


@router.post("/test-notification")
def test_notification(body: TestMessage, user: User = Depends(admin)):
    if body.channel == "email":
        notify.send_email(user.email, "Vastra test email", "Email delivery from Vastra is working.", user_id=user.id,
                          related="test", sync=True)
    elif body.channel == "whatsapp":
        if not user.phone:
            raise HTTPException(400, "Add your phone number first")
        notify.send_whatsapp(user.phone, "✅ Vastra WhatsApp alerts are working.", user_id=user.id, related="test", sync=True)
    else:
        raise HTTPException(400, "Unknown channel")
    return {"ok": True}
