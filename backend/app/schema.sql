-- Route53 clone schema (SQLite)
-- Conventions:
--   * Domain names are stored lower-case and fully qualified (trailing dot): "example.com."
--   * IDs mirror AWS formats: hosted zones "Z...", change batches "C..."
--   * ON DELETE CASCADE keeps child rows consistent; requires PRAGMA foreign_keys=ON per connection.

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    account_id    TEXT    NOT NULL,          -- mocked 12-digit AWS account id
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT    PRIMARY KEY,         -- 256-bit random, URL-safe
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    expires_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS hosted_zones (
    id                TEXT    PRIMARY KEY,   -- e.g. Z0412345ABCDEFGHIJKL
    account_id        TEXT    NOT NULL,
    name              TEXT    NOT NULL,      -- "example.com."
    is_private        INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
    comment           TEXT    NOT NULL DEFAULT '',
    caller_reference  TEXT    NOT NULL,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (account_id, caller_reference)
);
CREATE INDEX IF NOT EXISTS idx_zones_account_name ON hosted_zones(account_id, name);

CREATE TABLE IF NOT EXISTS zone_vpcs (
    zone_id     TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
    vpc_id      TEXT NOT NULL,
    vpc_region  TEXT NOT NULL,
    PRIMARY KEY (zone_id, vpc_id, vpc_region)
);

CREATE TABLE IF NOT EXISTS zone_tags (
    zone_id  TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
    key      TEXT NOT NULL,
    value    TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (zone_id, key)
);

-- A record SET: one (name, type, set_identifier) inside a zone, holding one TTL and many values.
CREATE TABLE IF NOT EXISTS record_sets (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id                TEXT    NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
    name                   TEXT    NOT NULL,             -- "www.example.com."
    type                   TEXT    NOT NULL CHECK (type IN ('A','AAAA','CNAME','TXT','MX','NS','PTR','SRV','CAA','SOA')),
    ttl                    INTEGER CHECK (ttl IS NULL OR (ttl >= 0 AND ttl <= 2147483647)),  -- NULL for alias records
    routing_policy         TEXT    NOT NULL DEFAULT 'simple' CHECK (routing_policy IN ('simple','weighted')),
    set_identifier         TEXT    NOT NULL DEFAULT '',  -- '' (not NULL) so the UNIQUE constraint below works
    weight                 INTEGER CHECK (weight IS NULL OR (weight >= 0 AND weight <= 255)),
    alias_dns_name         TEXT,                          -- set => alias record
    alias_evaluate_health  INTEGER NOT NULL DEFAULT 0 CHECK (alias_evaluate_health IN (0, 1)),
    health_check_id        TEXT,
    created_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE (zone_id, name, type, set_identifier)
);
CREATE INDEX IF NOT EXISTS idx_records_zone_name ON record_sets(zone_id, name);

CREATE TABLE IF NOT EXISTS resource_records (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    record_set_id  INTEGER NOT NULL REFERENCES record_sets(id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    value          TEXT    NOT NULL,
    UNIQUE (record_set_id, position)
);

-- Audit trail mirroring Route53's ChangeInfo / ChangeResourceRecordSets.
CREATE TABLE IF NOT EXISTS change_batches (
    id            TEXT PRIMARY KEY,              -- e.g. C2682N5HXP0BZ4
    zone_id       TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
    comment       TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'INSYNC' CHECK (status IN ('PENDING','INSYNC')),
    submitted_by  TEXT NOT NULL,
    submitted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_changes_zone ON change_batches(zone_id, submitted_at);

CREATE TABLE IF NOT EXISTS change_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id   TEXT NOT NULL REFERENCES change_batches(id) ON DELETE CASCADE,
    action     TEXT NOT NULL CHECK (action IN ('CREATE','UPSERT','DELETE')),
    name       TEXT NOT NULL,
    type       TEXT NOT NULL,
    snapshot   TEXT NOT NULL                     -- JSON of the record set as submitted
);
