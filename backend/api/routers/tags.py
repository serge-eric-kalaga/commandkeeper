from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_ready_user
from ..models import Tag

router = APIRouter(
    prefix="/tags", tags=["tags"], dependencies=[Depends(require_ready_user)]
)


@router.get("", response_model=list[str])
def list_tags(db: Session = Depends(get_db)) -> list[str]:
    names = db.scalars(select(Tag.name).order_by(Tag.name.asc())).all()
    return list(names)
