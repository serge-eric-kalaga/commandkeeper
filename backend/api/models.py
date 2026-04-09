from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)

    description: Mapped[str | None] = mapped_column(Text, default=None)
    color: Mapped[str] = mapped_column(String(16), default="#3b82f6")
    icon: Mapped[str] = mapped_column(String(8), default="📁")

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    commands: Mapped[list[Command]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


command_tags = Table(
    "command_tags",
    Base.metadata,
    Column(
        "command_id",
        ForeignKey("commands.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    commands: Mapped[list[Command]] = relationship(
        secondary=command_tags,
        back_populates="tag_entities",
    )


class Command(Base):
    __tablename__ = "commands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )

    title: Mapped[str] = mapped_column(String(160), index=True)
    command: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text, default=None)

    default_variables: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)

    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    copy_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    group: Mapped[Group] = relationship(back_populates="commands")

    tag_entities: Mapped[list[Tag]] = relationship(
        secondary=command_tags,
        back_populates="commands",
        lazy="selectin",
    )

    @property
    def tags(self) -> list[str]:
        return sorted({t.name for t in self.tag_entities})
