"""SQLite access layer.

One connection per request (opened in a FastAPI dependency, closed afterwards).
SQLite connections are cheap to open, and per-request connections avoid sharing
a connection across threads.

Why these PRAGMAs:
  * foreign_keys=ON  - SQLite does NOT enforce foreign keys unless asked, on every connection.
  * journal_mode=WAL - readers don't block the single writer; better for a web app.
  * busy_timeout     - wait up to 5s for a lock instead of failing immediately with "database is locked".
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from .config import settings

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(path: str | None = None) -> sqlite3.Connection:
    db_path = path or settings.database_path
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    # isolation_level=None -> autocommit mode; we open transactions explicitly with BEGIN IMMEDIATE.
    conn = sqlite3.connect(db_path, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    if db_path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """All-or-nothing block.

    BEGIN IMMEDIATE takes the write lock up front, so two concurrent change batches
    can't both read the same state and then both write (no lost updates / upgrade deadlocks).
    """
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text())
    # CREATE TABLE IF NOT EXISTS doesn't add new columns to an existing table, so older databases
    # (like the one on the Railway volume) get users.account_name here. Safe to run on every start.
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
    if "account_name" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN account_name TEXT NOT NULL DEFAULT ''")


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
