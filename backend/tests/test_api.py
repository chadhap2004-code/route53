"""API tests: auth, hosted zones, records and Route53 rules end to end."""
import time

from .conftest import zone_id_by_name


# ------------------------------------------------------------------ auth

def test_requires_session(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import settings
    from app.main import app
    settings.database_path = str(tmp_path / "anon.db")
    with TestClient(app) as anon:
        r = anon.get("/api/hosted-zones")
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "NotAuthenticated"
        bad = anon.post("/api/auth/login", json={"username": "demo", "password": "wrong"})
        assert bad.status_code == 401


def test_session_cookie_is_httponly(tmp_path):
    from fastapi.testclient import TestClient
    from app.config import settings
    from app.main import app
    settings.database_path = str(tmp_path / "c.db")
    with TestClient(app) as c:
        r = c.post("/api/auth/login", json={"username": "demo", "password": settings.demo_password})
        cookie = r.headers["set-cookie"].lower()
        assert "httponly" in cookie and "samesite=lax" in cookie


def test_logout_invalidates_session(client):
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


# ------------------------------------------------------------------ zones

def test_create_zone_adds_ns_and_soa(client, zone):
    assert zone["name"] == "unit-test.example."
    assert zone["id"].startswith("Z")
    assert zone["record_count"] == 2
    assert len(zone["name_servers"]) == 4
    tlds = sorted(ns.split("awsdns-")[1].split(".", 1)[1] for ns in zone["name_servers"])
    assert tlds == ["co.uk.", "com.", "net.", "org."]
    recs = client.get(f"/api/hosted-zones/{zone['id']}/records").json()["items"]
    assert [(r["type"], r["is_default"]) for r in recs] == [("NS", True), ("SOA", True)]


def test_zone_name_is_immutable(client, zone):
    r = client.patch(f"/api/hosted-zones/{zone['id']}", json={"comment": "new desc", "name": "other.example"})
    assert r.status_code == 200
    assert r.json()["name"] == "unit-test.example." and r.json()["comment"] == "new desc"


def test_tag_only_edit_updates_timestamp(client, zone):
    time.sleep(1.1)  # timestamps have one-second resolution
    r = client.patch(f"/api/hosted-zones/{zone['id']}", json={"tags": [{"key": "env", "value": "dev"}]})
    assert r.status_code == 200 and r.json()["updated_at"] > zone["updated_at"]


def test_invalid_zone_name(client):
    r = client.post("/api/hosted-zones", json={"name": "bad..name"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "InvalidDomainName"


def test_private_zone_requires_vpc_and_conflicts(client):
    r = client.post("/api/hosted-zones", json={"name": "corp.example", "type": "private"})
    assert r.json()["error"]["code"] == "InvalidVPCId"
    body = {"name": "corp.example", "type": "private", "vpc": {"vpc_id": "vpc-0123abcd", "region": "us-east-1"}}
    assert client.post("/api/hosted-zones", json=body).status_code == 201
    r = client.post("/api/hosted-zones", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "ConflictingDomainExists"


def test_search_filter_and_paginate_zones(client):
    page1 = client.get("/api/hosted-zones", params={"page_size": 3}).json()
    page3 = client.get("/api/hosted-zones", params={"page_size": 3, "page": 3}).json()
    assert page1["total"] == 7 and len(page1["items"]) == 3 and len(page3["items"]) == 1
    assert {z["name"] for z in client.get("/api/hosted-zones", params={"q": "EXAMPLE.NET"}).json()["items"]} == {"example.net."}
    private = client.get("/api/hosted-zones", params={"type": "private"}).json()
    assert [z["name"] for z in private["items"]] == ["internal.example.com."]
    desc = client.get("/api/hosted-zones", params={"sort": "record_count", "order": "desc"}).json()["items"]
    assert desc[0]["name"] == "example.com."


def test_delete_zone_blocked_when_not_empty(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "www", "type": "A", "values": ["192.0.2.1"]})
    r = client.delete(f"/api/hosted-zones/{zid}")
    assert r.status_code == 400 and r.json()["error"]["code"] == "HostedZoneNotEmpty"
    rec = client.get(f"/api/hosted-zones/{zid}/records", params={"type": "A"}).json()["items"][0]
    assert client.delete(f"/api/hosted-zones/{zid}/records/{rec['id']}").status_code == 204
    assert client.delete(f"/api/hosted-zones/{zid}").status_code == 204
    assert client.get(f"/api/hosted-zones/{zid}").status_code == 404


# ------------------------------------------------------------------ records

def test_record_crud(client, zone):
    zid = zone["id"]
    r = client.post(f"/api/hosted-zones/{zid}/records",
                    json={"name": "Mail", "type": "MX", "ttl": 3600, "values": ["10 mx1.example.net", "20 mx2.example.net"]})
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["name"] == "mail.unit-test.example." and rec["values"] == ["10 mx1.example.net.", "20 mx2.example.net."]
    r = client.put(f"/api/hosted-zones/{zid}/records/{rec['id']}", json={"ttl": 60, "values": ["5 mx.example.net"]})
    assert r.status_code == 200 and r.json()["ttl"] == 60 and r.json()["values"] == ["5 mx.example.net."]
    assert client.delete(f"/api/hosted-zones/{zid}/records/{rec['id']}").status_code == 204
    assert client.get(f"/api/hosted-zones/{zid}/records/{rec['id']}").status_code == 404


def test_edit_keeps_health_check_unless_sent(client, zone):
    zid = zone["id"]
    rec = client.post(f"/api/hosted-zones/{zid}/records",
                      json={"name": "hc", "type": "A", "values": ["192.0.2.1"], "health_check_id": "hc-123"}).json()
    r = client.put(f"/api/hosted-zones/{zid}/records/{rec['id']}", json={"ttl": 60, "values": ["192.0.2.1"]})
    assert r.json()["health_check_id"] == "hc-123"
    r = client.put(f"/api/hosted-zones/{zid}/records/{rec['id']}",
                   json={"ttl": 60, "values": ["192.0.2.1"], "health_check_id": None})
    assert r.json()["health_check_id"] is None


def test_duplicate_record_rejected(client, zone):
    zid = zone["id"]
    body = {"name": "www", "type": "A", "values": ["192.0.2.1"]}
    assert client.post(f"/api/hosted-zones/{zid}/records", json=body).status_code == 201
    r = client.post(f"/api/hosted-zones/{zid}/records", json=body)
    assert r.status_code == 400 and "already exists" in r.json()["error"]["message"]


def test_cname_rules(client, zone):
    zid = zone["id"]
    r = client.post(f"/api/hosted-zones/{zid}/records", json={"name": "", "type": "CNAME", "values": ["x.example.net"]})
    assert "zone apex" in r.json()["error"]["message"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "web", "type": "A", "values": ["192.0.2.1"]})
    r = client.post(f"/api/hosted-zones/{zid}/records", json={"name": "web", "type": "CNAME", "values": ["x.example.net"]})
    assert r.status_code == 400 and "conflicting RRSet of type A" in r.json()["error"]["message"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "alias", "type": "CNAME", "values": ["x.example.net"]})
    r = client.post(f"/api/hosted-zones/{zid}/records", json={"name": "alias", "type": "TXT", "values": ["hi"]})
    assert "conflicting RRSet of type CNAME" in r.json()["error"]["message"]


def test_default_records_cannot_be_deleted_but_can_be_edited(client, zone):
    zid = zone["id"]
    recs = client.get(f"/api/hosted-zones/{zid}/records").json()["items"]
    ns = next(r for r in recs if r["type"] == "NS")
    r = client.delete(f"/api/hosted-zones/{zid}/records/{ns['id']}")
    assert r.status_code == 400 and "at least one NS" in r.json()["error"]["message"]
    r = client.put(f"/api/hosted-zones/{zid}/records/{ns['id']}", json={"ttl": 3600, "values": ns["values"]})
    assert r.status_code == 200 and r.json()["ttl"] == 3600


def test_record_outside_zone_rejected(client, zone):
    r = client.post(f"/api/hosted-zones/{zone['id']}/records", json={"name": "evil.org.", "type": "A", "values": ["192.0.2.1"]})
    assert "not permitted in zone" in r.json()["error"]["message"]


def test_weighted_records(client, zone):
    zid = zone["id"]
    base = {"name": "app", "type": "A", "routing_policy": "weighted"}
    assert client.post(f"/api/hosted-zones/{zid}/records", json={**base, "set_identifier": "a", "weight": 70, "values": ["192.0.2.1"]}).status_code == 201
    assert client.post(f"/api/hosted-zones/{zid}/records", json={**base, "set_identifier": "b", "weight": 30, "values": ["192.0.2.2"]}).status_code == 201
    r = client.post(f"/api/hosted-zones/{zid}/records", json={"name": "app", "type": "A", "values": ["192.0.2.3"]})
    assert r.status_code == 400  # can't mix simple with weighted
    r = client.post(f"/api/hosted-zones/{zid}/records", json={**base, "values": ["192.0.2.3"]})
    assert "set identifier" in r.json()["error"]["message"]


def test_alias_record(client, zone):
    r = client.post(f"/api/hosted-zones/{zone['id']}/records",
                    json={"name": "cdn", "type": "A", "alias_target": {"dns_name": "d1.cloudfront.net"}})
    assert r.status_code == 201 and r.json()["ttl"] is None and r.json()["alias_target"]["dns_name"] == "d1.cloudfront.net."


def test_change_batch_is_atomic(client, zone):
    zid = zone["id"]
    batch = {"changes": [
        {"action": "CREATE", "record_set": {"name": "ok", "type": "A", "values": ["192.0.2.1"]}},
        {"action": "CREATE", "record_set": {"name": "bad", "type": "A", "values": ["not-an-ip"]}},
    ]}
    r = client.post(f"/api/hosted-zones/{zid}/changes", json=batch)
    assert r.status_code == 400 and r.json()["error"]["code"] == "InvalidChangeBatch"
    names = [x["name"] for x in client.get(f"/api/hosted-zones/{zid}/records").json()["items"]]
    assert "ok.unit-test.example." not in names  # first change rolled back too


def test_change_batch_sees_earlier_changes(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "svc", "type": "CNAME", "values": ["x.example.net"]})
    batch = {"changes": [
        {"action": "DELETE", "record_set": {"name": "svc", "type": "CNAME", "values": ["x.example.net"]}},
        {"action": "CREATE", "record_set": {"name": "svc", "type": "A", "values": ["192.0.2.9"]}},
    ]}
    r = client.post(f"/api/hosted-zones/{zid}/changes", json=batch)
    assert r.status_code == 200, r.text
    assert r.json()["id"].startswith("C") and r.json()["status"] == "INSYNC"


def test_delete_requires_matching_values(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "m", "type": "A", "values": ["192.0.2.1"]})
    r = client.post(f"/api/hosted-zones/{zid}/changes", json={"changes": [
        {"action": "DELETE", "record_set": {"name": "m", "type": "A", "values": ["192.0.2.99"]}}]})
    assert "do not match" in r.json()["error"]["message"]


def test_bulk_delete(client, zone):
    zid = zone["id"]
    ids = [client.post(f"/api/hosted-zones/{zid}/records", json={"name": f"h{i}", "type": "A", "values": [f"192.0.2.{i}"]}).json()["id"]
           for i in range(1, 4)]
    r = client.post(f"/api/hosted-zones/{zid}/records/bulk-delete", json={"record_ids": ids})
    assert r.status_code == 200 and r.json()["change_count"] == 3
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 2


def test_record_search_by_name_and_value(client):
    zid = zone_id_by_name(client, "example.com.")
    by_value = client.get(f"/api/hosted-zones/{zid}/records", params={"q": "198.51.100.20"}).json()["items"]
    assert [r["name"] for r in by_value] == ["api.example.com."]
    underscore = client.get(f"/api/hosted-zones/{zid}/records", params={"q": "_dm"}).json()["items"]
    assert [r["name"] for r in underscore] == ["_dmarc.example.com."]  # '_' is matched literally, not as a wildcard
    mx = client.get(f"/api/hosted-zones/{zid}/records", params={"type": "MX"}).json()
    assert mx["total"] == 1


def test_accounts_are_isolated(client):
    other = client.get("/api/hosted-zones/Z0DOESNOTEXIST0000")
    assert other.status_code == 404 and other.json()["error"]["code"] == "NoSuchHostedZone"


def test_other_account_cannot_see_or_change_zones(client):
    from fastapi.testclient import TestClient
    from app.db import connect
    from app.main import app
    from app.services import auth as auth_service

    zid = zone_id_by_name(client, "example.com.")
    conn = connect()
    auth_service.ensure_user(conn, "other", "other-pass", "999999999999")
    conn.close()
    with TestClient(app) as other:
        assert other.post("/api/auth/login", json={"username": "other", "password": "other-pass"}).status_code == 200
        assert other.get("/api/hosted-zones").json()["total"] == 0
        # Another account's zone looks exactly like a zone that doesn't exist (404, not 403).
        assert other.get(f"/api/hosted-zones/{zid}").status_code == 404
        assert other.get(f"/api/hosted-zones/{zid}/records").status_code == 404
        assert other.patch(f"/api/hosted-zones/{zid}", json={"comment": "hacked"}).status_code == 404
        assert other.post(f"/api/hosted-zones/{zid}/records",
                          json={"name": "x", "type": "A", "values": ["192.0.2.1"]}).status_code == 404
        assert other.delete(f"/api/hosted-zones/{zid}").status_code == 404
    assert client.get(f"/api/hosted-zones/{zid}").json()["comment"] == "Production website and email"
