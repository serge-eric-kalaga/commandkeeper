from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_ready_user
from ..models import Group
from ..schemas import GroupCreate, GroupOut, GroupUpdate

router = APIRouter(
    prefix="/groups", tags=["groups"], dependencies=[Depends(require_ready_user)]
)


@router.get("", response_model=list[GroupOut])
def list_groups(db: Session = Depends(get_db)) -> list[GroupOut]:
    return list(db.scalars(select(Group).order_by(Group.name.asc())).all())


@router.post("", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(payload: GroupCreate, db: Session = Depends(get_db)) -> GroupOut:
    group = Group(
        name=payload.name,
        description=payload.description,
        color=payload.color,
        icon=payload.icon,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.get("/{group_id}", response_model=GroupOut)
def get_group(group_id: int, db: Session = Depends(get_db)) -> GroupOut:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
        )
    return group


@router.patch("/{group_id}", response_model=GroupOut)
def update_group(
    group_id: int, payload: GroupUpdate, db: Session = Depends(get_db)
) -> GroupOut:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
        )

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(group, key, value)

    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db)) -> None:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Group not found"
        )

    db.delete(group)
    db.commit()
    return None
