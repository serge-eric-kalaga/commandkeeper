from __future__ import annotations

import datetime as dt

from jose import JWTError, jwt
from werkzeug.security import check_password_hash, generate_password_hash

from .settings import settings


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return check_password_hash(password_hash, password)


def create_access_token(
    *, subject: str, user_id: int, expires_minutes: int | None = None
) -> str:
    expire_minutes = (
        expires_minutes
        if expires_minutes is not None
        else settings.access_token_expire_minutes
    )
    expire = dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=expire_minutes)

    payload = {
        "sub": subject,
        "uid": user_id,
        "exp": expire,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise ValueError("Invalid token") from exc
