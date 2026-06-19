---
name: kota_list seeding (national)
description: How kota_list is populated and why legacy Kalimantan plain names must stay
---

# kota_list = legacy Kaltim plain names + national Kabupaten/Kota

`kota_list` is seeded at boot by `seedKota` (api-server `lib/seed.ts`), idempotent
via `INSERT ... ON CONFLICT (nama_kota) DO NOTHING`. Two sources:
1. Legacy Kaltim town list (plain names like "Samarinda", "Balikpapan", plus
   kecamatan-level towns) — these are the ORIGINAL ~32 production rows.
2. Full national list (38 provinsi, 514 kabupaten/kota) generated from the
   `idn-area-data` npm package into `artifacts/api-server/src/lib/kota-indonesia.ts`
   by `scripts/src/gen-kota-indonesia.ts` (`pnpm --filter @workspace/scripts run gen-kota`).
   National names use official "Kabupaten X" / "Kota Y" form.

**Why the two coexist (and a wart):** the legacy plain names are referenced by
existing `users.kota` and by schedules/route origin-destination data, so they must
NEVER be removed/renamed. National names are prefixed so they don't collide on the
unique `nama_kota`. Consequence: Kalimantan provinces show BOTH "Balikpapan" (legacy)
and "Kota Balikpapan" (national) — a known duplicate-looking-options wart. Cleaning it
up requires migrating existing references first; do not just delete the legacy rows.

**How to apply:** to refresh national data, rerun the generator (it rewrites the data
file) and restart api-server. The picker (`ProvinsiKotaPicker`) derives provinsi list
from this data, so coverage is automatic.
