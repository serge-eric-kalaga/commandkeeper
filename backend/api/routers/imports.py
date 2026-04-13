from __future__ import annotations

import re

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


class HistoryImportRequest(BaseModel):
    group_id: int
    history: str = Field(min_length=1)
    tags: list[str] = Field(default_factory=list)


class HistoryImportPreviewItem(BaseModel):
    command: str
    status: str  # new | duplicate | noise
    reason: str | None = None


class HistoryImportPreviewResponse(BaseModel):
    total_lines: int
    parsed: int
    created_candidates: int
    duplicate_candidates: int
    noise_candidates: int
    truncated: bool
    items: list[HistoryImportPreviewItem]


class HistoryImportResponse(BaseModel):
    created: int
    skipped_duplicates: int
    skipped_noise: int
    total_lines: int
    parsed: int


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


_WS_RE = re.compile(r"\s+")


def _normalize_history_line(raw: str) -> str:
    line = (raw or "").strip()
    if not line:
        return ""

    # zsh format: ": 1712345678:0;the command"
    if line.startswith(":") and ";" in line:
        line = line.split(";", 1)[1].strip()

    return line


def _normalize_command_text(cmd: str) -> str:
    cmd = (cmd or "").strip()
    cmd = _WS_RE.sub(" ", cmd)
    return cmd


def _is_noise_command(cmd: str) -> tuple[bool, str | None]:
    if not cmd:
        return True, "empty"

    if cmd.startswith("#"):
        return True, "comment"

    if len(cmd) < 3:
        return True, "too short"

    first = cmd.split(" ", 1)[0].lower()

    # common noise commands in history
    if first in {"cd", "ls", "pwd", "clear", "exit", "history", "alias", "unalias"}:
        return True, f"noise: {first}"

    return False, None


def _make_title_from_command(cmd: str) -> str:
    tokens = cmd.split(" ")
    if not tokens:
        return "Imported command"

    if len(tokens) == 1:
        base = tokens[0]
    else:
        base = f"{tokens[0]} {tokens[1]}".strip()

    if len(base) < 3:
        base = tokens[0]

    # Keep within schema max_length=160
    return base[:160]


def _preview_history_import(
    db: Session,
    history: str,
    max_items: int = 300,
) -> tuple[list[HistoryImportPreviewItem], int, int, int, int, int, bool]:
    lines = history.splitlines()
    total_lines = len(lines)

    existing = {
        _normalize_command_text(cmd)
        for cmd in db.scalars(select(Command.command)).all()
        if _normalize_command_text(cmd)
    }

    seen_in_payload: set[str] = set()
    items: list[HistoryImportPreviewItem] = []

    parsed = 0
    created_candidates = 0
    duplicate_candidates = 0
    noise_candidates = 0
    truncated = False

    for raw in lines:
        normalized_line = _normalize_history_line(raw)
        normalized_cmd = _normalize_command_text(normalized_line)
        if not normalized_cmd:
            continue

        parsed += 1

        is_noise, reason = _is_noise_command(normalized_cmd)
        if is_noise:
            noise_candidates += 1
            if len(items) < max_items:
                items.append(
                    HistoryImportPreviewItem(
                        command=normalized_cmd,
                        status="noise",
                        reason=reason,
                    )
                )
            else:
                truncated = True
            continue

        if normalized_cmd in seen_in_payload:
            duplicate_candidates += 1
            if len(items) < max_items:
                items.append(
                    HistoryImportPreviewItem(
                        command=normalized_cmd,
                        status="duplicate",
                        reason="duplicate in history",
                    )
                )
            else:
                truncated = True
            continue

        seen_in_payload.add(normalized_cmd)

        if normalized_cmd in existing:
            duplicate_candidates += 1
            if len(items) < max_items:
                items.append(
                    HistoryImportPreviewItem(
                        command=normalized_cmd,
                        status="duplicate",
                        reason="already exists",
                    )
                )
            else:
                truncated = True
            continue

        created_candidates += 1
        if len(items) < max_items:
            items.append(HistoryImportPreviewItem(command=normalized_cmd, status="new"))
        else:
            truncated = True

    return items, total_lines, parsed, created_candidates, duplicate_candidates, noise_candidates, truncated


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


@router.post("/history/preview", response_model=HistoryImportPreviewResponse, status_code=status.HTTP_200_OK)
def preview_history_import(payload: HistoryImportRequest, db: Session = Depends(get_db)) -> HistoryImportPreviewResponse:
    group = db.get(Group, payload.group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group does not exist")

    items, total_lines, parsed, created, dupes, noise, truncated = _preview_history_import(
        db=db,
        history=payload.history,
    )

    return HistoryImportPreviewResponse(
        total_lines=total_lines,
        parsed=parsed,
        created_candidates=created,
        duplicate_candidates=dupes,
        noise_candidates=noise,
        truncated=truncated,
        items=items,
    )


@router.post("/history", response_model=HistoryImportResponse, status_code=status.HTTP_200_OK)
def import_history(payload: HistoryImportRequest, db: Session = Depends(get_db)) -> HistoryImportResponse:
    group = db.get(Group, payload.group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group does not exist")

    items, total_lines, parsed, created, dupes, noise, _truncated = _preview_history_import(
        db=db,
        history=payload.history,
        max_items=10_000_000,  # no truncation for actual import
    )

    tags = _normalize_tags(payload.tags)

    try:
        for item in items:
            if item.status != "new":
                continue

            cmd = Command(
                group_id=payload.group_id,
                title=_make_title_from_command(item.command),
                command=item.command,
                description=None,
                default_variables={},
                is_favorite=False,
                copy_count=0,
            )
            cmd.tag_entities = _get_or_create_tags(db, tags)
            db.add(cmd)

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Import failed")

    return HistoryImportResponse(
        created=created,
        skipped_duplicates=dupes,
        skipped_noise=noise,
        total_lines=total_lines,
        parsed=parsed,
    )
