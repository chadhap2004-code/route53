"""Write side for DNS records: an atomic change-batch engine.

Mirrors Route53's ChangeResourceRecordSets API: a batch is a list of CREATE / UPSERT / DELETE
actions that is applied all-or-nothing. Every record write in the app (single create, edit,
delete, bulk delete, zone-file import) goes through `apply_changes`, so the Route53 rules are
enforced in exactly one place.

How it works:
  1. Open a write transaction (BEGIN IMMEDIATE).
  2. Apply changes one by one. Each change is validated against the database state *including
     earlier changes in the same batch*, so "DELETE the CNAME, then CREATE an A record with the
     same name" is valid in one batch, exactly like Route53.
  3. If any change fails, collect all messages, roll back, and raise InvalidChangeBatch.
  4. dry_run=True runs the same code and then rolls back: the import preview can never disagree
     with what the real import would do.
"""
from __future__ import annotations

import json
import secrets
import sqlite3
import string
from dataclasses import asdict, dataclass

from ..db import transaction
from ..dns.validation import (
    ALIAS_CAPABLE_TYPES,
    DnsValidationError,
    ensure_in_zone,
    is_valid_hostname,
    normalize_record_name,
    normalize_values,
)
from ..errors import invalid_change_batch
from ..schemas import Change, ChangeInfo, RecordSetIn

_ID_ALPHABET = string.ascii_uppercase + string.digits


def new_change_id() -> str:
    return "C" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(13))


@dataclass
class PreparedRecord:
    """A record set after normalisation: exactly what will be stored."""

    name: str
    type: str
    ttl: int | None
    values: list[str]
    routing_policy: str
    set_identifier: str  # '' for simple routing
    weight: int | None
    alias_dns_name: str | None
    alias_evaluate_health: bool
    health_check_id: str | None

    def label(self) -> str:
        sid = f", SetIdentifier='{self.set_identifier}'" if self.set_identifier else ""
        return f"[name='{self.name}', type='{self.type}'{sid}]"


class _DryRun(Exception):
    """Raised inside the transaction to force a rollback after a successful dry run."""


def prepare(rs: RecordSetIn, zone_name: str, for_delete: bool = False) -> PreparedRecord:
    """Normalise and validate a record set on its own (no database lookups).

    for_delete: a DELETE may omit values ("delete whatever is stored under this name/type/id").
    """
    name = normalize_record_name(rs.name, zone_name)
    ensure_in_zone(name, zone_name)
    rtype = rs.type
    errors: list[str] = []

    # Routing policy
    set_id = (rs.set_identifier or "").strip()
    weight = rs.weight
    if rs.routing_policy == "simple":
        if set_id:
            errors.append("Simple routing records cannot have a record ID (set identifier)")
        weight = None
    else:  # weighted
        if not set_id:
            errors.append("Weighted records require a record ID (set identifier)")
        if weight is None:
            errors.append("Weighted records require a weight between 0 and 255")

    # Alias vs plain values
    alias_name: str | None = None
    values: list[str] = []
    ttl = rs.ttl
    if rs.alias_target:
        if rtype not in ALIAS_CAPABLE_TYPES:
            errors.append(f"Alias records are not supported for type {rtype}")
        alias_name = rs.alias_target.dns_name.strip().lower()
        if not alias_name.endswith("."):
            alias_name += "."
        if not is_valid_hostname(alias_name):
            errors.append(f"Alias target '{rs.alias_target.dns_name}' is not a valid DNS name")
        if alias_name == name:
            errors.append("An alias record cannot point to itself")
        if any(v.strip() for v in rs.values):
            errors.append("Alias records cannot also have values")
        ttl = None  # alias records inherit the target's TTL in Route53
    elif for_delete and not any(v.strip() for v in rs.values):
        values = []
    else:
        if ttl is None:
            errors.append("TTL is required for non-alias records")
        try:
            values = normalize_values(rtype, rs.values)
        except DnsValidationError as e:
            errors.append(str(e))

    # Type/name rules that don't need the database
    if rtype == "CNAME" and name == zone_name:
        errors.append(f"Bad request: a CNAME record is not permitted at the zone apex ({zone_name})")
    if rtype in ("SOA",) and name != zone_name:
        errors.append("SOA records can only exist at the zone apex")
    if rtype == "NS" and name.startswith("*."):
        errors.append("NS records cannot be wildcards")

    if errors:
        raise DnsValidationError("; ".join(errors))

    return PreparedRecord(
        name=name,
        type=rtype,
        ttl=ttl,
        values=values,
        routing_policy=rs.routing_policy,
        set_identifier=set_id,
        weight=weight,
        alias_dns_name=alias_name,
        alias_evaluate_health=bool(rs.alias_target and rs.alias_target.evaluate_target_health),
        health_check_id=(rs.health_check_id or None),
    )


# --------------------------------------------------------------------------- DB helpers

def _find(conn: sqlite3.Connection, zone_id: str, p: PreparedRecord) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM record_sets WHERE zone_id = ? AND name = ? AND type = ? AND set_identifier = ?",
        (zone_id, p.name, p.type, p.set_identifier),
    ).fetchone()


def _current_values(conn: sqlite3.Connection, record_set_id: int) -> list[str]:
    return [
        r["value"]
        for r in conn.execute(
            "SELECT value FROM resource_records WHERE record_set_id = ? ORDER BY position", (record_set_id,)
        )
    ]


def _check_conflicts(conn: sqlite3.Connection, zone_id: str, p: PreparedRecord, self_id: int | None) -> None:
    """Rules that depend on other records at the same name."""
    others = conn.execute(
        "SELECT id, type, set_identifier, routing_policy FROM record_sets WHERE zone_id = ? AND name = ? AND id IS NOT ?",
        (zone_id, p.name, self_id),
    ).fetchall()

    # CNAME exclusivity (RFC 1034 s3.6.2): a name with a CNAME can have no other data.
    if p.type == "CNAME":
        clash = next((o for o in others if o["type"] != "CNAME"), None)
        if clash:
            raise DnsValidationError(
                f"RRSet of type CNAME with DNS name {p.name} is not permitted because a conflicting RRSet "
                f"of type {clash['type']} with the same DNS name already exists in zone"
            )
    else:
        if any(o["type"] == "CNAME" for o in others):
            raise DnsValidationError(
                f"RRSet of type {p.type} with DNS name {p.name} is not permitted because a conflicting RRSet "
                "of type CNAME with the same DNS name already exists in zone"
            )

    # Routing policy consistency: one simple record per name+type, or N weighted ones, never both.
    same_type = [o for o in others if o["type"] == p.type]
    if same_type:
        if p.routing_policy == "simple":
            raise DnsValidationError(
                f"Tried to create resource record set {p.label()} but records with a different routing policy "
                "or record ID already exist for this name and type"
            )
        if any(o["routing_policy"] != "weighted" for o in same_type):
            raise DnsValidationError(
                f"Tried to create weighted record {p.label()} but a simple routing record already exists "
                "for this name and type"
            )


def _insert(conn: sqlite3.Connection, zone_id: str, p: PreparedRecord) -> int:
    cur = conn.execute(
        """INSERT INTO record_sets (zone_id, name, type, ttl, routing_policy, set_identifier, weight,
                                    alias_dns_name, alias_evaluate_health, health_check_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (zone_id, p.name, p.type, p.ttl, p.routing_policy, p.set_identifier, p.weight,
         p.alias_dns_name, int(p.alias_evaluate_health), p.health_check_id),
    )
    rid = cur.lastrowid
    _write_values(conn, rid, p.values)
    return rid


def _update(conn: sqlite3.Connection, record_id: int, p: PreparedRecord) -> None:
    conn.execute(
        """UPDATE record_sets SET ttl = ?, weight = ?, alias_dns_name = ?, alias_evaluate_health = ?,
                  health_check_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
           WHERE id = ?""",
        (p.ttl, p.weight, p.alias_dns_name, int(p.alias_evaluate_health), p.health_check_id, record_id),
    )
    conn.execute("DELETE FROM resource_records WHERE record_set_id = ?", (record_id,))
    _write_values(conn, record_id, p.values)


def _write_values(conn: sqlite3.Connection, record_id: int, values: list[str]) -> None:
    conn.executemany(
        "INSERT INTO resource_records (record_set_id, position, value) VALUES (?, ?, ?)",
        [(record_id, i, v) for i, v in enumerate(values)],
    )


# --------------------------------------------------------------------------- engine

def _apply_one(conn: sqlite3.Connection, zone: sqlite3.Row, action: str, p: PreparedRecord) -> int | None:
    zone_id, zone_name = zone["id"], zone["name"]
    existing = _find(conn, zone_id, p)
    is_apex_default = p.name == zone_name and p.type in ("NS", "SOA")

    if action == "CREATE":
        if existing:
            raise DnsValidationError(f"Tried to create resource record set {p.label()} but it already exists")
        if p.type == "SOA":
            raise DnsValidationError("A hosted zone can only have one SOA record; edit the existing one instead")
        _check_conflicts(conn, zone_id, p, None)
        return _insert(conn, zone_id, p)

    if action == "UPSERT":
        if existing:
            if existing["routing_policy"] != p.routing_policy:
                raise DnsValidationError(f"Cannot change the routing policy of {p.label()}; delete and recreate it")
            if is_apex_default and p.alias_dns_name:
                raise DnsValidationError(f"The zone's {p.type} record cannot be converted to an alias")
            _update(conn, existing["id"], p)
            return existing["id"]
        if p.type == "SOA":
            raise DnsValidationError("A hosted zone can only have one SOA record; edit the existing one instead")
        _check_conflicts(conn, zone_id, p, None)
        return _insert(conn, zone_id, p)

    # DELETE
    if not existing:
        raise DnsValidationError(f"Tried to delete resource record set {p.label()} but it was not found")
    if is_apex_default:
        if p.type == "NS":
            raise DnsValidationError("A HostedZone must contain at least one NS record for the zone itself.")
        raise DnsValidationError("A HostedZone must contain exactly one SOA record.")
    # Route53 requires a DELETE to match the current values exactly (protects against deleting
    # a record someone else just changed). Empty values = "delete whatever is there" (used by the UI by id).
    if p.values and sorted(p.values) != sorted(_current_values(conn, existing["id"])):
        raise DnsValidationError(
            f"Tried to delete resource record set {p.label()} but the values provided do not match the current values"
        )
    conn.execute("DELETE FROM record_sets WHERE id = ?", (existing["id"],))
    return None


def apply_changes(
    conn: sqlite3.Connection,
    zone: sqlite3.Row,
    changes: list[Change],
    *,
    submitted_by: str,
    comment: str = "",
    dry_run: bool = False,
) -> tuple[ChangeInfo | None, list[int | None]]:
    """Apply a batch atomically. Returns (change info, affected record ids in order)."""
    prepared: list[tuple[str, PreparedRecord]] = []
    errors: list[str] = []
    for i, ch in enumerate(changes):
        try:
            p = prepare(ch.record_set, zone["name"], for_delete=ch.action == "DELETE")
            prepared.append((ch.action, p))
        except DnsValidationError as e:
            errors.append(_prefix(i, len(changes), str(e)))
    if errors:
        raise invalid_change_batch(errors)

    change_id = new_change_id()
    ids: list[int | None] = []
    try:
        with transaction(conn):
            for i, (action, p) in enumerate(prepared):
                try:
                    ids.append(_apply_one(conn, zone, action, p))
                except DnsValidationError as e:
                    errors.append(_prefix(i, len(prepared), str(e)))
                except sqlite3.IntegrityError:
                    # Second line of defence: the UNIQUE constraint caught a duplicate within the batch.
                    errors.append(_prefix(i, len(prepared), f"Duplicate record {p.label()} in this change batch"))
            if errors:
                raise invalid_change_batch(errors)
            if dry_run:
                raise _DryRun()
            conn.execute(
                "INSERT INTO change_batches (id, zone_id, comment, status, submitted_by) VALUES (?, ?, ?, 'INSYNC', ?)",
                (change_id, zone["id"], comment, submitted_by),
            )
            conn.executemany(
                "INSERT INTO change_items (batch_id, action, name, type, snapshot) VALUES (?, ?, ?, ?, ?)",
                [(change_id, a, p.name, p.type, json.dumps(asdict(p))) for a, p in prepared],
            )
            conn.execute(
                "UPDATE hosted_zones SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?",
                (zone["id"],),
            )
    except _DryRun:
        return None, ids

    row = conn.execute("SELECT * FROM change_batches WHERE id = ?", (change_id,)).fetchone()
    return change_info(row, len(prepared)), ids


def _prefix(i: int, n: int, msg: str) -> str:
    return msg if n == 1 else f"Change {i + 1}: {msg}"


def change_info(row: sqlite3.Row, count: int) -> ChangeInfo:
    return ChangeInfo(
        id=row["id"],
        status=row["status"],
        comment=row["comment"],
        submitted_at=row["submitted_at"],
        submitted_by=row["submitted_by"],
        change_count=count,
    )


def list_changes(conn: sqlite3.Connection, zone_id: str, limit: int = 50) -> list[ChangeInfo]:
    rows = conn.execute(
        """SELECT cb.*, (SELECT COUNT(*) FROM change_items ci WHERE ci.batch_id = cb.id) AS n
           FROM change_batches cb WHERE cb.zone_id = ? ORDER BY cb.submitted_at DESC, cb.rowid DESC LIMIT ?""",
        (zone_id, limit),
    ).fetchall()
    return [change_info(r, r["n"]) for r in rows]
