---
name: users.kota casing vs kota_list
description: Why joins between users.kota and kota_list.nama_kota must be case-insensitive
---

# users.kota is lowercase, kota_list.nama_kota is capitalized

`users.kota` is stored **lowercase** — the registration form writes the option
`value={k.toLowerCase()}` (both driver step 2 and penumpang step 1 in
`register.tsx`). But `kota_list.nama_kota` is seeded **capitalized**
("Banjarmasin", "Berau", ...) and `kota_list.provinsi`/`wilayah` are populated.

**Why:** A plain `eq(users.kota, kota_list.nama_kota)` join is case-sensitive in
Postgres and silently returns NULL for provinsi/wilayah even when the city exists
— this is what made the admin "Provinsi" column show "-" for every user.

**How to apply:** Any join from `users.kota` to `kota_list` must compare
case-insensitively, e.g. `lower(users.kota) = lower(kota_list.nama_kota)`.
Note `kota_list` also contains non-Kaltim cities (e.g. Banjarmasin → Kalimantan
Selatan), so provinsi is not always "Kalimantan Timur".
