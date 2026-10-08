from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from ..config import settings
from ..db import get_db
from ..deps import CurrentUser, current_user
from ..schemas import LoginIn, SignupIn, UserOut
from ..services import auth as auth_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,          # not readable from JavaScript -> an XSS bug can't steal the session
        samesite="lax",         # not sent on cross-site POSTs -> basic CSRF protection
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: sqlite3.Connection = Depends(get_db)) -> UserOut:
    # Sign-in names are stored lower-case (emails are case-insensitive; the demo user is "demo").
    token, user = auth_service.login(db, body.username.strip().lower(), body.password)
    _set_session_cookie(response, token)
    return _user_out(user)


@router.post("/signup", response_model=UserOut, status_code=201)
def signup(body: SignupIn, response: Response, db: sqlite3.Connection = Depends(get_db)) -> UserOut:
    """Mocked sign-up: a new user (email + account name) in a new, empty account, then signed in."""
    user = auth_service.signup(db, body.email, body.account_name, body.password)
    _set_session_cookie(response, auth_service.create_session(db, user["id"]))
    return _user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)) -> Response:
    auth_service.logout(db, request.cookies.get(settings.session_cookie_name))
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser = Depends(current_user)) -> UserOut:
    return UserOut(username=user.username, account_id=user.account_id, account_name=user.account_name,
                   is_demo=user.is_demo)


def _user_out(user: sqlite3.Row) -> UserOut:
    return UserOut(username=user["username"], account_id=user["account_id"], account_name=user["account_name"],
                   is_demo=user["username"] == settings.demo_username)
