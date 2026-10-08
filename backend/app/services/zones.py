"""Hosted zone business logic."""
from __future__ import annotations

import hashlib
import secrets
import sqlite3
import string
import uuid

from ..db import transaction
from ..dns.validation import DnsValidationError, normalize_zone_name
from ..errors import ApiError, not_found
from ..schemas import Tag, Vpc, ZoneCreate, ZoneOut, ZoneUpdate
from .changes import new_change_id
from .records import escape_like

_ID_ALPHABET = string.ascii_uppercase + string.digits

DEFAULT_NS_TTL = 172800  # Route53 defaults
DEFAULT_SOA_TTL = 900

ZONE_SORTS = {
    "name": "z.name",
    "type": "z.is_private",
    "record_count": "record_count",
    "created_at": "z.created_at",
    "comment": "z.comment",
}


def new_zone_id() -> str:
    # Real IDs look like Z0412345ABCDEFGHIJKL / Z1D633PJN98FT9.
    return "Z0" + "".join(secrets.choice(_ID_ALPHABET) for _ in range(18))


def delegation_set(zone_id: str) -> list[str]:
    """Four name servers in Route53's pattern, one per TLD.

    Real Route53 splits ns-0..2047 into four ranges: .com 0-511, .net 512-1023,
    .org 1024-1535, .co.uk 1536-2047. Derived from a hash of the zone id so it's stable.
    """
    h = hashlib.sha256(zone_id.encode()).digest()
    servers = []
    for i, (tld, base) in enumerate(((".com", 0), (".net", 512), (".org", 1024), (".co.uk", 1536))):
        n = base + int.from_bytes(h[i * 2: i * 2 + 2], "big") % 512
        servers.append(f"ns-{n}.awsdns-{h[8 + i] % 64:02d}{tld}.")
    return servers


def _row_to_out(conn: sqlite3.Connection, z: sqlite3.Row) -> ZoneOut:
    ns_row = conn.execute(
        "SELECT id FROM record_sets WHERE zone_id = ? AND name = ? AND type = 'NS' AND set_identifier = ''",
        (z["id"], z["name"]),
    ).fetchone()
    name_servers = []
    if ns_row:
        name_servers = [r["value"] for r in conn.execute(
            "SELECT value FROM resource_records WHERE record_set_id = ? ORDER BY position", (ns_row["id"],))]
    vpcs = [Vpc(vpc_id=r["vpc_id"], region=r["vpc_region"]) for r in conn.execute(
        "SELECT vpc_id, vpc_region FROM zone_vpcs WHERE zone_id = ?", (z["id"],))]
    tags = [Tag(key=r["key"], value=r["value"]) for r in conn.execute(
        "SELECT key, value FROM zone_tags WHERE zone_id = ? ORDER BY key", (z["id"],))]
    count = z["record_count"] if "record_count" in z.keys() else conn.execute(
        "SELECT COUNT(*) FROM record_sets WHERE zone_id = ?", (z["id"],)).fetchone()[0]
    return ZoneOut(
        id=z["id"],
        name=z["name"],
        type="private" if z["is_private"] else "public",
        comment=z["comment"],
        record_count=count,
        caller_reference=z["caller_reference"],
        created_at=z["created_at"],
        updated_at=z["updated_at"],
        name_servers=name_servers,
        vpcs=vpcs,
        tags=tags,
    )


def get_zone_row(conn: sqlite3.Connection, account_id: str, zone_id: str) -> sqlite3.Row:
    # Scoping every lookup by account_id means one account can never read another's zones,
    # even by guessing an id.
    z = conn.execute("SELECT * FROM hosted_zones WHERE id = ? AND account_id = ?", (zone_id, account_id)).fetchone()
    if not z:
        raise not_found("NoSuchHostedZone", f"No hosted zone found with ID: {zone_id}")
    return z


def get_zone(conn: sqlite3.Connection, account_id: str, zone_id: str) -> ZoneOut:
    return _row_to_out(conn, get_zone_row(conn, account_id, zone_id))


def list_zones(
    conn: sqlite3.Connection,
    account_id: str,
    *,
    q: str | None,
    zone_type: str | None,
    page: int,
    page_size: int,
    sort: str | None,
    order: str,
) -> tuple[list[ZoneOut], int]:
    where = ["z.account_id = ?"]
    params: list = [account_id]
    if q:
        like = f"%{escape_like(q.strip().lower())}%"
        where.append("(z.name LIKE ? ESCAPE '\\' OR LOWER(z.id) LIKE ? ESCAPE '\\' OR LOWER(z.comment) LIKE ? ESCAPE '\\')")
        params += [like, like, like]
    if zone_type in ("public", "private"):
        where.append("z.is_private = ?")
        params.append(1 if zone_type == "private" else 0)
    where_sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM hosted_zones z WHERE {where_sql}", params).fetchone()[0]
    direction = "DESC" if order == "desc" else "ASC"
    order_sql = f"{ZONE_SORTS.get(sort or 'name', 'z.name')} {direction}, z.name ASC, z.id ASC"
    rows = conn.execute(
        f"""SELECT z.*, (SELECT COUNT(*) FROM record_sets rs WHERE rs.zone_id = z.id) AS record_count
            FROM hosted_zones z WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return [_row_to_out(conn, r) for r in rows], total


def create_zone(conn: sqlite3.Connection, account_id: str, username: str, body: ZoneCreate) -> ZoneOut:
    try:
        name = normalize_zone_name(body.name)
    except DnsValidationError as e:
        raise ApiError(400, "InvalidDomainName", str(e)) from None

    is_private = body.type == "private"
    if is_private and not body.vpc:
        raise ApiError(400, "InvalidVPCId", "A private hosted zone must be associated with a VPC.")
    if not is_private and body.vpc:
        raise ApiError(400, "InvalidInput", "Public hosted zones cannot be associated with a VPC.")
    keys = [t.key for t in body.tags]
    if len(keys) != len(set(keys)):
        raise ApiError(400, "InvalidInput", "Tag keys must be unique.")

    if is_private:
        # Route53 rule: two private zones with the same name can't share a VPC (ambiguous answers).
        clash = conn.execute(
            """SELECT z.id FROM hosted_zones z JOIN zone_vpcs v ON v.zone_id = z.id
               WHERE z.account_id = ? AND z.name = ? AND v.vpc_id = ? AND v.vpc_region = ?""",
            (account_id, name, body.vpc.vpc_id, body.vpc.region),
        ).fetchone()
        if clash:
            raise ApiError(
                409, "ConflictingDomainExists",
                f"A private hosted zone for {name} is already associated with {body.vpc.vpc_id}.",
            )
    # Note: Route53 *does* allow several public zones with the same name (useful during migrations),
    # so we intentionally don't block duplicates for public zones.

    zone_id = new_zone_id()
    ns = delegation_set(zone_id)
    soa = f"{ns[0]} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
    change_id = new_change_id()
    with transaction(conn):
        conn.execute(
            "INSERT INTO hosted_zones (id, account_id, name, is_private, comment, caller_reference) VALUES (?, ?, ?, ?, ?, ?)",
            (zone_id, account_id, name, int(is_private), body.comment.strip(), str(uuid.uuid4())),
        )
        # Every new zone gets an apex NS (delegation set) and SOA, just like Route53.
        for rtype, ttl, values in (("NS", DEFAULT_NS_TTL, ns), ("SOA", DEFAULT_SOA_TTL, [soa])):
            rid = conn.execute(
                "INSERT INTO record_sets (zone_id, name, type, ttl) VALUES (?, ?, ?, ?)", (zone_id, name, rtype, ttl)
            ).lastrowid
            conn.executemany(
                "INSERT INTO resource_records (record_set_id, position, value) VALUES (?, ?, ?)",
                [(rid, i, v) for i, v in enumerate(values)],
            )
        if body.vpc:
            conn.execute("INSERT INTO zone_vpcs (zone_id, vpc_id, vpc_region) VALUES (?, ?, ?)",
                         (zone_id, body.vpc.vpc_id, body.vpc.region))
        conn.executemany("INSERT INTO zone_tags (zone_id, key, value) VALUES (?, ?, ?)",
                         [(zone_id, t.key, t.value) for t in body.tags])
        conn.execute(
            "INSERT INTO change_batches (id, zone_id, comment, submitted_by) VALUES (?, ?, ?, ?)",
            (change_id, zone_id, "CreateHostedZone", username),
        )
    return get_zone(conn, account_id, zone_id)


def update_zone(conn: sqlite3.Connection, account_id: str, zone_id: str, body: ZoneUpdate) -> ZoneOut:
    get_zone_row(conn, account_id, zone_id)
    if body.tags is not None:
        keys = [t.key for t in body.tags]
        if len(keys) != len(set(keys)):
            raise ApiError(400, "InvalidInput", "Tag keys must be unique.")
    with transaction(conn):
        conn.execute(
            "UPDATE hosted_zones SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?", (zone_id,)
        )
        if body.comment is not None:
            conn.execute("UPDATE hosted_zones SET comment = ? WHERE id = ?", (body.comment.strip(), zone_id))
        if body.tags is not None:
            conn.execute("DELETE FROM zone_tags WHERE zone_id = ?", (zone_id,))
            conn.executemany("INSERT INTO zone_tags (zone_id, key, value) VALUES (?, ?, ?)",
                             [(zone_id, t.key, t.value) for t in body.tags])
    return get_zone(conn, account_id, zone_id)


def delete_zone(conn: sqlite3.Connection, account_id: str, zone_id: str) -> None:
    z = get_zone_row(conn, account_id, zone_id)
    with transaction(conn):
        extra = conn.execute(
            "SELECT COUNT(*) FROM record_sets WHERE zone_id = ? AND NOT (name = ? AND type IN ('NS', 'SOA'))",
            (zone_id, z["name"]),
        ).fetchone()[0]
        if extra:
            # Same error code and wording as Route53, plus a count so the user knows what's left.
            raise ApiError(
                400, "HostedZoneNotEmpty",
                "The specified hosted zone contains non-required resource record sets and so cannot be deleted. "
                f"Delete the {extra} other record(s) first.",
            )
        conn.execute("DELETE FROM hosted_zones WHERE id = ?", (zone_id,))
