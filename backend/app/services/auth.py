"""Mocked authentication with real server-side sessions.

Why server-side sessions instead of JWT here:
  * Logout must actually end the session. With a JWT the token stays valid until it expires
    unless you add a deny-list, which is a session table anyway.
  * The token is an opaque random string in an HttpOnly cookie, so page JavaScript can't read it (XSS-safe),
    and there's nothing to decode or forge.
  * Single backend + single DB: no need for stateless tokens.
"""
from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

import bcrypt

from ..config import settings
from ..db import transaction
from ..errors import ApiError


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def ensure_user(conn: sqlite3.Connection, username: str, password: str, account_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row:
        return row
    with transaction(conn):
        conn.execute(
            "INSERT INTO users (username, password_hash, account_id) VALUES (?, ?, ?)",
            (username, hash_password(password), account_id),
        )
    return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def login(conn: sqlite3.Connection, username: str, password: str) -> tuple[str, sqlite3.Row]:
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    # Same error for unknown user and wrong password, so the API doesn't reveal which usernames exist.
    if not user or not verify_password(password, user["password_hash"]):
        raise ApiError(401, "InvalidCredentials", "Your authentication information is incorrect. Please try again.")
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(hours=settings.session_ttl_hours)
    with transaction(conn):
        # Opportunistic cleanup of expired sessions keeps the table small without a cron job.
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (_iso(_now()),))
        conn.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user["id"], _iso(expires)),
        )
    return token, user


def logout(conn: sqlite3.Connection, token: str | None) -> None:
    if token:
        with transaction(conn):
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def user_for_token(conn: sqlite3.Connection, token: str | None) -> sqlite3.Row | None:
    if not token:
        return None
    return conn.execute(
        """SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token = ? AND s.expires_at > ?""",
        (token, _iso(_now())),
    ).fetchone()
