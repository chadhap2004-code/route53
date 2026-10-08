"""Pure DNS validation and normalisation functions (no database access).

Kept free of I/O so every rule can be unit-tested directly (see tests/test_validation.py).

Canonical forms stored in the database:
  * names: lower-case, fully qualified with a trailing dot  ->  "www.example.com."
  * values: normalised per type (e.g. IPv6 compressed, hostnames lower-case with trailing dot,
    TXT always quoted) so that "same value written differently" compares equal.
"""
from __future__ import annotations

import ipaddress
import re

SUPPORTED_TYPES = ("A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA")
ALL_TYPES = SUPPORTED_TYPES + ("SOA",)
ALIAS_CAPABLE_TYPES = ("A", "AAAA", "CNAME", "TXT", "MX", "PTR", "SRV", "CAA")

MAX_NAME_LENGTH = 255  # including the trailing dot (RFC 1035 wire limit)
LABEL_RE = re.compile(r"^[a-z0-9_-]{1,63}$")
ZONE_LABEL_RE = re.compile(r"^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$")
CAA_TAGS = ("issue", "issuewild", "iodef", "issuemail")


class DnsValidationError(ValueError):
    """Raised with a human-readable message that mirrors Route53's wording where practical."""


# --------------------------------------------------------------------------- names

def _ensure_fqdn(name: str) -> str:
    name = name.strip().lower()
    return name if name.endswith(".") else name + "."


def normalize_zone_name(raw: str) -> str:
    """'Example.COM' -> 'example.com.'  (raises on invalid input)."""
    if raw is None or not raw.strip():
        raise DnsValidationError("Domain name is required.")
    name = _ensure_fqdn(raw)
    if name == ".":
        raise DnsValidationError("The root zone cannot be created.")
    if len(name) > MAX_NAME_LENGTH:
        raise DnsValidationError("Domain name must be 255 characters or fewer.")
    labels = name[:-1].split(".")
    for label in labels:
        if not label:
            raise DnsValidationError(f"Domain name '{raw}' contains an empty label.")
        if not ZONE_LABEL_RE.match(label):
            raise DnsValidationError(
                f"Domain name '{raw}' is invalid. Labels may contain a-z, 0-9, hyphen and underscore, "
                "must not start or end with a hyphen, and must be 1-63 characters."
            )
    return name


def is_valid_hostname(name: str, allow_wildcard: bool = False) -> bool:
    """Checks a fully-qualified, lower-cased name ('mail.example.com.')."""
    if not name.endswith(".") or len(name) > MAX_NAME_LENGTH:
        return False
    if name == ".":
        return True  # "." is a valid target (e.g. MX null-route / SRV "service not available")
    labels = name[:-1].split(".")
    for i, label in enumerate(labels):
        if allow_wildcard and i == 0 and label == "*":
            continue
        if not LABEL_RE.match(label):
            return False
    return True


def normalize_record_name(raw: str | None, zone_name: str) -> str:
    """Resolve what a user typed into a fully-qualified record name inside `zone_name`.

    ''/'@'               -> zone apex
    'www'                -> 'www.example.com.'
    'www.example.com'    -> 'www.example.com.'   (already under the zone)
    'other.org.'         -> 'other.org.'         (absolute; rejected later by ensure_in_zone)
    """
    zone = zone_name.lower()
    zone_bare = zone[:-1]
    value = (raw or "").strip().lower()
    if value in ("", "@"):
        return zone
    if value.endswith("."):
        fqdn = value
    elif value == zone_bare or value.endswith("." + zone_bare):
        fqdn = value + "."
    else:
        fqdn = f"{value}.{zone}"
    if not is_valid_hostname(fqdn, allow_wildcard=True):
        raise DnsValidationError(
            f"Record name '{raw}' is invalid. Use letters, digits, hyphens and underscores; "
            "'*' is only allowed as the left-most label."
        )
    return fqdn


def ensure_in_zone(fqdn: str, zone_name: str) -> None:
    if fqdn != zone_name and not fqdn.endswith("." + zone_name):
        raise DnsValidationError(f"RRSet with DNS name {fqdn} is not permitted in zone {zone_name}")


# --------------------------------------------------------------------------- values

def _hostname_value(raw: str, rtype: str) -> str:
    host = _ensure_fqdn(raw)
    if not is_valid_hostname(host):
        raise DnsValidationError(f"Invalid {rtype} value '{raw}': expected a domain name such as host.example.com")
    return host


def _int_field(raw: str, field: str, rtype: str, lo: int, hi: int) -> int:
    if not re.fullmatch(r"\d+", raw):
        raise DnsValidationError(f"Invalid {rtype} value: {field} must be an integer between {lo} and {hi}")
    value = int(raw)
    if not lo <= value <= hi:
        raise DnsValidationError(f"Invalid {rtype} value: {field} must be between {lo} and {hi}")
    return value


def parse_txt_strings(raw: str) -> list[str]:
    """Split a TXT value into its character-strings.

    '"v=spf1 -all"'           -> ['v=spf1 -all']
    '"part one" "part two"'   -> ['part one', 'part two']
    'hello'                   -> ['hello']      (unquoted input is accepted as one string)
    """
    s = raw.strip()
    if not s.startswith('"'):
        return [s]
    strings: list[str] = []
    i = 0
    while i < len(s):
        if s[i].isspace():
            i += 1
            continue
        if s[i] != '"':
            raise DnsValidationError(f"Invalid TXT value {raw}: text outside quotes")
        i += 1
        buf = []
        while i < len(s) and s[i] != '"':
            if s[i] == "\\" and i + 1 < len(s):
                buf.append(s[i + 1])
                i += 2
                continue
            buf.append(s[i])
            i += 1
        if i >= len(s):
            raise DnsValidationError(f"Invalid TXT value {raw}: missing closing quote")
        i += 1  # closing quote
        strings.append("".join(buf))
    return strings


def _quote(text: str) -> str:
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def normalize_value(rtype: str, raw: str) -> str:
    """Validate one value of a record set and return its canonical string."""
    value = (raw or "").strip()
    if not value:
        raise DnsValidationError(f"{rtype} record value cannot be empty")

    if rtype == "A":
        try:
            return str(ipaddress.IPv4Address(value))
        except ValueError:
            raise DnsValidationError(f"Invalid A value '{value}': expected an IPv4 address such as 192.0.2.44") from None

    if rtype == "AAAA":
        try:
            return ipaddress.IPv6Address(value).compressed
        except ValueError:
            raise DnsValidationError(
                f"Invalid AAAA value '{value}': expected an IPv6 address such as 2001:db8::1"
            ) from None

    if rtype in ("CNAME", "NS", "PTR"):
        return _hostname_value(value, rtype)

    if rtype == "MX":
        parts = value.split()
        if len(parts) != 2:
            raise DnsValidationError(f"Invalid MX value '{value}': expected 'priority mail-server', e.g. 10 mail.example.com")
        prio = _int_field(parts[0], "priority", "MX", 0, 65535)
        return f"{prio} {_hostname_value(parts[1], 'MX')}"

    if rtype == "SRV":
        parts = value.split()
        if len(parts) != 4:
            raise DnsValidationError(
                f"Invalid SRV value '{value}': expected 'priority weight port target', e.g. 1 10 5269 xmpp.example.com"
            )
        prio = _int_field(parts[0], "priority", "SRV", 0, 65535)
        weight = _int_field(parts[1], "weight", "SRV", 0, 65535)
        port = _int_field(parts[2], "port", "SRV", 0, 65535)
        return f"{prio} {weight} {port} {_hostname_value(parts[3], 'SRV')}"

    if rtype == "CAA":
        m = re.fullmatch(r"(\d+)\s+([A-Za-z0-9]+)\s+(.+)", value)
        if not m:
            raise DnsValidationError(f"Invalid CAA value '{value}': expected 'flags tag \"value\"', e.g. 0 issue \"amazon.com\"")
        flags = _int_field(m.group(1), "flags", "CAA", 0, 255)
        tag = m.group(2).lower()
        if tag not in CAA_TAGS:
            raise DnsValidationError(f"Invalid CAA tag '{tag}': must be one of {', '.join(CAA_TAGS)}")
        inner = m.group(3).strip()
        if inner.startswith('"') and inner.endswith('"') and len(inner) >= 2:
            inner = inner[1:-1]
        return f"{flags} {tag} {_quote(inner)}"

    if rtype == "TXT":
        strings = parse_txt_strings(value)
        for s in strings:
            if len(s.encode()) > 255:
                raise DnsValidationError(
                    "Invalid TXT value: each character string must be 255 characters or fewer. "
                    'Split long values into several quoted strings: "first part" "second part"'
                )
        return " ".join(_quote(s) for s in strings)

    if rtype == "SOA":
        parts = value.split()
        if len(parts) != 7:
            raise DnsValidationError("Invalid SOA value: expected 'mname rname serial refresh retry expire minimum'")
        mname = _hostname_value(parts[0], "SOA")
        rname = _hostname_value(parts[1], "SOA")
        nums = [str(_int_field(p, "timer", "SOA", 0, 4294967295)) for p in parts[2:]]
        return " ".join([mname, rname, *nums])

    raise DnsValidationError(f"Unsupported record type {rtype}")


def normalize_values(rtype: str, values: list[str]) -> list[str]:
    """Validate a whole value list; collects every error instead of stopping at the first."""
    cleaned = [v for v in (x.strip() for x in values) if v]
    if not cleaned:
        raise DnsValidationError(f"{rtype} record must have at least one value")
    errors: list[str] = []
    out: list[str] = []
    for v in cleaned:
        try:
            nv = normalize_value(rtype, v)
        except DnsValidationError as e:
            errors.append(str(e))
            continue
        if nv in out:
            errors.append(f"Duplicate value '{v}' in {rtype} record")
        out.append(nv)
    if errors:
        raise DnsValidationError("; ".join(errors))
    if rtype in ("CNAME", "SOA") and len(out) != 1:
        raise DnsValidationError(f"{rtype} record must have exactly one value")
    return out
