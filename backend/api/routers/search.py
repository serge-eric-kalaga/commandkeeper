from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, literal, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import require_ready_user
from ..models import Command, Tag
from ..schemas import SearchResponse

router = APIRouter(
    prefix="/search", tags=["search"], dependencies=[Depends(require_ready_user)]
)


@router.get("", response_model=SearchResponse)
def search_commands(
    q: str = Query(min_length=1),
    group_id: int | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> SearchResponse:
    q_norm = q.strip().lower()
    # Split on any whitespace; keep it simple and predictable.
    raw_tokens = [t for t in re.split(r"\s+", q_norm) if t]
    tokens: list[str] = []
    seen: set[str] = set()
    for t in raw_tokens:
        cleaned = t.strip(".,;:()[]{}<>\"' ")
        if not cleaned:
            continue
        if cleaned in seen:
            continue
        seen.add(cleaned)
        tokens.append(cleaned)
    # Avoid generating huge SQL on extremely long queries.
    tokens = tokens[:10]

    if not tokens:
        return SearchResponse(items=[])

    def token_any_match(token: str):
        desc_col = func.coalesce(Command.description, "")
        return or_(
            func.lower(Command.title).contains(token),
            func.lower(Command.command).contains(token),
            func.lower(desc_col).contains(token),
            Command.tag_entities.any(func.lower(Tag.name).contains(token)),
        )

    token_matches = [token_any_match(t) for t in tokens]
    where_clause = or_(*token_matches)

    score = literal(0)
    for match_expr in token_matches:
        score = score + case((match_expr, 1), else_=0)

    stmt = (
        select(Command, score.label("score"))
        .options(selectinload(Command.tag_entities))
        .where(where_clause)
        .order_by(score.desc(), Command.updated_at.desc())
        .limit(limit)
    )

    if group_id is not None:
        stmt = stmt.where(Command.group_id == group_id)

    rows = db.execute(stmt).all()
    items = [row[0] for row in rows]
    return SearchResponse(items=items)
