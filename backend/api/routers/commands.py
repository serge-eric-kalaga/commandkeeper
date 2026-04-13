from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import require_ready_user
from ..models import Command, CopyEvent, Group, Tag
from ..schemas import (
    CommandCreate,
    CommandOut,
    CommandStatsResponse,
    CommandsPageResponse,
    CommandUpdate,
)

router = APIRouter(
    prefix="/commands", tags=["commands"], dependencies=[Depends(require_ready_user)]
)


def _normalize_tags(raw: list[str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = (item or "").strip().lower()
        if not name:
            continue
        if name in seen:
            continue
        seen.add(name)
        names.append(name)
    return names


def _get_or_create_tags(db: Session, raw_names: list[str]) -> list[Tag]:
    names = _normalize_tags(raw_names)
    if not names:
        return []

    existing = {
        tag.name: tag
        for tag in db.scalars(select(Tag).where(Tag.name.in_(names))).all()
    }

    for name in names:
        if name in existing:
            continue
        tag = Tag(name=name)
        db.add(tag)
        existing[name] = tag

    db.flush()
    return [existing[name] for name in names]


@router.get("", response_model=list[CommandOut])
def list_commands(
    group_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[CommandOut]:
    stmt = (
        select(Command)
        .options(selectinload(Command.tag_entities))
        .order_by(Command.updated_at.desc())
    )
    if group_id is not None:
        stmt = stmt.where(Command.group_id == group_id)
    return list(db.scalars(stmt).all())


@router.get("/paged", response_model=CommandsPageResponse)
def list_commands_paged(
    group_id: int | None = Query(default=None),
    is_favorite: bool | None = Query(default=None),
    q: str | None = Query(default=None),
    tag: list[str] | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CommandsPageResponse:
    where = []
    if group_id is not None:
        where.append(Command.group_id == group_id)
    if is_favorite is not None:
        where.append(Command.is_favorite == is_favorite)

    q_norm = (q or "").strip().lower()
    if q_norm:
        desc_col = func.coalesce(Command.description, "")
        where.append(
            or_(
                func.lower(Command.title).contains(q_norm),
                func.lower(Command.command).contains(q_norm),
                func.lower(desc_col).contains(q_norm),
            )
        )

    if tag:
        normalized = [t.strip().lower() for t in tag if (t or "").strip()]
        if normalized:
            where.append(Command.tag_entities.any(Tag.name.in_(normalized)))

    total_stmt = select(func.count(Command.id))
    if where:
        total_stmt = total_stmt.where(*where)
    total = int(db.scalar(total_stmt) or 0)

    stmt = (
        select(Command)
        .options(selectinload(Command.tag_entities))
        .order_by(Command.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if where:
        stmt = stmt.where(*where)

    items = list(db.scalars(stmt).all())
    return CommandsPageResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/stats", response_model=CommandStatsResponse)
def command_stats(db: Session = Depends(get_db)) -> CommandStatsResponse:
    total = int(db.scalar(select(func.count(Command.id))) or 0)
    favorites = int(
        db.scalar(select(func.count(Command.id)).where(Command.is_favorite == True))
        or 0
    )
    rows = db.execute(
        select(Command.group_id, func.count(Command.id)).group_by(Command.group_id)
    ).all()
    by_group = {int(group_id): int(cnt) for group_id, cnt in rows}
    return CommandStatsResponse(total=total, favorites=favorites, by_group=by_group)


@router.get("/top-copied", response_model=list[CommandOut])
def top_copied_commands(
    limit: int = Query(default=10, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[CommandOut]:
    stmt = (
        select(Command)
        .options(selectinload(Command.tag_entities))
        .order_by(Command.copy_count.desc(), Command.updated_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


@router.post("", response_model=CommandOut, status_code=status.HTTP_201_CREATED)
def create_command(payload: CommandCreate, db: Session = Depends(get_db)) -> CommandOut:
    group = db.get(Group, payload.group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Group does not exist"
        )

    cmd = Command(
        group_id=payload.group_id,
        title=payload.title,
        command=payload.command,
        description=payload.description,
        default_variables=payload.default_variables,
        is_favorite=payload.is_favorite,
        copy_count=payload.copy_count,
    )

    cmd.tag_entities = _get_or_create_tags(db, payload.tags)

    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return cmd


@router.get("/{command_id}", response_model=CommandOut)
def get_command(command_id: int, db: Session = Depends(get_db)) -> CommandOut:
    cmd = db.scalar(
        select(Command)
        .options(selectinload(Command.tag_entities))
        .where(Command.id == command_id)
    )
    if cmd is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Command not found"
        )
    return cmd


@router.patch("/{command_id}", response_model=CommandOut)
def update_command(
    command_id: int, payload: CommandUpdate, db: Session = Depends(get_db)
) -> CommandOut:
    cmd = db.scalar(
        select(Command)
        .options(selectinload(Command.tag_entities))
        .where(Command.id == command_id)
    )
    if cmd is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Command not found"
        )

    data = payload.model_dump(exclude_unset=True)

    prev_copy_count = cmd.copy_count

    if "group_id" in data and data["group_id"] is not None:
        group = db.get(Group, data["group_id"])
        if group is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Group does not exist"
            )

    if "tags" in data:
        if data["tags"] is None:
            cmd.tag_entities = []
        else:
            cmd.tag_entities = _get_or_create_tags(db, data["tags"])
        data.pop("tags", None)

    for key, value in data.items():
        setattr(cmd, key, value)

    if "copy_count" in data and data.get("copy_count") is not None:
        next_copy_count = int(cmd.copy_count or 0)
        if next_copy_count > int(prev_copy_count or 0):
            delta = next_copy_count - int(prev_copy_count or 0)
            db.add(CopyEvent(command_id=cmd.id, delta=delta))

    db.add(cmd)
    db.commit()
    db.refresh(cmd)
    return cmd


@router.delete("/{command_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_command(command_id: int, db: Session = Depends(get_db)) -> None:
    cmd = db.get(Command, command_id)
    if cmd is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Command not found"
        )

    db.delete(cmd)
    db.commit()
    return None
