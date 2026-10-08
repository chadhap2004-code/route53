"""BIND zone-file import/export.

Parsing uses dnspython instead of a hand-written parser: zone files have $ORIGIN/$TTL
directives, relative names, '@', parentheses spanning lines, comments and escapes. A proven
parser handles all of that; our code only maps its output onto Route53 record sets.
"""
from __future__ import annotations

import io
import json
import re
import zipfile

import dns.exception
import dns.rdatatype
import dns.zone

from ..schemas import RecordSetOut, ZoneOut
from .validation import SUPPORTED_TYPES


class ZoneFileError(ValueError):
    pass


def parse_zone_file(text: str, zone_name: str) -> list[dict]:
    """Return [{name, type, ttl, values, skip_reason}] grouped into record sets."""
    if not re.search(r"^\s*\$TTL\b", text, flags=re.MULTILINE | re.IGNORECASE):
        text = "$TTL 300\n" + text  # zone files without $TTL and without per-record TTLs are common
    try:
        zone = dns.zone.from_text(text, origin=zone_name, relativize=False, check_origin=False)
    except dns.exception.DNSException as e:
        raise ZoneFileError(f"Could not parse zone file: {e}") from None
    except (KeyError, ValueError) as e:
        raise ZoneFileError(f"Could not parse zone file: {e}") from None

    out: list[dict] = []
    for name, rdataset in zone.iterate_rdatasets():
        fqdn = name.to_text().lower()
        rtype = dns.rdatatype.to_text(rdataset.rdtype)
        values = [rd.to_text() for rd in rdataset]
        skip = ""
        if rtype == "SOA":
            skip = "Route 53 manages the SOA record for the zone"
        elif rtype == "NS" and fqdn == zone_name:
            skip = "Route 53 manages the NS record at the zone apex"
        elif rtype not in SUPPORTED_TYPES:
            skip = f"Record type {rtype} is not supported"
        out.append({"name": fqdn, "type": rtype, "ttl": rdataset.ttl, "values": values, "skip_reason": skip})
    out.sort(key=lambda r: (r["name"], r["type"]))
    return out


def export_bind(zone: ZoneOut, records: list[RecordSetOut]) -> str:
    lines = [
        f"; Zone file for {zone.name}",
        f"; Hosted zone ID: {zone.id}",
        "; Exported from Route 53 clone",
        f"$ORIGIN {zone.name}",
        "",
    ]
    width = max([len(r.name) for r in records] + [20])
    for r in records:
        if r.alias_target:
            lines.append(
                f"; {r.name} {r.type} ALIAS {r.alias_target.dns_name} "
                "(alias records are a Route 53 extension and have no BIND equivalent)"
            )
            continue
        note = f"  ; weighted: id={r.set_identifier} weight={r.weight}" if r.routing_policy == "weighted" else ""
        for i, v in enumerate(r.values):
            lines.append(f"{r.name:<{width}} {r.ttl:>7} IN {r.type:<6} {v}{note if i == 0 else ''}")
    return "\n".join(lines) + "\n"


def export_json(zone: ZoneOut, records: list[RecordSetOut]) -> str:
    """Same shape as `aws route53 list-resource-record-sets` output, so it's familiar."""
    return json.dumps(_zone_doc(zone, records), indent=2) + "\n"


def export_all_json(zones: list[tuple[ZoneOut, list[RecordSetOut]]]) -> str:
    """Every hosted zone of the account in one document: {"HostedZones": [<same shape as export_json>, ...]}."""
    return json.dumps({"HostedZones": [_zone_doc(z, records) for z, records in zones]}, indent=2) + "\n"


def export_all_bind(zones: list[tuple[ZoneOut, list[RecordSetOut]]]) -> bytes:
    """A .zip with one BIND zone file per hosted zone (BIND expects one zone per file).
    File names include the zone ID, because two public zones can share a name (D-29)."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for zone, records in zones:
            stem = re.sub(r"[^a-z0-9.-]", "_", zone.name.rstrip("."))
            archive.writestr(f"{stem}_{zone.id}.zone", export_bind(zone, records))
    return buffer.getvalue()


def _zone_doc(zone: ZoneOut, records: list[RecordSetOut]) -> dict:
    rrsets = []
    for r in records:
        item: dict = {"Name": r.name, "Type": r.type}
        if r.set_identifier:
            item["SetIdentifier"] = r.set_identifier
        if r.weight is not None:
            item["Weight"] = r.weight
        if r.alias_target:
            item["AliasTarget"] = {
                "DNSName": r.alias_target.dns_name,
                "EvaluateTargetHealth": r.alias_target.evaluate_target_health,
            }
        else:
            item["TTL"] = r.ttl
            item["ResourceRecords"] = [{"Value": v} for v in r.values]
        if r.health_check_id:
            item["HealthCheckId"] = r.health_check_id
        rrsets.append(item)
    return {
        "HostedZone": {
            "Id": f"/hostedzone/{zone.id}",
            "Name": zone.name,
            "Config": {"Comment": zone.comment, "PrivateZone": zone.type == "private"},
            "ResourceRecordSetCount": zone.record_count,
        },
        "ResourceRecordSets": rrsets,
    }
