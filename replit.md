# RUTE Travel App

## Overview

The RUTE Travel App is a pnpm workspace monorepo using TypeScript, designed for inter-city travel within East Kalimantan. It aims to provide a mobile-first user experience in Indonesian, with a cream/amber color scheme. The project incorporates features like "Tebengan Pulang" (carpooling), fixed schedule bookings, passenger-side charter services, and in-app chat. The long-term vision includes expanding travel services and enhancing user interaction within the region.

## User Preferences

- The user prefers a mobile-first UI with a cream/amber color scheme.
- The application should be in Bahasa Indonesia.
- The user has a strict rule: no hardcoded data or mock data should be displayed in the UI; all data must come from real-time API calls or display an empty state.
- The user emphasizes a consistent UI and wording across features, especially regarding fixed schedule (binding times) versus carpooling (estimated times).
- The user prefers that phone numbers (WhatsApp/HP) are never displayed in the UI; communication should primarily be in-app, with masked numbers if necessary.
- The user wants the agent to be aware of and strictly adhere to the domain rule that "Jadwal Tetap" (Fixed Schedule) implies binding times (no `~`), while "Tebengan Pulang" (Carpool) implies estimated/flexible times (always `~`).

## System Architecture

The application is built on a pnpm monorepo using Node.js 24 and TypeScript 5.9.

**Core Technologies:**
- **API Framework:** Express 5
- **Database:** PostgreSQL with Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Build Tool:** esbuild (CJS bundle)

**UI/UX Decisions:**
- **Color Scheme:** Cream/amber.
- **Responsiveness:** Mobile-first design.
- **Language:** Bahasa Indonesia.
- **Authentication:** Bearer token stored in `localStorage`.
- **Map Component:** `MapPicker.tsx` utilizing Leaflet and OpenStreetMap tiles with Nominatim search.
- **Consistent UI:** Strict separation of UI elements and wording for "Jadwal Tetap" (binding times) and "Tebengan Pulang" (estimated times).
- **Empty States:** All UI components handling dynamic data must display empty states if no data is available, rather than mock data.

**Key Features & Implementations:**

1.  **"Tebengan Pulang" (Carpooling):**
    *   **Schema:** `tebengan_pulang`, `tebengan_bookings` tables.
    *   **Endpoints:** `POST /api/tebengan`, `GET /api/tebengan/mine`, `GET /api/tebengan/search`, `GET /api/tebengan/:id`, `POST /api/tebengan/:id/book` (with `SELECT ... FOR UPDATE`), `DELETE /api/tebengan/:id/book`, `PATCH /api/tebengan/:id/status`.
    *   **Pages:** `tebengan-buat.tsx`, `tebengan-detail.tsx`, `cari.tsx`.

2.  **Fixed Schedule Bookings:**
    *   **Schema:** `schedule_bookings` (including `kursi text[]` for visual seat selection, payment details, and status).
    *   **Endpoints:** `GET /api/schedules/search`, `GET /api/schedules/:id`, `POST /api/schedules/:id/book` (with `SELECT ... FOR UPDATE`), `GET /api/bookings/mine`, `GET /api/bookings/:id`, `POST /api/bookings/:id/payment-proof`.
    *   **Pages:** `cari.tsx` (combined search), `jadwal-book.tsx` (visual seat layout, `MapPicker`), `booking-bayar.tsx`, `booking-etiket.tsx`.

3.  **Passenger-side Charter Bookings:**
    *   **Schema:** `carter_bookings` (similar to schedule bookings but for full vehicle rental).
    *   **Endpoints:** `GET /carter/search`, `GET /carter/mitra/:settings_id`, `POST /carter/:settings_id/book` (with `SELECT ... FOR UPDATE`), `GET /carter-bookings/mine`, `GET /carter-bookings/:id`, `POST /carter-bookings/:id/payment-proof`.
    *   **Pages:** `carter-cari.tsx`, `carter-book.tsx`, `carter-bayar.tsx`, `carter-etiket.tsx`.
    *   **Validation:** Strict regex for date/time, `Number.isFinite` check. Driver WhatsApp not exposed in search/detail, only after authenticated booking.

4.  **In-app Chat:**
    *   **Schema:** `chat_threads` (one per booking, unique index on `(booking_type, booking_id)`), `chat_messages`.
    *   **Endpoints:** `POST /chat/threads`, `GET /chat/threads/mine`, `GET /chat/threads/:id?since=<msgId>`, `POST /chat/threads/:id/messages` (with server-side number masking).
    *   **Frontend:** `chat-list.tsx` (tabs for active/history), `chat-thread.tsx` (polling, optimistic append, Enter-to-send).
    *   **Integration:** Replaced direct WhatsApp links in e-tickets with "Chat Mitra" button that initiates in-app chat.
    *   **Constraint:** Phone numbers (08xx, +62xx, 9+ digits) automatically censored `[nomor disembunyikan]` on the server.

5.  **Orders Page (Pesanan):**
    *   **Page:** `pesanan.tsx` with "Aktif" and "Riwayat" tabs.
    *   **Role-aware content:**
        *   **Passenger:** Combines `GET /bookings/mine` and `GET /carter-bookings/mine`.
        *   **Driver:** Combines `GET /bookings/incoming` and `GET /carter-bookings/incoming` (new driver-specific endpoints).
    *   **Implementation:** Uses `Promise.allSettled` for concurrent data fetching. Cards display type, localized status, route, date/time, total, counterpart name, and seat count.

6.  **Passenger Live Trip & Rating (Fixed Schedule):**
    *   **Schema Enhancements:** `schedule_bookings` with `pickup_confirmed_at`, `dropoff_confirmed_at`, `cancelled_at`. New `ratings` table (`id, schedule_id, booking_id, rater_id, ratee_id, stars, comment`) with unique index `(rater_id, booking_id)`.
    *   **New Endpoints:** `POST /bookings/:id/confirm-pickup`, `POST /bookings/:id/confirm-dropoff`, `POST /bookings/:id/cancel` (with H-1 deadline check), `POST /bookings/:id/rating` (`INSERT ... ON CONFLICT DO NOTHING`), `GET /users/:id/rating-summary`.
    *   **Frontend:** `booking-etiket.tsx` (5-stage status banner, polling, Chat/Telp buttons, Confirm Pickup/Trip Done, Rate, Cancel Booking modals), `dashboard-penumpang.tsx` (active trip cards, polling), `pesanan.tsx` (polling, combined status labels), `cari.tsx` (driver rating badge).

7. **Admin Panel:**
    *   **Route:** `/admin/*` — semua halaman admin di dalam app yang sama
    *   **Auth:** Endpoint khusus `POST /auth/admin-login` (no_whatsapp + password, cek role=admin). Akun demo: 08000000000 / admin123
    *   **DB Tables baru:** `kota_list`, `announcements`, `route_prices`, `admin_logs` (schema: `lib/db/src/schema/admin.ts`)
    *   **API Routes:** `artifacts/api-server/src/routes/admin.ts` — semua endpoint `/admin/*` dilindungi `adminGuard`
    *   **Halaman (14 fitur):** Dashboard, Users, Schedules, Bookings, Carter, Payments (verify bukti bayar), Kendaraan, Ratings, Laporan Keuangan (+ export CSV), Kota/Rute, Pengaturan Harga, Pengumuman, Log Aktivitas
    *   **Layout:** Sidebar gelap (`#1a1208`) + responsive hamburger untuk mobile — `admin-layout.tsx`

## External Dependencies

-   **PostgreSQL:** Relational database for all application data.
-   **Drizzle ORM:** TypeScript ORM for interacting with PostgreSQL.
-   **OpenAPI Specification:** Used for API contract definition and code generation.
-   **Orval:** Tool for generating API hooks and Zod schemas from OpenAPI spec.
-   **Leaflet.js:** JavaScript library for interactive maps.
-   **OpenStreetMap (OSM) Tiles:** Map data provider for `MapPicker`.
-   **Nominatim:** Geocoding service for search functionality in `MapPicker`.
-   **BNI Bank:** For payment transfers.