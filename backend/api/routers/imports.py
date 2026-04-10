from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_ready_user
from ..models import Command, Group, Tag


class ImportGroup(BaseModel):
    source_id: int
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    color: str = Field(default="#3b82f6", min_length=1, max_length=16)
    icon: str = Field(default="📁", min_length=1, max_length=8)


class ImportCommand(BaseModel):
    source_group_id: int
    title: str = Field(min_length=1, max_length=160)
    command: str = Field(min_length=1)
    description: str | None = None
    default_variables: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    is_favorite: bool = False
    copy_count: int = Field(default=0, ge=0)


class ImportRequest(BaseModel):
    groups: list[ImportGroup] = Field(default_factory=list)
    commands: list[ImportCommand] = Field(default_factory=list)


class ImportResponse(BaseModel):
    groups_created: int
    commands_created: int


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


router = APIRouter(
    prefix="/import",
    tags=["import"],
    dependencies=[Depends(require_ready_user)],
)


@router.post("", response_model=ImportResponse, status_code=status.HTTP_200_OK)
def import_vault(
    payload: ImportRequest, db: Session = Depends(get_db)
) -> ImportResponse:
    if not payload.groups and not payload.commands:
        return ImportResponse(groups_created=0, commands_created=0)

    group_id_map: dict[int, int] = {}

    try:
        for g in payload.groups:
            group = Group(
                name=g.name,
                description=g.description,
                color=g.color,
                icon=g.icon,
            )
            db.add(group)
            db.flush()  # assign id
            group_id_map[g.source_id] = group.id

        for c in payload.commands:
            new_group_id = group_id_map.get(c.source_group_id)
            if new_group_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Import references an unknown group",
                )

            cmd = Command(
                group_id=new_group_id,
                title=c.title,
                command=c.command,
                description=c.description,
                default_variables=c.default_variables,
                is_favorite=c.is_favorite,
                copy_count=c.copy_count,
            )
            cmd.tag_entities = _get_or_create_tags(db, c.tags)
            db.add(cmd)

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Import failed",
        )

    return ImportResponse(
        groups_created=len(payload.groups),
        commands_created=len(payload.commands),
    )
