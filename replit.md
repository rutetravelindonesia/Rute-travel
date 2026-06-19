# RUTE Travel App

Aplikasi online untuk menghubungkan driver travel dan penumpang di Kalimantan Timur. Tersedia fitur Jadwal Tetap, Tebengan Pulang, Carter, Chat in-app, dan Panel Admin.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — jalankan API server (port 8080)
- `pnpm --filter @workspace/rute-travel run dev` — jalankan frontend (port 25006)
- `pnpm run typecheck` — full typecheck semua packages
- `pnpm run build` — typecheck + build semua packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks dan Zod schemas dari OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (dari OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui
- Maps: Leaflet + OpenStreetMap + Nominatim

## Where things live

- API server: `artifacts/api-server/src/routes/` — semua route handler
- Frontend: `artifacts/rute-travel/src/pages/` — semua halaman
- DB schema: `lib/db/src/schema/` — source of truth untuk semua tabel
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Generated hooks: `lib/api-client-react/src/generated/`

## Architecture decisions

- Mobile-first UI dengan warna cream/amber
- Bahasa Indonesia di seluruh UI
- Tidak ada data hardcoded — semua dari API atau empty state
- Nomor telepon tidak pernah ditampilkan di UI — komunikasi via in-app chat
- "Jadwal Tetap" = waktu pasti (tanpa `~`), "Tebengan Pulang" = estimasi (selalu `~`)
- Bearer token disimpan di localStorage

## Product

- **Penumpang:** Cari & booking jadwal tetap, tebengan pulang, carter. Bayar via transfer, upload bukti, etiket digital, live trip tracking, rating driver.
- **Driver (Mitra):** Buat jadwal tetap, atur carter, lihat pesanan masuk, GPS sync.
- **Admin:** Panel lengkap — users, jadwal, booking, pembayaran, kendaraan, laporan keuangan, kota/rute, harga, pengumuman, log aktivitas.

## User preferences

- Mobile-first UI dengan warna cream/amber
- Semua teks dalam Bahasa Indonesia
- Tidak ada data mock/hardcoded — tampilkan empty state jika tidak ada data
- Nomor HP/WhatsApp tidak ditampilkan di UI
- "Jadwal Tetap" = waktu pasti; "Tebengan Pulang" = estimasi (selalu ~)

## Gotchas

- Selalu jalankan `pnpm --filter @workspace/db run push` setelah mengubah schema DB
- ⚠️ JANGAN jalankan `pnpm --filter @workspace/api-spec run codegen` — `openapi.yaml` sudah usang (hanya health + auth), sedangkan file generated yang di-commit (`lib/api-zod/src/generated`, `lib/api-client-react/src/generated`) lebih lengkap dan dipakai server/frontend. Codegen akan menghapus schema seperti `CarterSettingsBody`/`KendaraanBody` dan merusak build. Lengkapi dulu `openapi.yaml` sebelum codegen.
- VAPID keys sudah di-generate baru — push subscriptions lama tidak akan bekerja
- Cloudinary untuk upload foto, Fonnte untuk OTP WhatsApp

## Secrets yang dibutuhkan

- `DATABASE_URL` ✅ sudah ada (Replit Postgres)
- `SESSION_SECRET` ✅ sudah ada
- `VAPID_PUBLIC_KEY` ✅ sudah di-set (baru, di environment Replit ini)
- `VAPID_PRIVATE_KEY` ✅ sudah di-set (baru, di environment Replit ini)
- `VAPID_SUBJECT` ✅ sudah di-set
- `CLOUDINARY_CLOUD_NAME` ⚠️ belum di-set (upload foto nonaktif sampai diisi)
- `CLOUDINARY_API_KEY` ⚠️ belum di-set
- `CLOUDINARY_API_SECRET` ⚠️ belum di-set
- `FONNTE_TOKEN` ⚠️ belum di-set (OTP WhatsApp jatuh ke log console di dev sampai diisi)

## Pointers

- Lihat skill `pnpm-workspace` untuk struktur workspace, TypeScript setup, dan package details
