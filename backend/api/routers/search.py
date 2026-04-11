from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func, literal, or_, select
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
    q: str | None = Query(default=None),
    group_id: int | None = Query(default=None),
    is_favorite: bool | None = Query(default=None),
    tag: list[str] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
) -> SearchResponse:
    q_norm = (q or "").strip().lower()
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

    normalized_tags = [t.strip().lower() for t in (tag or []) if (t or "").strip()]

    if not tokens and not normalized_tags and is_favorite is None and group_id is None:
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
    clauses = []

    if token_matches:
        clauses.append(or_(*token_matches))

    if normalized_tags:
        clauses.append(Command.tag_entities.any(Tag.name.in_(normalized_tags)))

    if is_favorite is not None:
        clauses.append(Command.is_favorite == is_favorite)

    if group_id is not None:
        clauses.append(Command.group_id == group_id)

    if not clauses:
        return SearchResponse(items=[])

    where_clause = and_(*clauses) if len(clauses) > 1 else clauses[0]

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

    rows = db.execute(stmt).all()
    items = [row[0] for row in rows]
    return SearchResponse(items=items)
