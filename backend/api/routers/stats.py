from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_ready_user
from ..models import Command, CopyEvent, Group, Tag
from ..schemas import DashboardStatsResponse

router = APIRouter(
    prefix="/stats", tags=["stats"], dependencies=[Depends(require_ready_user)]
)


def _default_range() -> tuple[dt.date, dt.date]:
    today = dt.date.today()
    return (today - dt.timedelta(days=30), today)


@router.get("/dashboard", response_model=DashboardStatsResponse)
def dashboard_stats(
    from_date: dt.date | None = Query(
        default=None, description="Start date (YYYY-MM-DD)"
    ),
    to_date: dt.date | None = Query(default=None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
) -> DashboardStatsResponse:
    if from_date is None or to_date is None:
        d0, d1 = _default_range()
        from_date = from_date or d0
        to_date = to_date or d1

    if from_date > to_date:
        from_date, to_date = to_date, from_date

    # Inclusive day range: [from 00:00, to+1day 00:00)
    start_dt = dt.datetime.combine(from_date, dt.time.min)
    end_dt = dt.datetime.combine(to_date + dt.timedelta(days=1), dt.time.min)

    commands = int(db.scalar(select(func.count(Command.id))) or 0)
    groups = int(db.scalar(select(func.count(Group.id))) or 0)
    tags = int(db.scalar(select(func.count(Tag.id))) or 0)

    copies_stmt = select(func.coalesce(func.sum(CopyEvent.delta), 0)).where(
        CopyEvent.created_at >= start_dt,
        CopyEvent.created_at < end_dt,
    )
    copies = int(db.scalar(copies_stmt) or 0)

    return DashboardStatsResponse(
        commands=commands,
        groups=groups,
        tags=tags,
        copies=copies,
        from_date=from_date,
        to_date=to_date,
    )
