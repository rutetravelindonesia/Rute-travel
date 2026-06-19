---
name: api-server tsc noise
description: api-server has many pre-existing tsc errors; how to tell a real regression from baseline noise
---

`pnpm --filter @workspace/api-server run typecheck` reports ~55 PRE-EXISTING errors. Most are the same systemic pattern on nearly every route: `Argument of type '(req, res) => Promise<void>' is not assignable to parameter of type 'Application<...>'` (the `adminGuard(...)` / Express 5 handler typing). There are also a few unrelated pre-existing ones in `carter.ts` / `schedules.ts` (`number | undefined`, missing props like `catatan`/`cancelled_at`).

**Why it doesn't break the app:** the server is bundled/run via esbuild, which does NOT type-check. So these tsc errors never block runtime, and the app is live on Play Store with them present.

**How to apply:** Do NOT treat a non-zero api-server tsc count as your work being broken. To check whether *your* change added a real regression, compare against baseline instead of reading the raw count:
- `diff <(git show HEAD:artifacts/api-server/src/routes/<file>) artifacts/api-server/src/routes/<file>` and count added `router.` lines — each new route following the existing `adminGuard` pattern adds exactly one more of the identical pre-existing error, which is consistent, not a regression.
- Verify the server actually boots: restart the api-server workflow and `curl localhost:80/api/<route>` (a protected route returning 401 confirms the route is wired and the guard works).

The meaningful typecheck gate for this repo is the **frontend** (`@workspace/rute-travel`), which has its own ~8 known pre-existing errors (usePushNotifications, carter-detail-driver, carter-etiket, jadwal-mitra, register).
