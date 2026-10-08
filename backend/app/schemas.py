"""Pydantic request/response models: the API contract.

FastAPI uses these to validate input, serialise output and generate the OpenAPI docs at /docs.
Shape-level checks live here (types, ranges, lengths); DNS rules that need the zone or the
database live in services/ so they produce Route53-style InvalidChangeBatch errors.
"""
from __future__ import annotations

import re
from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field, field_validator

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA", "SOA"]
RoutingPolicy = Literal["simple", "weighted"]
ZoneType = Literal["public", "private"]
ChangeAction = Literal["CREATE", "UPSERT", "DELETE"]

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


# --------------------------------------------------------------------------- auth

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class SignupIn(BaseModel):
    email: str = Field(max_length=254, description="Used as the sign-in name")
    account_name: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8, max_length=128, description="At least 8 characters with a letter and a number")

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        # A simple shape check is enough for a mocked sign-up (no email is ever sent).
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Enter a valid email address, such as name@example.com")
        return v

    @field_validator("account_name")
    @classmethod
    def _account_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Account name is required")
        return v

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Password must contain at least one letter and one number")
        return v


class UserOut(BaseModel):
    username: str
    account_id: str
    account_name: str = ""
    is_demo: bool = False  # only the shared demo user gets seed data and "Reset demo data"


# --------------------------------------------------------------------------- zones

class Tag(BaseModel):
    key: str = Field(min_length=1, max_length=128)
    value: str = Field(default="", max_length=256)


class Vpc(BaseModel):
    vpc_id: str = Field(pattern=r"^vpc-[0-9a-f]{8,17}$", description="e.g. vpc-0a1b2c3d")
    region: str = Field(min_length=1, max_length=32)


class ZoneCreate(BaseModel):
    name: str = Field(max_length=255)
    type: ZoneType = "public"
    comment: str = Field(default="", max_length=256)
    vpc: Vpc | None = None
    tags: list[Tag] = Field(default_factory=list, max_length=50)


class ZoneUpdate(BaseModel):
    """Route53 only lets you change the comment (description) and tags; the domain name is immutable."""

    comment: str | None = Field(default=None, max_length=256)
    tags: list[Tag] | None = Field(default=None, max_length=50)


class ZoneOut(BaseModel):
    id: str
    name: str
    type: ZoneType
    comment: str
    record_count: int
    caller_reference: str
    created_by: str = "Route 53"
    created_at: str
    updated_at: str
    name_servers: list[str] = Field(default_factory=list)
    vpcs: list[Vpc] = Field(default_factory=list)
    tags: list[Tag] = Field(default_factory=list)


# --------------------------------------------------------------------------- records

class AliasTarget(BaseModel):
    dns_name: str = Field(min_length=1, max_length=255)
    evaluate_target_health: bool = False


class RecordSetIn(BaseModel):
    name: str = Field(default="", max_length=255, description="Relative ('www'), '@' or fully-qualified")
    type: RecordType
    ttl: int | None = Field(default=300, ge=0, le=2147483647)
    values: list[str] = Field(default_factory=list, max_length=400)
    routing_policy: RoutingPolicy = "simple"
    set_identifier: str | None = Field(default=None, max_length=128)
    weight: int | None = Field(default=None, ge=0, le=255)
    alias_target: AliasTarget | None = None
    health_check_id: str | None = Field(default=None, max_length=64)


class RecordSetUpdate(BaseModel):
    """Editing a record keeps its name, type and set identifier (they identify it), like the console."""

    ttl: int | None = Field(default=300, ge=0, le=2147483647)
    values: list[str] = Field(default_factory=list, max_length=400)
    weight: int | None = Field(default=None, ge=0, le=255)
    alias_target: AliasTarget | None = None
    health_check_id: str | None = Field(default=None, max_length=64)


class RecordSetOut(BaseModel):
    id: int
    name: str
    type: RecordType
    ttl: int | None
    values: list[str]
    routing_policy: RoutingPolicy
    set_identifier: str | None
    weight: int | None
    alias_target: AliasTarget | None
    health_check_id: str | None
    is_default: bool = Field(description="Apex NS/SOA created with the zone; cannot be deleted")
    created_at: str
    updated_at: str


class Change(BaseModel):
    action: ChangeAction
    record_set: RecordSetIn


class ChangeBatchIn(BaseModel):
    comment: str = Field(default="", max_length=256)
    changes: list[Change] = Field(min_length=1, max_length=1000)


class ChangeInfo(BaseModel):
    id: str
    status: Literal["PENDING", "INSYNC"]
    comment: str
    submitted_at: str
    submitted_by: str
    change_count: int


class BulkDeleteIn(BaseModel):
    record_ids: list[int] = Field(min_length=1, max_length=1000)


# --------------------------------------------------------------------------- import / export

class ImportIn(BaseModel):
    zone_file: str = Field(min_length=1, max_length=1_000_000)
    dry_run: bool = True
    overwrite: bool = Field(default=False, description="UPSERT records that already exist instead of skipping them")


class ImportRow(BaseModel):
    action: Literal["CREATE", "UPSERT", "SKIP"]
    name: str
    type: str
    ttl: int | None
    values: list[str]
    reason: str = ""


class ImportResult(BaseModel):
    dry_run: bool
    rows: list[ImportRow]
    created: int
    updated: int
    skipped: int
    change: ChangeInfo | None = None
