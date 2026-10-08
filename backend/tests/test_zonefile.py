"""BIND import/export, including a full round trip."""
ZONE_FILE = """
$ORIGIN unit-test.example.
$TTL 3600
@       IN SOA ns1.other.net. admin.other.net. ( 2024010101 7200 900 1209600 86400 )
@       IN NS  ns1.other.net.
@       IN A   192.0.2.1
www  300 IN CNAME unit-test.example.
mail    IN MX  10 mx.unit-test.example.
mx      IN A   192.0.2.2
@       IN TXT "v=spf1 mx -all"
_sip._udp IN SRV 10 5 5060 sip.unit-test.example.
@       IN CAA 0 issue "letsencrypt.org"
x       IN HINFO "cpu" "os"
"""


def test_import_preview_does_not_write(client, zone):
    zid = zone["id"]
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": ZONE_FILE, "dry_run": True})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 7 and body["change"] is None
    reasons = {(row["type"], row["reason"]) for row in body["rows"] if row["action"] == "SKIP"}
    assert any(t == "SOA" for t, _ in reasons) and any(t == "NS" for t, _ in reasons) and any(t == "HINFO" for t, _ in reasons)
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 2


def test_import_then_export_round_trip(client, zone):
    zid = zone["id"]
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": ZONE_FILE, "dry_run": False})
    assert r.status_code == 200 and r.json()["change"]["id"].startswith("C")
    assert client.get(f"/api/hosted-zones/{zid}").json()["record_count"] == 9
    exported = client.get(f"/api/hosted-zones/{zid}/export", params={"format": "bind"}).text
    assert "$ORIGIN unit-test.example." in exported and '"v=spf1 mx -all"' in exported

    # Re-import the export into a fresh zone: same record sets come back.
    z2 = client.post("/api/hosted-zones", json={"name": "unit-test.example"}).json()  # duplicate public names are allowed
    r2 = client.post(f"/api/hosted-zones/{z2['id']}/import", json={"zone_file": exported, "dry_run": False})
    assert r2.status_code == 200, r2.text
    norm = lambda zid_: sorted((x["name"], x["type"], tuple(x["values"])) for x in
                               client.get(f"/api/hosted-zones/{zid_}/records", params={"page_size": 300}).json()["items"]
                               if not x["is_default"])
    assert norm(zid) == norm(z2["id"])


def test_import_skips_existing_unless_overwrite(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "mx", "type": "A", "values": ["192.0.2.200"]})
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": ZONE_FILE, "dry_run": True}).json()
    assert any(row["name"] == "mx.unit-test.example." and row["action"] == "SKIP" for row in r["rows"])
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": ZONE_FILE, "dry_run": True, "overwrite": True}).json()
    assert any(row["name"] == "mx.unit-test.example." and row["action"] == "UPSERT" for row in r["rows"])


def test_import_skips_names_with_weighted_records(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "w", "type": "A", "routing_policy": "weighted",
                                                         "set_identifier": "a", "weight": 1, "values": ["192.0.2.1"]})
    text = "w 300 IN A 192.0.2.9\nok 300 IN A 192.0.2.8\n"
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": text, "dry_run": False, "overwrite": True})
    assert r.status_code == 200, r.text
    actions = {row["name"]: row["action"] for row in r.json()["rows"]}
    assert actions == {"w.unit-test.example.": "SKIP", "ok.unit-test.example.": "CREATE"}


def test_import_invalid_file(client, zone):
    r = client.post(f"/api/hosted-zones/{zone['id']}/import", json={"zone_file": "@ IN A not-an-ip"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "InvalidZoneFile"


def test_import_conflict_reported(client, zone):
    zid = zone["id"]
    client.post(f"/api/hosted-zones/{zid}/records", json={"name": "www", "type": "A", "values": ["192.0.2.5"]})
    r = client.post(f"/api/hosted-zones/{zid}/import", json={"zone_file": "www 300 IN CNAME other.example.net.\n"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "InvalidChangeBatch"


def test_json_export_shape(client, zone):
    data = client.get(f"/api/hosted-zones/{zone['id']}/export", params={"format": "json"}).json()
    assert data["HostedZone"]["Name"] == "unit-test.example."
    assert {r["Type"] for r in data["ResourceRecordSets"]} == {"NS", "SOA"}


def test_export_all_zones_json(client, zone):
    r = client.get("/api/hosted-zones/export", params={"format": "json"})
    assert r.status_code == 200 and 'filename="hosted-zones.json"' in r.headers["content-disposition"]
    zones = r.json()["HostedZones"]
    assert len(zones) == 8  # the 7 demo zones + the test zone
    one = next(z for z in zones if z["HostedZone"]["Name"] == "unit-test.example.")
    assert {rr["Type"] for rr in one["ResourceRecordSets"]} == {"NS", "SOA"}


def test_export_all_zones_bind_zip(client, zone):
    import io
    import zipfile
    r = client.get("/api/hosted-zones/export", params={"format": "bind"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert len(names) == 8 and all(n.endswith(".zone") for n in names)
    text = zipfile.ZipFile(io.BytesIO(r.content)).read(f"unit-test.example_{zone['id']}.zone").decode()
    assert "$ORIGIN unit-test.example." in text


def test_export_all_zones_only_has_own_zones(client):
    from .test_api import NEW_USER, _signup_client
    with _signup_client() as new:
        new.post("/api/auth/signup", json=NEW_USER)
        assert new.get("/api/hosted-zones/export").json() == {"HostedZones": []}
        new.post("/api/hosted-zones", json={"name": "only-b.example"})
        zones = new.get("/api/hosted-zones/export").json()["HostedZones"]
        assert [z["HostedZone"]["Name"] for z in zones] == ["only-b.example."]
    names = [z["HostedZone"]["Name"] for z in client.get("/api/hosted-zones/export").json()["HostedZones"]]
    assert "only-b.example." not in names
    client.post("/api/auth/logout")
    assert client.get("/api/hosted-zones/export").status_code == 401
