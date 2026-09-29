import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from .. import config
from ..db import get_db
from ..models import OtpCode, User
from ..security import create_token, current_user, hash_secret, verify_secret
from ..services import memory, notify

router = APIRouter(prefix="/api/auth", tags=["auth"])
PHONE_RE = re.compile(r"^\+?[1-9]\d{9,14}$")


def normalize_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    p = re.sub(r"[\s\-()]", "", phone)
    if re.fullmatch(r"[6-9]\d{9}", p):
        p = "+91" + p
    if not p.startswith("+"):
        p = "+" + p
    if not PHONE_RE.match(p):
        raise HTTPException(400, "Enter a valid mobile number, e.g. 98765 43210")
    return p


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "phone": u.phone, "role": u.role,
            "loyalty_points": u.loyalty_points, "whatsapp_opt_in": u.whatsapp_opt_in, "created_at": u.created_at}


class OtpRequest(BaseModel):
    email: EmailStr


class OtpVerify(BaseModel):
    email: EmailStr
    code: str
    name: str | None = None
    phone: str | None = None


class StaffLogin(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    whatsapp_opt_in: bool | None = None


@router.post("/otp/request")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    email = body.email.lower()
    recent = (db.query(OtpCode).filter(OtpCode.email == email,
                                       OtpCode.created_at > datetime.now(timezone.utc) - timedelta(seconds=30)).first())
    if recent:
        raise HTTPException(429, "Please wait 30 seconds before requesting another code")
    code = f"{secrets.randbelow(900000) + 100000}"
    db.add(OtpCode(email=email, code_hash=hash_secret(code),
                   expires_at=datetime.now(timezone.utc) + timedelta(minutes=10)))
    db.commit()
    user = db.query(User).filter_by(email=email).first()
    resp = {"sent": True, "is_new_user": user is None}
    if config.email_configured():
        notify.send_email(email, f"{code} is your Vastra login code",
                          f"Your one-time code is {code}. It expires in 10 minutes. If you didn't request it, ignore this email.",
                          title="Your login code", sync=True, related="otp")
    elif config.IS_DEV:
        resp["dev_code"] = code  # local development only, when no email provider is configured
    else:
        raise HTTPException(503, "Email is not configured on the server yet")
    return resp


@router.post("/otp/verify")
def verify_otp(body: OtpVerify, db: Session = Depends(get_db)):
    email = body.email.lower()
    otp = (db.query(OtpCode).filter(OtpCode.email == email, OtpCode.used.is_(False))
           .order_by(OtpCode.id.desc()).first())
    if not otp or otp.expires_at < datetime.now(timezone.utc) or otp.attempts >= 5:
        raise HTTPException(400, "Code expired. Request a new one.")
    otp.attempts += 1
    if not verify_secret(body.code.strip(), otp.code_hash):
        db.commit()
        raise HTTPException(400, "Incorrect code")
    otp.used = True
    user = db.query(User).filter_by(email=email).first()
    if not user:
        if not body.name or not body.phone:
            db.commit()
            raise HTTPException(422, "Name and mobile number are required to create your account")
        user = User(email=email, name=body.name.strip()[:120], phone=normalize_phone(body.phone), role="customer")
        db.add(user)
        db.flush()
        memory.in_background(memory.retain_customer, user.id,
                             f"{user.name} created a Vastra account on {datetime.now(timezone.utc):%d %b %Y}.",
                             "account created", ["account"], user.name)
    elif user.role != "customer":
        db.commit()
        raise HTTPException(400, "Staff accounts sign in with a password")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.post("/staff/login")
def staff_login(body: StaffLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter_by(email=body.email.lower()).first()
    if not user or user.role == "customer" or not verify_secret(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.name:
        user.name = body.name.strip()[:120]
    if body.phone is not None:
        user.phone = normalize_phone(body.phone)
    if body.whatsapp_opt_in is not None:
        user.whatsapp_opt_in = body.whatsapp_opt_in
    db.commit()
    return user_out(user)
