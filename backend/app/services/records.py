"""Read side for record sets: listing, search, pagination and serialisation."""
from __future__ import annotations

import sqlite3

from ..errors import not_found
from ..schemas import AliasTarget, RecordSetOut

# Whitelisted sort columns -> SQL. Never interpolate user input into ORDER BY directly.
RECORD_SORTS = {
    "name": "rs.name",
    "type": "rs.type",
    "ttl": "rs.ttl",
    "routing_policy": "rs.routing_policy",
    "updated_at": "rs.updated_at",
}

# Route53 lists apex records first (NS, then SOA), then everything else by name.
DEFAULT_ORDER_SQL = (
    "CASE WHEN rs.name = ? THEN 0 ELSE 1 END, rs.name ASC, "
    "CASE rs.type WHEN 'NS' THEN 0 WHEN 'SOA' THEN 1 ELSE 2 END, rs.type ASC, rs.set_identifier ASC"
)


def escape_like(term: str) -> str:
    """Escape LIKE wildcards so a search for '_dmarc' matches literally."""
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def values_for(conn: sqlite3.Connection, record_set_ids: list[int]) -> dict[int, list[str]]:
    if not record_set_ids:
        return {}
    placeholders = ",".join("?" * len(record_set_ids))
    rows = conn.execute(
        f"SELECT record_set_id, value FROM resource_records WHERE record_set_id IN ({placeholders}) "
        "ORDER BY record_set_id, position",
        record_set_ids,
    ).fetchall()
    out: dict[int, list[str]] = {i: [] for i in record_set_ids}
    for r in rows:
        out[r["record_set_id"]].append(r["value"])
    return out


def to_out(row: sqlite3.Row, values: list[str], zone_name: str) -> RecordSetOut:
    alias = None
    if row["alias_dns_name"]:
        alias = AliasTarget(dns_name=row["alias_dns_name"], evaluate_target_health=bool(row["alias_evaluate_health"]))
    return RecordSetOut(
        id=row["id"],
        name=row["name"],
        type=row["type"],
        ttl=row["ttl"],
        values=values,
        routing_policy=row["routing_policy"],
        set_identifier=row["set_identifier"] or None,
        weight=row["weight"],
        alias_target=alias,
        health_check_id=row["health_check_id"],
        is_default=row["name"] == zone_name and row["type"] in ("NS", "SOA"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_records(
    conn: sqlite3.Connection,
    zone: sqlite3.Row,
    *,
    q: str | None,
    rtype: str | None,
    routing_policy: str | None,
    page: int,
    page_size: int,
    sort: str | None,
    order: str,
) -> tuple[list[RecordSetOut], int]:
    where = ["rs.zone_id = ?"]
    params: list = [zone["id"]]
    if q:
        # Search matches record name OR any of its values (e.g. find every record pointing at an IP).
        like = f"%{escape_like(q.strip().lower())}%"
        where.append(
            "(rs.name LIKE ? ESCAPE '\\' OR LOWER(COALESCE(rs.alias_dns_name, '')) LIKE ? ESCAPE '\\' OR EXISTS ("
            "SELECT 1 FROM resource_records rr WHERE rr.record_set_id = rs.id AND LOWER(rr.value) LIKE ? ESCAPE '\\'))"
        )
        params += [like, like, like]
    if rtype:
        where.append("rs.type = ?")
        params.append(rtype)
    if routing_policy:
        where.append("rs.routing_policy = ?")
        params.append(routing_policy)
    where_sql = " AND ".join(where)

    total = conn.execute(f"SELECT COUNT(*) FROM record_sets rs WHERE {where_sql}", params).fetchone()[0]

    direction = "DESC" if order == "desc" else "ASC"
    order_params: list = []
    if sort in RECORD_SORTS:
        order_sql = f"{RECORD_SORTS[sort]} {direction}, rs.name ASC, rs.type ASC, rs.set_identifier ASC"
    else:
        order_sql = DEFAULT_ORDER_SQL
        order_params = [zone["name"]]

    rows = conn.execute(
        f"SELECT rs.* FROM record_sets rs WHERE {where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        [*params, *order_params, page_size, (page - 1) * page_size],
    ).fetchall()
    vals = values_for(conn, [r["id"] for r in rows])
    return [to_out(r, vals[r["id"]], zone["name"]) for r in rows], total


def get_record_row(conn: sqlite3.Connection, zone_id: str, record_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM record_sets WHERE id = ? AND zone_id = ?", (record_id, zone_id)).fetchone()
    if not row:
        raise not_found("NoSuchRecordSet", f"No record with id {record_id} in hosted zone {zone_id}")
    return row


def get_record(conn: sqlite3.Connection, zone: sqlite3.Row, record_id: int) -> RecordSetOut:
    row = get_record_row(conn, zone["id"], record_id)
    return to_out(row, values_for(conn, [row["id"]])[row["id"]], zone["name"])


def all_records(conn: sqlite3.Connection, zone: sqlite3.Row) -> list[RecordSetOut]:
    rows = conn.execute(
        f"SELECT rs.* FROM record_sets rs WHERE rs.zone_id = ? ORDER BY {DEFAULT_ORDER_SQL}",
        (zone["id"], zone["name"]),
    ).fetchall()
    vals = values_for(conn, [r["id"] for r in rows])
    return [to_out(r, vals[r["id"]], zone["name"]) for r in rows]
