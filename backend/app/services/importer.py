"""Zone-file import: parse -> plan -> apply through the change-batch engine."""
from __future__ import annotations

import sqlite3

from ..dns.validation import DnsValidationError, normalize_values
from ..dns.zonefile import parse_zone_file
from ..schemas import Change, ImportResult, ImportRow, RecordSetIn
from .changes import apply_changes


def import_zone_file(
    conn: sqlite3.Connection,
    zone: sqlite3.Row,
    text: str,
    *,
    dry_run: bool,
    overwrite: bool,
    submitted_by: str,
) -> ImportResult:
    parsed = parse_zone_file(text, zone["name"])
    existing: set[tuple[str, str]] = set()
    weighted: set[tuple[str, str]] = set()
    for r in conn.execute("SELECT name, type, routing_policy FROM record_sets WHERE zone_id = ?", (zone["id"],)):
        (weighted if r["routing_policy"] == "weighted" else existing).add((r["name"], r["type"]))

    rows: list[ImportRow] = []
    changes: list[Change] = []
    for p in parsed:
        values = p["values"]
        if not p["skip_reason"]:
            try:
                values = normalize_values(p["type"], values)
            except DnsValidationError as e:
                rows.append(ImportRow(action="SKIP", name=p["name"], type=p["type"], ttl=p["ttl"], values=p["values"],
                                      reason=str(e)))
                continue
        if p["skip_reason"]:
            rows.append(ImportRow(action="SKIP", name=p["name"], type=p["type"], ttl=p["ttl"], values=values,
                                  reason=p["skip_reason"]))
            continue
        if (p["name"], p["type"]) in weighted:
            # A zone file has no routing policies, so it can't replace weighted records (even with overwrite).
            rows.append(ImportRow(action="SKIP", name=p["name"], type=p["type"], ttl=p["ttl"], values=values,
                                  reason="Weighted records already exist for this name and type"))
            continue
        exists = (p["name"], p["type"]) in existing
        if exists and not overwrite:
            rows.append(ImportRow(action="SKIP", name=p["name"], type=p["type"], ttl=p["ttl"], values=values,
                                  reason="A record with this name and type already exists"))
            continue
        action = "UPSERT" if exists else "CREATE"
        rows.append(ImportRow(action=action, name=p["name"], type=p["type"], ttl=p["ttl"], values=values))
        changes.append(Change(action=action, record_set=RecordSetIn(name=p["name"], type=p["type"], ttl=p["ttl"],
                                                                    values=values)))

    change = None
    if changes:
        # Runs the real validation (CNAME conflicts etc.) even for a dry run, then rolls back.
        change, _ = apply_changes(conn, zone, changes, submitted_by=submitted_by,
                                  comment="Imported zone file", dry_run=dry_run)
    return ImportResult(
        dry_run=dry_run,
        rows=rows,
        created=sum(r.action == "CREATE" for r in rows),
        updated=sum(r.action == "UPSERT" for r in rows),
        skipped=sum(r.action == "SKIP" for r in rows),
        change=change,
    )
