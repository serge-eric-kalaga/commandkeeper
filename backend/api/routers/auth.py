from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import ChangePasswordRequest, LoginRequest, TokenResponse, UserPublic
from ..security import create_access_token, hash_password, verify_password
from ..settings import settings
from ..deps import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )

    token = create_access_token(subject=user.username, user_id=user.id)
    return TokenResponse(
        access_token=token, must_change_password=user.must_change_password
    )


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return user


@router.post("/change-password", response_model=UserPublic)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect"
        )

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def ensure_default_admin(db: Session) -> None:
    existing = db.scalar(
        select(User).where(User.username == settings.default_admin_username)
    )
    if existing is not None:
        return

    user = User(
        username=settings.default_admin_username,
        password_hash=hash_password(settings.default_admin_password),
        must_change_password=True,
    )
    db.add(user)
    db.commit()
