---
name: Phone number normalization
description: users.no_whatsapp is canonicalized; any new match/write site must normalize or login silently breaks.
---

# users.no_whatsapp is canonical "62…" digits

`users.no_whatsapp` is a UNIQUE column. It is stored canonicalized to `62` + digits-only
(via `normalizePhone` in `artifacts/api-server/src/lib/phone.ts`). Every place that
**matches or writes** a phone must call `normalizePhone` first: login, admin-login,
register, profile edit, admin seed, and OTP send. Display/search-only reads don't need it.

**Why:** the column was originally stored as-typed, so a user who registered without a
leading `0` (e.g. `8973399559`) failed login when they later typed `08973399559`, and
`0812…` vs `812…` could form duplicate accounts. A one-time idempotent migration in
`runMigrations` (guarded by `WHERE no_whatsapp !~ '^62[0-9]+$'`) rewrote existing rows.

**How to apply:** if you add any new endpoint or query that looks up or stores a phone
number, wrap the value in `normalizePhone` — otherwise it will silently miss existing
canonical rows. Keep the SQL normalization in the migration in parity with the JS
`normalizePhone` if you ever change the canonical form.

# Deploy-ordering hazard for data migrations (shared Railway DB)

Dev and production share the same Railway Postgres. A data-rewrite migration in
`runMigrations` runs on the next api-server boot. The api-server dev script is
`build && start` (NOT a watcher), so editing files does NOT auto-run it — only an
explicit workflow restart does. When a migration rewrites data in a way that the
*currently deployed* (old) production code can't handle (e.g. normalizing stored phones
to `62…` while old prod does exact-match login), do NOT restart the local api-server
before the new code is pushed/deployed to Railway, or you migrate prod data out from
under the old prod code and break live logins until deploy catches up.
