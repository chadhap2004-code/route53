"""Demo data so the hosted demo never opens on an empty screen.

Uses RFC 2606 reserved names (example.com/.net/.org) and RFC 5737 documentation IPs
(192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24), so nothing points at real infrastructure.
Records are created through the same change-batch engine the API uses.
"""
from __future__ import annotations

import sqlite3

from .config import settings
from .db import transaction
from .schemas import Change, RecordSetIn, Tag, Vpc, ZoneCreate
from .services import auth as auth_service
from .services import changes as change_service
from .services import zones as zone_service

DEMO_ACCOUNT_ID = "123456789012"
DEMO_ACCOUNT_NAME = "Demo account"


def _rs(name, rtype, values, ttl=300, **kw) -> Change:
    return Change(action="CREATE", record_set=RecordSetIn(name=name, type=rtype, values=values, ttl=ttl, **kw))


DEMO_ZONES: list[tuple[ZoneCreate, list[Change]]] = [
    (
        ZoneCreate(name="example.com", comment="Production website and email",
                   tags=[Tag(key="env", value="prod"), Tag(key="team", value="platform")]),
        [
            _rs("", "A", ["192.0.2.10"]),
            _rs("", "AAAA", ["2001:db8::10"]),
            _rs("", "MX", ["10 mail1.example.com", "20 mail2.example.com"], ttl=3600),
            _rs("", "TXT", ['"v=spf1 include:_spf.example.net ~all"', '"google-site-verification=abc123xyz"']),
            _rs("", "CAA", ['0 issue "amazon.com"', '0 issue "letsencrypt.org"'], ttl=3600),
            _rs("www", "CNAME", ["example.com"]),
            _rs("api", "A", ["198.51.100.20", "198.51.100.21"], ttl=60),
            _rs("mail1", "A", ["192.0.2.25"]),
            _rs("mail2", "A", ["192.0.2.26"]),
            _rs("_dmarc", "TXT", ['"v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com"']),
            _rs("_sip._tcp", "SRV", ["10 60 5060 sip.example.com"]),
            _rs("sip", "A", ["203.0.113.50"]),
            _rs("app", "A", ["203.0.113.10"], ttl=60, routing_policy="weighted", set_identifier="blue", weight=90),
            _rs("app", "A", ["203.0.113.11"], ttl=60, routing_policy="weighted", set_identifier="green", weight=10),
            Change(action="CREATE", record_set=RecordSetIn(
                name="cdn", type="A", ttl=None,
                alias_target={"dns_name": "d111111abcdef8.cloudfront.net", "evaluate_target_health": False})),
            _rs("dev", "NS", ["ns-1.example.net", "ns-2.example.net"], ttl=172800),
        ],
    ),
    (
        ZoneCreate(name="example.net", comment="Marketing microsites"),
        [
            _rs("", "A", ["192.0.2.80"]),
            _rs("www", "CNAME", ["example.net"]),
            _rs("blog", "CNAME", ["hosting.example.org"]),
            _rs("*.preview", "A", ["192.0.2.81"]),
        ],
    ),
    (
        ZoneCreate(name="example.org", comment="Status page and docs", tags=[Tag(key="env", value="prod")]),
        [
            _rs("status", "CNAME", ["statuspage.example.net"]),
            _rs("docs", "A", ["198.51.100.40"]),
            _rs("hosting", "A", ["198.51.100.41"]),
        ],
    ),
    (
        ZoneCreate(name="internal.example.com", type="private", comment="Service discovery for the prod VPC",
                   vpc=Vpc(vpc_id="vpc-0a1b2c3d4e5f60718", region="ap-south-1")),
        [
            _rs("db", "A", ["10.0.1.15"], ttl=60),
            _rs("cache", "A", ["10.0.1.30"], ttl=60),
            _rs("queue", "CNAME", ["broker-1.internal.example.com"], ttl=60),
            _rs("broker-1", "A", ["10.0.2.11"], ttl=60),
        ],
    ),
    (
        ZoneCreate(name="2.0.192.in-addr.arpa", comment="Reverse DNS for 192.0.2.0/24"),
        [
            _rs("10", "PTR", ["example.com"], ttl=3600),
            _rs("25", "PTR", ["mail1.example.com"], ttl=3600),
        ],
    ),
    (ZoneCreate(name="staging.example.com", comment="Staging environment"), [_rs("", "A", ["203.0.113.100"])]),
    (ZoneCreate(name="example.test", comment="Sandbox for testing record changes"), []),
]


def seed_account(conn: sqlite3.Connection, account_id: str, username: str) -> None:
    for zone_in, changes in DEMO_ZONES:
        z = zone_service.create_zone(conn, account_id, username, zone_in)
        if changes:
            row = zone_service.get_zone_row(conn, account_id, z.id)
            change_service.apply_changes(conn, row, changes, submitted_by=username, comment="Seed data")


def reset_account(conn: sqlite3.Connection, account_id: str, username: str) -> None:
    with transaction(conn):
        conn.execute("DELETE FROM hosted_zones WHERE account_id = ?", (account_id,))
    seed_account(conn, account_id, username)


def seed(conn: sqlite3.Connection) -> None:
    user = auth_service.ensure_user(
        conn, settings.demo_username, settings.demo_password, DEMO_ACCOUNT_ID, DEMO_ACCOUNT_NAME
    )
    has_zones = conn.execute("SELECT 1 FROM hosted_zones WHERE account_id = ? LIMIT 1", (user["account_id"],)).fetchone()
    if not has_zones:
        seed_account(conn, user["account_id"], user["username"])
