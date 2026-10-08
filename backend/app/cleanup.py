"""One-off cleanup: remove the demo-zone copies that sign-up used to add to new accounts (before D-78).

A copy is a zone in a signed-up account whose name AND description are exactly those of one of the demo
zones in seed.py. The shared demo account is left alone.

    python -m app.cleanup            # dry run: only counts what would be deleted
    python -m app.cleanup --apply    # deletes those zones (records, VPCs, tags and changes cascade)
"""
from __future__ import annotations

import sqlite3
import sys

from .config import settings
from .db import connect, transaction
from .dns.validation import normalize_zone_name
from .seed import DEMO_ZONES


def seeded_copies(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    demo = {(normalize_zone_name(z.name), z.comment) for z, _ in DEMO_ZONES}
    rows = conn.execute(
        """SELECT id, account_id, name, comment FROM hosted_zones
           WHERE account_id NOT IN (SELECT account_id FROM users WHERE username = ?)
           ORDER BY account_id, name""",
        (settings.demo_username,),
    ).fetchall()
    return [r for r in rows if (r["name"], r["comment"]) in demo]


def delete_seeded_copies(conn: sqlite3.Connection) -> int:
    with transaction(conn):
        rows = seeded_copies(conn)
        conn.executemany("DELETE FROM hosted_zones WHERE id = ?", [(r["id"],) for r in rows])
    return len(rows)


def main(argv: list[str]) -> None:
    conn = connect()
    rows = seeded_copies(conn)
    accounts = len({r["account_id"] for r in rows})
    print(f"{len(rows)} copied demo zone(s) in {accounts} signed-up account(s) in {settings.database_path}")
    if "--apply" in argv:
        print(f"Deleted {delete_seeded_copies(conn)} zone(s).")
    else:
        print("Dry run: nothing deleted. Run with --apply to delete them.")
    conn.close()


if __name__ == "__main__":
    main(sys.argv[1:])
