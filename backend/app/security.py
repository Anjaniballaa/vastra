from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User

TOKEN_DAYS = 14


def hash_secret(value: str) -> str:
    return bcrypt.hashpw(value.encode(), bcrypt.gensalt()).decode()


def verify_secret(value: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(value.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_DAYS),
    }
    return jwt.encode(payload, config.APP_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, config.APP_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


def user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    data = decode_token(token)
    if not data:
        return None
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        return None
    return user


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:]
    return None


def optional_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User | None:
    return user_from_token(db, _bearer(authorization))


def current_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, _bearer(authorization))
    if not user:
        raise HTTPException(401, "Please log in")
    return user


def require_roles(*roles: str):
    allowed = set(roles) | {"admin"}

    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(403, "You don't have access to this area")
        return user

    return dep
