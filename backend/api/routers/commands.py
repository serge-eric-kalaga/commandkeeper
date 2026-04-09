from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import require_ready_user
from ..models import Command, Group, Tag
from ..schemas import CommandCreate, CommandOut, CommandUpdate

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
