"""Unit tests for the pure DNS validation layer."""
import pytest

from app.dns.validation import (
    DnsValidationError,
    ensure_in_zone,
    normalize_record_name,
    normalize_value,
    normalize_values,
    normalize_zone_name,
    parse_txt_strings,
)

Z = "example.com."


@pytest.mark.parametrize("raw,expected", [
    ("Example.COM", "example.com."),
    ("example.com.", "example.com."),
    ("sub.example.co.uk", "sub.example.co.uk."),
    ("2.0.192.in-addr.arpa", "2.0.192.in-addr.arpa."),
])
def test_zone_name_normalised(raw, expected):
    assert normalize_zone_name(raw) == expected


@pytest.mark.parametrize("raw", ["", ".", "exa mple.com", "example..com", "-bad.com", "bad-.com", "a" * 64 + ".com"])
def test_zone_name_rejected(raw):
    with pytest.raises(DnsValidationError):
        normalize_zone_name(raw)


@pytest.mark.parametrize("raw,expected", [
    ("", Z), ("@", Z), ("www", "www.example.com."), ("WWW", "www.example.com."),
    ("www.example.com", "www.example.com."), ("www.example.com.", "www.example.com."),
    ("*.dev", "*.dev.example.com."), ("_dmarc", "_dmarc.example.com."),
])
def test_record_name_resolution(raw, expected):
    assert normalize_record_name(raw, Z) == expected


def test_record_name_outside_zone_rejected():
    name = normalize_record_name("other.org.", Z)
    with pytest.raises(DnsValidationError, match="not permitted in zone"):
        ensure_in_zone(name, Z)


def test_wildcard_only_leftmost():
    with pytest.raises(DnsValidationError):
        normalize_record_name("a.*.b", Z)


@pytest.mark.parametrize("rtype,raw,expected", [
    ("A", " 192.0.2.1 ", "192.0.2.1"),
    ("AAAA", "2001:0db8:0000:0000:0000:0000:0000:0001", "2001:db8::1"),
    ("CNAME", "Target.Example.net", "target.example.net."),
    ("MX", "10   mail.example.com", "10 mail.example.com."),
    ("SRV", "1 10 5269 xmpp.example.com", "1 10 5269 xmpp.example.com."),
    ("CAA", '0 issue "amazon.com"', '0 issue "amazon.com"'),
    ("CAA", "0 ISSUE letsencrypt.org", '0 issue "letsencrypt.org"'),
    ("TXT", "hello world", '"hello world"'),
    ("TXT", '"a" "b"', '"a" "b"'),
    ("PTR", "host.example.com.", "host.example.com."),
    ("NS", "ns1.example.net", "ns1.example.net."),
])
def test_value_normalisation(rtype, raw, expected):
    assert normalize_value(rtype, raw) == expected


@pytest.mark.parametrize("rtype,raw", [
    ("A", "256.1.1.1"), ("A", "2001:db8::1"), ("AAAA", "192.0.2.1"),
    ("MX", "mail.example.com"), ("MX", "70000 mail.example.com"),
    ("SRV", "1 10 xmpp.example.com"), ("SRV", "1 10 99999 x.example.com"),
    ("CAA", '0 badtag "x"'), ("CAA", '300 issue "x"'),
    ("CNAME", "not a host"), ("TXT", '"unterminated'),
])
def test_value_rejected(rtype, raw):
    with pytest.raises(DnsValidationError):
        normalize_value(rtype, raw)


def test_txt_255_limit_per_string():
    with pytest.raises(DnsValidationError, match="255"):
        normalize_value("TXT", '"' + "x" * 256 + '"')
    # Long values are fine when split into several strings
    assert normalize_value("TXT", '"' + "x" * 255 + '" "' + "y" * 10 + '"').count('"') == 4


def test_txt_escapes():
    assert parse_txt_strings(r'"say \"hi\""') == ['say "hi"']


def test_caa_escaped_quote_is_stable():
    once = normalize_value("CAA", r'0 iodef "mailto:a\"b@example.com"')
    assert once == r'0 iodef "mailto:a\"b@example.com"'
    assert normalize_value("CAA", once) == once  # re-saving doesn't add more backslashes


def test_cname_single_value_and_duplicates():
    with pytest.raises(DnsValidationError, match="exactly one"):
        normalize_values("CNAME", ["a.example.com", "b.example.com"])
    with pytest.raises(DnsValidationError, match="Duplicate"):
        normalize_values("A", ["192.0.2.1", "192.0.2.1"])


def test_errors_are_collected_not_first_only():
    with pytest.raises(DnsValidationError) as e:
        normalize_values("A", ["bad1", "192.0.2.1", "bad2"])
    assert "bad1" in str(e.value) and "bad2" in str(e.value)
