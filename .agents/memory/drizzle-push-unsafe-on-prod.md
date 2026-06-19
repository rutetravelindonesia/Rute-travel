---
name: drizzle-kit push is unsafe against the Railway production DB
description: Why `db run push` will drop production tables here, and the safe alternative for schema changes.
---

Do NOT run `pnpm --filter @workspace/db run push` (or `push-force`) against the live Railway database.

**Why:** The committed Drizzle schema does not fully match the production DB. Tables exist in
production that the schema files don't declare (e.g. `notifications`, which held real rows).
`drizzle-kit push` diffs schema-code vs DB and proposes to DROP anything not in the code — it
flagged a data-loss drop of the `notifications` table. Forcing the push would delete production data.

**How to apply:** For additive schema changes (the common case), apply surgical SQL directly with
psql instead of push:

```
psql "$RAILWAY_DATABASE_URL" -v ON_ERROR_STOP=1 -c "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <col> <type>;"
```

`ADD COLUMN IF NOT EXISTS` (nullable) is backward-compatible: the old Railway-hosted app and the
Play Store app keep working because Drizzle selects only the columns it knows about. After changing
the schema file + adding the column in the DB, restart the api-server so its compiled select
includes the new column. Keep the Drizzle schema file and the DB in sync manually, column by column.
