---
name: Admin surfaces a new booking type must touch
description: Checklist of admin surfaces to wire when adding a booking type (reguler/carter/rental/...).
---

When adding a new booking type to RUTE (e.g. rental alongside reguler & carter), the
mitra/user side being done does NOT mean admin is done. A new booking type must be wired into
ALL of these admin surfaces or it silently goes missing from admin:

1. Dedicated admin page + nav entry (e.g. `admin-rental.tsx` + `admin-layout.tsx` nav array).
2. Central **Verifikasi Pembayaran** (`/admin/payments` backend + `admin-payments.tsx`):
   add the type's array to the response, a tab, confirm/reject routing to
   `/admin/payments/<type>/:id/{confirm|reject}`, and the mitra-bank-info block (nett 90%
   transfer needs driver bank fields joined in — for rental the join is
   rental_bookings → rental_kendaraan → users(pay_driver)).
3. **Laporan Keuangan** (`/admin/laporan` backend + `admin-laporan.tsx`): compute items +
   totals (`total_*`, `komisi_platform_*`, `nett_driver_*`), include in grand totals, and add
   breakdown card / table rows / CSV export.
4. **Dashboard stats** (`/admin/stats`): fold into `total_bookings` and `pendapatan_total`
   (dashboard shows aggregates, not per-type cards, so no UI change needed there).

**Why:** rental shipped with only the dedicated page + endpoints; the payments-verification tab
and the finance report were missing, so rental payments/revenue were invisible to admin even
though the backend already returned some of the data. Easy to miss because each surface lives
in a different file.

**How to apply:** revenue status filters differ by type — reguler/carter laporan count
`paid|confirmed`; rental counts `paid|confirmed|aktif|selesai` (its status flow is
pending→paid→confirmed→aktif→selesai|batal). Keep komisi at the shared 10% platform rate.
