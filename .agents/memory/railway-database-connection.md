---
name: RUTE uses external Railway Postgres — operational gotchas
description: Non-obvious operational traps when the app reads from Railway instead of Replit's DB
---

RUTE reads `RAILWAY_DATABASE_URL ?? DATABASE_URL` (`lib/db/src/index.ts`), so it
runs on the external Railway production DB, not the Replit-provisioned one. The
"why" and full setup live in `replit.md`. Keep only the non-obvious traps here:

- **Env change needs a workflow restart.** Setting/changing `RAILWAY_DATABASE_URL`
  does NOT affect the running process — it reads the var only at boot. I once
  spent a cycle confused because the app kept serving the Replit DB until I
  restarted the api-server workflow. After any DB-env change: restart the
  api-server workflow and re-verify (e.g. `/api/kota` count + a `created_at`
  that matches production, not today's seed).
- **Use the PUBLIC Railway endpoint** (`*.proxy.rlwy.net:<port>`), never
  `postgres.railway.internal` (only resolves inside Railway's own network).
- **Dev and any Replit deploy hit the SAME live production DB** — there is no
  staging split. Testing register/booking writes real user data.
