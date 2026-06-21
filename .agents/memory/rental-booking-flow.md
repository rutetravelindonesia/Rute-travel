---
name: Rental booking flow (Traveloka-style)
description: Where rental Mode + Periode are chosen and how they flow into booking; keep booking read-only.
---

# Rental booking flow

Penyewa chooses **Mode Rental** and **Periode Sewa** (tanggal mulai/selesai + jam ambil/kembali) on the SEARCH page (`rental-cari.tsx`), NOT the booking page.

- Search calls `/rental/search` with `tanggal_mulai` + `tanggal_selesai`. When both present, backend hides units whose availability window (`tersedia_mulai`/`tersedia_sampai`) does not cover the range AND units with a committed booking overlapping the range. Without dates it falls back to "today".
- Selection is carried to booking via query string: `/rental/:id/book?mulai=&selesai=&jamMulai=&jamSelesai=&mode=`.
- Booking page (`rental-book.tsx`) renders these as a **read-only** "Detail Sewa" summary. Exception: a `dua-duanya` offer with no concrete `mode` in the query still shows a mode toggle. If `mulai`/`selesai` query params are missing, it redirects to `/rental/cari` (no editable date fallback).

**Why:** user explicitly chose this flow (option A) so penyewa never picks a date that turns out unavailable, and the booking page just confirms location & pays.

**How to apply:** do not re-add editable date/mode inputs to the booking page; if booking needs new trip params, source them from search + query string and keep the booking summary read-only. Backend `/rental/:id/book` remains the source of truth and re-validates window + overlap regardless of what the URL says.
