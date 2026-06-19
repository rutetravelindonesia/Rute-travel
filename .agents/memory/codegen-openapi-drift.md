---
name: api-zod / api-client-react generated files are out of sync with openapi.yaml
description: Why running codegen breaks the api-server build in this repo
---

The committed generated files under `lib/api-zod/src/generated/` and
`lib/api-client-react/src/generated/` are RICHER than what the current
`lib/api-spec/openapi.yaml` would produce. The spec was trimmed at some point
(it only defines health + auth) but the generated files were kept committed and
the server routes depend on schemas like `CarterSettingsBody`, `KendaraanBody`,
`CreateScheduleBody`, `ScheduleResponse`, `RequestUploadUrl*`, etc.

**Rule:** Do NOT run `pnpm --filter @workspace/api-spec run codegen` unless you
have first fully expanded `openapi.yaml` to cover every endpoint/schema the
server and frontend use. Running codegen against the current stale spec wipes
the needed schemas and breaks the api-server esbuild build with
"No matching export ... for import CarterSettingsBody/KendaraanBody".

**Why:** The app's real contract source of truth is the committed generated
files, not the trimmed openapi.yaml.

**How to apply:** If generated files get clobbered, restore them from the
upstream repo (github.com/rutetravelindonesia/Rute-travel) then run
`pnpm run typecheck:libs`.
