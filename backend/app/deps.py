"""Shared FastAPI dependencies."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass

from fastapi import Depends, Request

from .config import settings
from .db import get_db
from .errors import ApiError
from .services import auth as auth_service


@dataclass(frozen=True)
class CurrentUser:
    id: int
    username: str
    account_id: str
    account_name: str

    @property
    def is_demo(self) -> bool:
        return self.username == settings.demo_username


def current_user(request: Request, db: sqlite3.Connection = Depends(get_db)) -> CurrentUser:
    token = request.cookies.get(settings.session_cookie_name)
    user = auth_service.user_for_token(db, token)
    if not user:
        raise ApiError(401, "NotAuthenticated", "Your session has expired. Sign in again.")
    return CurrentUser(id=user["id"], username=user["username"], account_id=user["account_id"],
                       account_name=user["account_name"])
