---
name: Rental booking double-booking prevention
description: The lock + overlap invariant that keeps rental_bookings from double-booking a kendaraan.
---

Rental booking (`POST /rental/:id/book`) must prevent two penyewa from booking the same
kendaraan for overlapping date ranges.

The invariant (do not break it on future edits):
- The whole booking runs inside one `db.transaction`.
- It first locks the offer row: `select ... from rental_kendaraan where id = :id for("update")`.
  That row lock serializes concurrent booking transactions for the same offer/kendaraan.
- AFTER acquiring the lock, it queries `rental_bookings` for any row with the same
  `rental_id`, status in (`pending`,`paid`,`confirmed`,`aktif`), and date overlap
  (`tanggal_mulai <= new_selesai AND tanggal_selesai >= new_mulai`; columns are text
  `YYYY-MM-DD`, lexicographic compare is correct). If any exist → reject 409.
- Only then insert the new booking.

**Why:** without the overlap query the lock alone does nothing useful — an architect review
flagged that an earlier version locked the offer row but never checked existing bookings, so
double-booking was still possible. The lock is only safe because the overlap check sits inside
it; moving the check outside the transaction reintroduces the race.

**How to apply:** any change to rental booking creation, status set, or the "active" status
list must keep the check inside the locked transaction and keep the active-status list in sync
(a status that should block new bookings must be in the `inArray` list).

Also: `rental_kendaraan` has a DB `UNIQUE(driver_id, kendaraan_id)` index
(`rental_kendaraan_driver_kendaraan_unique`) so one mitra cannot create duplicate offers for
the same vehicle even under a race; the app-level check is not sufficient alone.
