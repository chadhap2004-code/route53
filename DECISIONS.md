# DECISIONS.md — decision log

Every technical decision is logged here: framework, library, pattern, trade-off, and things deliberately **not** done.
Add new entries at the bottom with the next number. Never delete an entry. If a decision changes, add a new entry and mark the old one `Superseded by D-xx`.

**Template**
```
### D-XX: <short title>
- Date: YYYY-MM-DD · Status: Accepted | Superseded by D-YY | Proposed
- Decision: what we chose
- Why: the reason (tie to the assignment where possible)
- Alternatives considered: what else, and why not
- Consequences / trade-offs: what it costs, what to watch
```

---

## Stack and frameworks

### D-01: Stack is Next.js (TypeScript) + FastAPI + SQLite
- Date: 2026-10-08 · Status: Accepted
- Decision: Use exactly the stack in the brief.
- Why: Required by the assignment.
- Alternatives considered: Express/MongoDB (more familiar to me) was rejected because the brief fixes the stack.
- Consequences: TypeScript, Next.js and FastAPI were newer to me than plain JS/React/Python, so the code is kept idiomatic and simple.

### D-02: Next.js 14.2 (App Router) with React 18, not Next 15/16
- Date: 2026-10-08 · Status: Accepted
- Decision: `next@14.2.35`, `react@18.3.1`.
- Why: Stable with Cloudscape (React 18). Avoids the React 19/RSC changes and the related security advisories that affected Next 15/16 App Router. 14.2.35 includes the middleware auth-bypass fix.
- Alternatives considered: Next 15 (React 19), rejected as needless risk before the deadline.
- Consequences: `params` are plain objects (not Promises) in page props.

### D-03: Cloudscape Design System for the UI
- Date: 2026-10-08 · Status: Accepted
- Decision: Build every screen with `@cloudscape-design/components` (+ global-styles, collection-hooks).
- Why: It's AWS's own open-source design system, the one the real console uses. The brief asks for the same look and feel, and "UI similarity" is the first evaluation criterion.
- Alternatives considered: Tailwind, MUI or shadcn hand-styled to look like AWS. Rejected: slower, and the result would still look off.
- Consequences: Bigger bundle (~270–370 kB first load). Every console page is a client component. Requires `transpilePackages` in next.config.

### D-04: TanStack Query for server state
- Date: 2026-10-08 · Status: Accepted
- Decision: All server data goes through `useQuery`/`useMutation`. Mutations invalidate `["zones"]`, `["zone", id]` and `["records", id]`.
- Why: Caching, loading/error states, `keepPreviousData` for flicker-free paging, simple invalidation after writes.
- Alternatives considered: `useEffect` + `fetch` (more boilerplate, easy to get stale data); SWR (equivalent; TanStack is more common).
- Consequences: One extra dependency.

### D-05: Raw `sqlite3` with hand-written SQL, no ORM
- Date: 2026-10-08 · Status: Accepted
- Decision: Repository-style functions in `services/*` with parameterised SQL. Schema lives in `schema.sql`.
- Why: Small schema (8 tables). Every query is visible and explainable. Uses SQLite features directly (BEGIN IMMEDIATE, LIKE ESCAPE). SQL is also where I'm strongest.
- Alternatives considered: SQLAlchemy + Alembic. Rejected: more abstraction to explain, not needed at this size.
- Consequences: No migration tool; `CREATE TABLE IF NOT EXISTS` on startup. A schema change needs a manual migration or a DB reset.

### D-06: dnspython for BIND zone-file parsing
- Date: 2026-10-08 · Status: Accepted
- Decision: `dns.zone.from_text(..., relativize=False, check_origin=False)`. Prepend `$TTL 300` when the file has none.
- Why: Zone files have $ORIGIN, $TTL, @, parentheses, comments and escapes. A proven parser is safer than regex.
- Alternatives considered: A hand-written parser (error-prone).
- Consequences: One extra backend dependency.

### D-07: Pinned dependency versions
- Date: 2026-10-08 · Status: Accepted
- Decision: Backend versions pinned exactly in `requirements.txt`. Frontend uses caret ranges, with `package-lock.json` committed and `npm ci` in CI/Docker.
- Why: Reproducible builds for evaluators and CI.
- Consequences: Upgrades are deliberate.

## Architecture and API

### D-08: Next.js rewrites `/api/*` to FastAPI (same-origin proxy)
- Date: 2026-10-08 · Status: Accepted
- Decision: `next.config.mjs` rewrites `/api/:path*` to `${BACKEND_URL}/api/:path*`.
- Why: The browser sees one origin, so the session cookie is first-party, there's no CORS preflight, and the backend URL stays hidden.
- Alternatives considered: The browser calling the FastAPI domain directly (needs CORS with credentials and third-party cookies, which browsers increasingly block).
- Consequences: `BACKEND_URL` is resolved **at build time**, so changing it needs a frontend redeploy. CORS stays configured only for local direct calls.

### D-09: Backend layering: routers → services → pure validation
- Date: 2026-10-08 · Status: Accepted
- Decision: Routers do HTTP only. Services hold the business rules and SQL. `dns/validation.py` is pure (no I/O).
- Why: Testable (the validators are unit-tested directly), easy to explain, rules live in one place.
- Consequences: Slight indirection for simple endpoints.

### D-10: One atomic change-batch engine for ALL record writes
- Date: 2026-10-08 · Status: Accepted
- Decision: `services/changes.py::apply_changes` implements Route 53's ChangeResourceRecordSets (CREATE/UPSERT/DELETE, all-or-nothing). Single create, edit, delete, bulk delete and import all call it.
- Why: Mirrors the real API. A rule can't be skipped in one code path. Bulk operations and import come almost for free.
- Alternatives considered: Separate create/update/delete functions (rules duplicated).
- Consequences: Single-record endpoints are "a batch of one".

### D-11: Changes in a batch are applied sequentially inside one transaction
- Date: 2026-10-08 · Status: Accepted
- Decision: Each change is validated against the DB state *including earlier changes in the same batch*. All errors are collected and returned together.
- Why: Matches Route 53 (for example, DELETE a CNAME then CREATE an A record with the same name in one batch).
- Consequences: Error messages are prefixed "Change N:" (the UI rewrites this to "Record N:").

### D-12: Import preview = real import + rollback (dry run)
- Date: 2026-10-08 · Status: Accepted
- Decision: `dry_run=True` runs `apply_changes` and raises an internal `_DryRun` inside the transaction to roll back.
- Why: The preview can never disagree with the actual import.
- Consequences: The preview briefly holds the write lock.

### D-13: Error format and status codes
- Date: 2026-10-08 · Status: Accepted
- Decision: Errors are always `{"error": {"code", "message", "details"}}` with AWS-style codes (`InvalidChangeBatch`, `HostedZoneNotEmpty`, `NoSuchHostedZone`, ...). 201 create, 204 delete, 400 rule violation, 401 unauthenticated, 404 not found **or not yours**, 409 conflict, 422 request shape.
- Why: One format for the frontend to read. The messages match what the real console shows.
- Consequences: Never return 403 for another account's zone (it would reveal that the zone exists).

### D-14: Server-side search, filter, sort and offset pagination
- Date: 2026-10-08 · Status: Accepted
- Decision: `q`, `type`, `routing_policy`, `page`, `page_size`, `sort`, `order` query params. Sort columns come from an allow-list.
- Why: The API does real work and scales past one page. Safe dynamic ORDER BY.
- Alternatives considered: Client-side filtering (doesn't scale); marker/cursor paging like Route 53 (more complex).
- Consequences: Offset paging can skip or duplicate rows if data changes between pages. Fine at this scale.

### D-15: Record search matches name OR any value (EXISTS subquery), with LIKE wildcards escaped
- Date: 2026-10-08 · Status: Accepted
- Why: Useful (find every record pointing at an IP). Escaping means `_dmarc` is matched literally.

### D-16: Alias filter on the records page is client-side, per page
- Date: 2026-10-08 · Status: Accepted (known limitation)
- Why: Kept the API small before the deadline.
- Consequences: The counter shows the server total. The fix would be an `alias` query param.

## Data model

### D-17: Record sets and values in separate tables (`record_sets` 1—N `resource_records`)
- Date: 2026-10-08 · Status: Accepted
- Why: Normalised (1NF), search by value, keeps value order. Matches Route 53's ResourceRecordSet → ResourceRecords.
- Alternatives considered: A comma-separated column (breaks search, violates 1NF); a JSON column (clumsier SQL search).

### D-18: `set_identifier` defaults to `''`, not NULL
- Date: 2026-10-08 · Status: Accepted
- Why: SQLite treats NULLs as distinct in UNIQUE constraints, so `UNIQUE(zone_id, name, type, set_identifier)` wouldn't stop duplicate simple records.

### D-19: Names stored lower-case, fully qualified with a trailing dot; values normalised per type
- Date: 2026-10-08 · Status: Accepted
- Why: "www", "WWW.example.com" and "www.example.com." must compare equal. IPv6 is compressed, hostnames lower-cased with a dot, TXT always quoted.

### D-20: SQLite connection settings: foreign_keys=ON, WAL, busy_timeout=5000, autocommit + explicit BEGIN IMMEDIATE
- Date: 2026-10-08 · Status: Accepted
- Why: SQLite ignores FKs unless enabled per connection. WAL lets reads run during a write. IMMEDIATE takes the write lock up front, so concurrent batches can't both pass their checks and then both write.
- Consequences: Run **one** backend process/replica (SQLite has a single writer).

### D-21: One connection per request, `check_same_thread=False`, sync (`def`) endpoints
- Date: 2026-10-08 · Status: Accepted
- Why: sqlite3 is blocking, so FastAPI runs `def` endpoints in a thread pool. The dependency and the handler may run on different threads, but one request never shares its connection with another.

### D-22: `record_count` computed with a COUNT subquery, not stored
- Date: 2026-10-08 · Status: Accepted
- Why: No counter that can drift out of sync. Cost is negligible at this scale.

### D-23: Every zone query is scoped by `account_id`
- Date: 2026-10-08 · Status: Accepted
- Why: Multi-account isolation even with a mocked IAM. Guessing a zone ID returns 404.

### D-24: IDs mimic AWS formats
- Date: 2026-10-08 · Status: Accepted
- Decision: Zones `Z0` + 18 chars, change batches `C` + 13 chars, generated with `secrets`. Records use an integer PK internally.

## Route 53 behaviour

### D-25: New zones get an apex NS (4 name servers) + SOA automatically
- Date: 2026-10-08 · Status: Accepted
- Decision: The delegation set follows the real pattern (.com 0–511, .net 512–1023, .org 1024–1535, .co.uk 1536–2047), derived from a hash of the zone ID. NS TTL 172800, SOA TTL 900.

### D-26: Apex NS/SOA can be edited but not deleted; only one SOA
- Date: 2026-10-08 · Status: Accepted · Why: Real Route 53 behaviour.

### D-27: The zone name is immutable; edit changes only the description and tags
- Date: 2026-10-08 · Status: Accepted · Why: Real Route 53 behaviour.

### D-28: Deleting a zone with non-default records returns `HostedZoneNotEmpty`
- Date: 2026-10-08 · Status: Accepted · Why: Real behaviour and message. The UI also disables Delete and explains why.

### D-29: Duplicate PUBLIC zone names are allowed; private zones with the same name can't share a VPC
- Date: 2026-10-08 · Status: Accepted
- Why: Matches Route 53 (useful during migrations). Private conflicts return `ConflictingDomainExists`.
- Consequences: An evaluator may think duplicates are a bug. The README explains it.

### D-30: CNAME rules: not at the apex, and exclusive at its name (RFC 1034 §3.6.2)
- Date: 2026-10-08 · Status: Accepted

### D-31: Routing policies: Simple + Weighted only; no mixing at the same name+type
- Date: 2026-10-08 · Status: Accepted
- Why: Covers the common cases and shows the set-identifier model without scope creep.
- Alternatives considered: Latency, failover, geolocation and multivalue (deferred).

### D-32: Alias records: no TTL (stored NULL), no values, valid target DNS name, not for NS/SOA
- Date: 2026-10-08 · Status: Accepted

### D-33: DELETE must match the current values; empty values mean "delete whatever is stored"
- Date: 2026-10-08 · Status: Accepted
- Why: The real API requires an exact match (optimistic concurrency). The UI deletes by ID, so it sends empty values.

### D-34: Editing a record keeps its name, type, routing policy and record ID fixed
- Date: 2026-10-08 · Status: Accepted · Why: They identify the record set, as in the console.

### D-35: Zone-file import skips SOA, apex NS and unsupported types; existing name+type is skipped unless "overwrite" (then UPSERT)
- Date: 2026-10-08 · Status: Accepted

### D-36: Export formats: BIND (alias records written as comments) and JSON shaped like `aws route53 list-resource-record-sets`
- Date: 2026-10-08 · Status: Accepted

## Auth and security

### D-37: Mocked auth with real server-side sessions (not JWT)
- Date: 2026-10-08 · Status: Accepted
- Decision: Seeded demo user (bcrypt hash). Login creates a 256-bit random token in `sessions`, sent as an HttpOnly, SameSite=Lax cookie (Secure in production via `COOKIE_SECURE`). Logout deletes the row.
- Why: Logout truly ends the session, JavaScript can't read the token, and there's a single server.
- Alternatives considered: JWT. Rejected: needs a deny-list for logout, no benefit with one backend.
- Consequences: One indexed lookup per request.

### D-38: Two-layer route protection
- Date: 2026-10-08 · Status: Accepted
- Decision: `middleware.ts` redirects when there's no cookie (UX only). The backend validates the session on every API call. A 401 in `api.ts` redirects to `/login?next=`, and only `/route53/...` paths are allowed as `next` (prevents an open redirect).

### D-39: Login returns the same error for an unknown user and a wrong password
- Date: 2026-10-08 · Status: Accepted · Why: Doesn't reveal which usernames exist.

### D-40: Unbranded top bar, and a login page clearly labelled as a demo with credentials pre-filled
- Date: 2026-10-08 · Status: Accepted
- Why: A public page imitating the AWS sign-in risks phishing flags or a takedown. The console UI below is still faithful.

### D-41: Demo data uses RFC 2606 names and RFC 5737 IPs; "Reset demo data" endpoint
- Date: 2026-10-08 · Status: Accepted · Why: Points at nothing real. Reviewers can restore the demo.

## Frontend specifics

### D-42: URL paths mirror the real console (`/route53/v2/hostedzones/...`)
- Date: 2026-10-08 · Status: Accepted

### D-43: Create/edit flows are full pages (like the console); confirmations are modals
- Date: 2026-10-08 · Status: Accepted
- Decision: Quick-create supports several records per submit (one batch). Delete-zone requires typing `delete`. A split panel shows the selected record's details.

### D-44: Notifications live in a React context above the pages (Flashbar)
- Date: 2026-10-08 · Status: Accepted · Why: Messages survive redirects. Success auto-dismisses after 8 s; errors stay.

### D-45: Per-browser preferences (page size, columns, wrap, dark mode) in localStorage, wrapped in try/catch
- Date: 2026-10-08 · Status: Accepted · Why: Light convenience. Storage can throw in private mode.

### D-46: Keyboard shortcuts via a global listener plus `data-shortcut` attributes
- Date: 2026-10-08 · Status: Accepted
- Decision: `/` search, `c` create, `g h`/`g d` navigation, `t` theme, `?` help. Ignored while typing or when a modal is open.

### D-47: TypeScript types maintained by hand in `lib/types.ts`
- Date: 2026-10-08 · Status: Accepted (revisit)
- Why: Fewer moving parts before the deadline.
- Alternatives considered: openapi-typescript generation (better long-term; proposed as a next step).

## Testing, CI and deployment

### D-48: pytest with a fresh SQLite file per test (tmp_path) and an authenticated client fixture
- Date: 2026-10-08 · Status: Accepted · Why: Isolated, fast (~18 s), no ordering dependencies.

### D-49: The Playwright smoke test lives in `e2e/` but is not in CI
- Date: 2026-10-08 · Status: Accepted (revisit) · Why: Needs both servers running. CI runs pytest + typecheck/lint/build.

### D-50: Deploy backend on Railway (Docker + volume at /data), frontend on Vercel
- Date: 2026-10-08 · Status: Accepted
- Why: SQLite needs a persistent disk. Vercel functions and Render free have ephemeral filesystems.
- Alternatives considered: Render free (fallback; data resets on sleep or restart); Fly.io (card required, no free tier for new orgs).
- Consequences: The Dockerfile must not use `VOLUME` (Railway rejects it). Run 1 replica.

### D-51: No AI/ML features
- Date: 2026-10-08 · Status: Accepted
- Why: A DNS console has no problem that ML solves. Adding one would look forced and add a failure mode.

## Review fixes (2026-10-08, second session)

### D-52: Stay on next@14.2.35 despite open advisories (accepted risk)
- Date: 2026-10-08 · Status: Accepted (revisit after submission)
- Decision: Keep `next@14.2.35`. `npm audit` reports advisories (including some on rewrites and middleware) whose only fix is `next@16`.
- Why: Moving to Next 16 means React 19 and App Router changes the night before the deadline, which is riskier than the advisories for a demo. The demo has no real data: the accounts are mocked, the DNS data is made-up seed data using reserved example domains and IP ranges, and the backend URL is a fixed value set at build time, not something a user can change.
- Alternatives considered: `npm audit fix --force` (installs next@16, breaking); upgrading to a newer 14.x (none fixes these).
- Consequences: Upgrade after submission. Supersedes nothing; extends D-02.

### D-53: Agent working notes stay local; DECISIONS.md is public
- Date: 2026-10-08 · Status: Accepted
- Decision: `CLAUDE.md`, `STATE.md` and `docs/agent/` are gitignored. `DECISIONS.md` is committed. Personal and resume details were removed from the docs before the first commit.
- Why: DECISIONS.md documents the engineering reasoning. The other files are session notes for local work and contained personal details.
- Consequences: Session state lives only on this machine.

### D-54: Editing a record keeps its health check ID unless the request sends the field
- Date: 2026-10-08 · Status: Accepted
- Decision: `PUT /records/{id}` uses `model_fields_set`: if `health_check_id` isn't in the body, the stored value is kept; sending `null` clears it.
- Why: The edit form never shows health checks, so a normal edit was silently wiping the value.
- Alternatives considered: Making the whole PUT a partial update (bigger API change).

### D-55: Zone-file import skips names that already have weighted records
- Date: 2026-10-08 · Status: Accepted
- Decision: An imported name+type that already has weighted records is a SKIP row ("Weighted records already exist for this name and type"), even with overwrite.
- Why: A zone file has no routing policy, so it can't replace weighted records. Before, one such row made the whole import fail.

### D-56: CAA values are unescaped before re-quoting
- Date: 2026-10-08 · Status: Accepted
- Decision: The quoted part of a CAA value goes through the same parser as TXT strings, then is quoted again.
- Why: Normalising a stored value must give the same value. Before, `\"` gained an extra backslash on every save.

### D-57: Destructive "Reset demo data" needs a confirmation modal; the reset itself stays non-atomic
- Date: 2026-10-08 · Status: Accepted (known limitation)
- Decision: The user menu opens a Cloudscape modal before calling `/api/demo/reset`. The reset still deletes in one transaction and reseeds in separate ones.
- Why: Several reviewers may share the demo account, so a mis-click shouldn't wipe it. Making the reseed atomic would mean restructuring how services open transactions; running the reset again repairs a partial reset.

### D-58: Table load errors show in the table's empty slot with a Retry button
- Date: 2026-10-08 · Status: Accepted
- Why: Before, a failed request showed "No hosted zones" / "No records", which is wrong. Reusing the empty slot keeps the change small.

### D-59: The alias filter stays client-side (D-16 reconfirmed)
- Date: 2026-10-08 · Status: Accepted (known limitation)
- Why: Fixing it needs a new API parameter; not worth an API change before the deadline. Listed in the README limitations.

## UI review fixes (2026-10-08)

### D-60: Record details split panel opens at the bottom
- Date: 2026-10-08 · Status: Accepted
- Decision: Default `splitPanelPreferences.position` is `bottom`, with a change handler so users can switch to side.
- Why: At 1440px the side panel squeezed the records table to four columns and wrapped the header buttons and filters.

### D-61: The console shell renders only in the browser
- Date: 2026-10-08 · Status: Accepted
- Decision: `ConsoleShell` returns nothing until it has mounted.
- Why: Cloudscape's TopNavigation and AppLayout choose a mobile layout from the window size, which the server can't know, so every console page threw hydration errors at phone width. Every console page is client-rendered and fetches its data in the browser anyway, so nothing is lost.
- Alternatives considered: `dynamic(..., { ssr: false })` per page (more files touched).

### D-62: Record names are displayed without the trailing dot
- Date: 2026-10-08 · Status: Accepted
- Decision: The records table, split panel, delete modal and import preview show names through `displayName()`. Values keep their trailing dot, and the API still returns fully qualified names.
- Why: Matches how the console shows record names. Display only; storage and the API contract are unchanged (D-19).
