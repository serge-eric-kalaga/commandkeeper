from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


class UserPublic(BaseModel):
    id: int
    username: str
    must_change_password: bool

    model_config = {"from_attributes": True}


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    color: str = Field(default="#3b82f6", min_length=1, max_length=16)
    icon: str = Field(default="📁", min_length=1, max_length=8)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    color: str | None = Field(default=None, min_length=1, max_length=16)
    icon: str | None = Field(default=None, min_length=1, max_length=8)


class GroupOut(BaseModel):
    id: int
    name: str
    description: str | None
    color: str
    icon: str
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class CommandCreate(BaseModel):
    group_id: int
    title: str = Field(min_length=1, max_length=160)
    command: str = Field(min_length=1)
    description: str | None = None
    default_variables: dict[str, str] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    is_favorite: bool = False
    copy_count: int = Field(default=0, ge=0)


class CommandUpdate(BaseModel):
    group_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=160)
    command: str | None = Field(default=None, min_length=1)
    description: str | None = None
    default_variables: dict[str, str] | None = None
    tags: list[str] | None = None
    is_favorite: bool | None = None
    copy_count: int | None = Field(default=None, ge=0)


class CommandOut(BaseModel):
    id: int
    group_id: int
    title: str
    command: str
    description: str | None
    default_variables: dict[str, str]
    tags: list[str]
    is_favorite: bool
    copy_count: int
    created_at: dt.datetime
    updated_at: dt.datetime

    model_config = {"from_attributes": True}


class CommandsPageResponse(BaseModel):
    items: list[CommandOut]
    total: int
    limit: int
    offset: int


class CommandStatsResponse(BaseModel):
    total: int
    favorites: int
    by_group: dict[int, int]


class SearchResponse(BaseModel):
    items: list[CommandOut]


class DashboardStatsResponse(BaseModel):
    commands: int
    groups: int
    tags: int
    copies: int
    from_date: dt.date
    to_date: dt.date
