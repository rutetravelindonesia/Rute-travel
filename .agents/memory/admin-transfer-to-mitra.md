---
name: Admin transfer-to-mitra (nett 90%)
description: Business rule + UI parity for showing which mitra/rekening admin transfers to, for both Carter and Reguler bookings.
---

# Admin "Info Transfer ke Mitra"

Business model: penumpang pays the platform, then the platform forwards the fare
to the mitra (driver). Platform commission = **10%**, so the mitra receives
**nett 90%** of `total_amount` (`Math.round(total_amount * 0.9)`).

**Rule:** wherever admin acts on a paid booking, show the target mitra's bank
details (`nama_bank`, `no_rekening`, `nama_pemilik_rekening`) plus the nett-90%
nominal, with a fallback when the mitra hasn't filled in rekening info.

**Why:** admin must not transfer to the wrong mitra. Carter and Reguler must stay
in parity — any change to the commission rate or the transfer-info block in one
flow must be mirrored in the other.

**How to apply:**
- Carter surfaces this in the carter detail panel (admin-carter.tsx).
- Reguler surfaces this on the Verifikasi Pembayaran page (admin-payments.tsx),
  the actual payment-action surface (the grouped admin-bookings list only carries
  driver {id, nama}, no bank fields).
- Driver bank fields come from the `usersTable` driver record; for reguler the
  `/admin/payments` query joins schedule -> driver via an aliased usersTable
  (`pay_driver`) to avoid colliding with the penumpang join.
