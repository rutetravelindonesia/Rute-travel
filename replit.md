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

- ⚠️ JANGAN jalankan `pnpm --filter @workspace/db run push` (atau `push-force`) ke database Railway — schema yang di-commit tidak 100% sama dengan DB produksi, jadi `drizzle-kit push` ingin MENGHAPUS tabel yang tidak terdeklarasi (mis. `notifications` berisi data asli). Untuk perubahan schema yang sifatnya menambah, jalankan SQL langsung: `psql "$RAILWAY_DATABASE_URL" -c "ALTER TABLE <t> ADD COLUMN IF NOT EXISTS <kolom> <tipe>;"`, lalu sinkronkan file schema Drizzle, lalu restart api-server
- ⚠️ JANGAN jalankan `pnpm --filter @workspace/api-spec run codegen` — `openapi.yaml` sudah usang (hanya health + auth), sedangkan file generated yang di-commit (`lib/api-zod/src/generated`, `lib/api-client-react/src/generated`) lebih lengkap dan dipakai server/frontend. Codegen akan menghapus schema seperti `CarterSettingsBody`/`KendaraanBody` dan merusak build. Lengkapi dulu `openapi.yaml` sebelum codegen.
- VAPID keys sudah di-generate baru — push subscriptions lama tidak akan bekerja
- Cloudinary untuk upload foto, Fonnte untuk OTP WhatsApp

## Database (PENTING)

- **Sumber data utama = Railway Postgres** (data produksi asli yang dipakai aplikasi Play Store).
- Aplikasi membaca `RAILWAY_DATABASE_URL` lebih dulu, baru `DATABASE_URL` (lihat `lib/db/src/index.ts`). `RAILWAY_DATABASE_URL` di-set ke alamat **publik** Railway (`yamabiko.proxy.rlwy.net:47329`), bukan alamat internal `postgres.railway.internal` (yang hanya jalan di dalam Railway).
- Database Replit (`DATABASE_URL`) ada tapi **tidak dipakai** selama `RAILWAY_DATABASE_URL` terisi.
- **Alasan pakai Railway:** data tidak terikat ke akun Replit — kalau ganti akun Replit (karena limit usage), cukup clone kode lagi dan sambungkan ke `RAILWAY_DATABASE_URL` yang sama. Data pengguna aman & permanen di Railway.
- ⚠️ **Dev dan production Replit menulis ke database produksi yang sama.** Hati-hati saat testing (daftar/booking di sini = data asli pengguna).
- Boot `runMigrations`/`seedAdmin`/`seedKota` aman & idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, cek admin dulu) — tidak merusak/menduplikasi data Railway.

## Secrets yang dibutuhkan

- `RAILWAY_DATABASE_URL` ✅ di-set (alamat publik Railway — sumber data utama)
- `DATABASE_URL` ✅ ada (Replit Postgres, tidak dipakai selama RAILWAY_DATABASE_URL terisi)
- `SESSION_SECRET` ✅ sudah ada
- `VAPID_PUBLIC_KEY` ✅ di-set (pakai key asli dari setup Railway lama)
- `VAPID_PRIVATE_KEY` ✅ di-set (pakai key asli dari setup Railway lama)
- `VAPID_SUBJECT` ✅ di-set (`mailto:admin@rute.app`)
- `CLOUDINARY_CLOUD_NAME` ✅ di-set
- `CLOUDINARY_API_KEY` ✅ di-set
- `CLOUDINARY_API_SECRET` ✅ di-set
- `FONNTE_TOKEN` ✅ di-set (OTP WhatsApp aktif)

## Pointers

- Lihat skill `pnpm-workspace` untuk struktur workspace, TypeScript setup, dan package details
