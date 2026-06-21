---
name: Rental jam ketersediaan invariant
description: Rental units carry availability hours (24 jam vs jam_buka/jam_tutup); search filtering and booking enforcement must stay in lockstep.
---

Rental offers (`rental_kendaraan`) have `tersedia_24jam` (bool, default true) plus optional `jam_buka`/`jam_tutup` (TEXT "HH:MM"). When not 24 jam, both jam fields are required and `jam_tutup > jam_buka`; when 24 jam they are nulled on write.

**Rule:** The search-time filter (`/rental/search`, hides units whose hours don't cover the requested `jam_mulai`/`jam_selesai`) and the booking-time enforcement (`/rental/:id/book` tx) must use identical window logic, and `rental-book.tsx` `validationMsg` must mirror it. If they diverge, the penyewa sees a bookable unit on search but gets a 400 at booking (dead-end UX) — the exact thing this feature was built to avoid.

**Why:** Whole feature exists to keep the Traveloka-style read-only booking flow free of dead-ends (consistent with date-range filtering already in place).

**How to apply:** Any future change to the jam window comparison (boundary inclusivity, overnight hours, etc.) must be made in all three places at once: search filter, booking tx, and the frontend validationMsg.
