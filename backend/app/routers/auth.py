from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from ..config import settings
from ..db import get_db
from ..deps import CurrentUser, current_user
from ..schemas import LoginIn, UserOut
from ..services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: sqlite3.Connection = Depends(get_db)) -> UserOut:
    token, user = auth_service.login(db, body.username.strip(), body.password)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,          # not readable from JavaScript -> an XSS bug can't steal the session
        samesite="lax",         # not sent on cross-site POSTs -> basic CSRF protection
        secure=settings.cookie_secure,
        path="/",
    )
    return UserOut(username=user["username"], account_id=user["account_id"])


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)) -> Response:
    auth_service.logout(db, request.cookies.get(settings.session_cookie_name))
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser = Depends(current_user)) -> UserOut:
    return UserOut(username=user.username, account_id=user.account_id)
