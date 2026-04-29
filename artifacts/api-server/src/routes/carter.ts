// carter routes
import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  sessionsTable,
  usersTable,
  carterSettingsTable,
  carterDatesTable,
  carterRoutesTable,
  carterBookingsTable,
  kendaraanTable,
  ratingsTable,
} from "@workspace/db";
import { CarterSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const now = new Date();
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token)));
  if (!session || session.expires_at < now) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.user_id));
  return user ?? null;
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SearchQuery = z.object({
  origin_city: z.string().min(2).max(100),
  destination_city: z.string().min(2).max(100),
  date: z.string().regex(DATE_RE),
  time: z.string().regex(TIME_RE),
});

const AddressBody = z.object({
  label: z.string().min(2).max(200),
  detail: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

const CarterBookBody = z.object({
  date: z.string().regex(DATE_RE),
  time: z.string().regex(TIME_RE),
  destination_city: z.string().min(2).max(100),
  pickup: AddressBody,
  dropoff: AddressBody,
  payment_method: z.enum(["qris", "transfer", "ewallet"]),
});

const PaymentProofBody = z.object({
  url: z.string().min(3).max(1000),
});

router.post("/carter/settings", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa mengatur Carter." });
    return;
  }

  const parsed = CarterSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { kendaraan_id, origin_city, is_24_hours, hours_start, hours_end, dates, routes } = parsed.data;

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, kendaraan_id));
  if (!k || k.driver_id !== user.id) {
    res.status(400).json({ error: "Kendaraan tidak valid atau bukan milik Anda." });
    return;
  }

  if (!is_24_hours && (!hours_start || !hours_end)) {
    res.status(400).json({ error: "Jam mulai dan jam akhir wajib diisi jika bukan 24 jam." });
    return;
  }

  if (!is_24_hours && hours_start && hours_end && hours_start >= hours_end) {
    res.status(400).json({ error: "Jam akhir harus lebih besar dari jam mulai (lintas tengah malam belum didukung)." });
    return;
  }

  if (dates.length === 0) {
    res.status(400).json({ error: "Pilih minimal 1 tanggal available." });
    return;
  }

  if (routes.length === 0) {
    res.status(400).json({ error: "Pilih minimal 1 rute tujuan." });
    return;
  }

  for (const r of routes) {
    if (r.destination_city === origin_city) {
      res.status(400).json({ error: "Kota tujuan tidak boleh sama dengan kota asal." });
      return;
    }
  }

  const { settingsId, protectedDates } = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(carterSettingsTable)
      .where(eq(carterSettingsTable.driver_id, user.id));

    let settingsId: number;
    let protectedDates: string[] = [];

    if (existing) {
      await tx
        .update(carterSettingsTable)
        .set({
          kendaraan_id,
          origin_city,
          is_24_hours,
          hours_start: is_24_hours ? null : hours_start,
          hours_end: is_24_hours ? null : hours_end,
          is_active: true,
          updated_at: new Date(),
        })
        .where(eq(carterSettingsTable.id, existing.id));
      settingsId = existing.id;

      // Cari tanggal mana saja yang ingin dihapus (ada di DB tapi tidak ada di request)
      const existingDates = await tx
        .select({ date: carterDatesTable.date })
        .from(carterDatesTable)
        .where(eq(carterDatesTable.settings_id, settingsId));
      const existingDateSet = existingDates.map((d) => d.date);
      const datesToRemove = existingDateSet.filter((d) => !dates.includes(d));

      // Cek apakah tanggal yang ingin dihapus punya pesanan aktif
      if (datesToRemove.length > 0) {
        const activeBookingsOnRemovedDates = await tx
          .select({ date: carterBookingsTable.travel_date })
          .from(carterBookingsTable)
          .where(
            and(
              eq(carterBookingsTable.settings_id, settingsId),
              inArray(carterBookingsTable.status, ["pending", "paid"]),
              inArray(carterBookingsTable.travel_date, datesToRemove)
            )
          );
        protectedDates = [...new Set(activeBookingsOnRemovedDates.map((r) => r.date))];
      }

      // Hapus semua tanggal kecuali yang dilindungi (punya pesanan aktif)
      const safeDatesToDelete = existingDateSet.filter((d) => !protectedDates.includes(d));
      if (safeDatesToDelete.length > 0) {
        await tx
          .delete(carterDatesTable)
          .where(
            and(
              eq(carterDatesTable.settings_id, settingsId),
              inArray(carterDatesTable.date, safeDatesToDelete)
            )
          );
      }
      await tx.delete(carterRoutesTable).where(eq(carterRoutesTable.settings_id, settingsId));
    } else {
      const [created] = await tx
        .insert(carterSettingsTable)
        .values({
          driver_id: user.id,
          kendaraan_id,
          origin_city,
          is_24_hours,
          hours_start: is_24_hours ? null : hours_start,
          hours_end: is_24_hours ? null : hours_end,
          is_active: true,
        })
        .returning();
      settingsId = created.id;
    }

    // Gabungkan tanggal dari request + tanggal yang dilindungi, hindari duplikat
    const allDatesToInsert = [...new Set([...dates, ...protectedDates])];

    // Hanya insert tanggal yang belum ada di DB (hindari konflik)
    const alreadyInDb = await tx
      .select({ date: carterDatesTable.date })
      .from(carterDatesTable)
      .where(eq(carterDatesTable.settings_id, settingsId));
    const alreadyInDbSet = new Set(alreadyInDb.map((d) => d.date));
    const newDates = allDatesToInsert.filter((d) => !alreadyInDbSet.has(d));
    if (newDates.length > 0) {
      await tx.insert(carterDatesTable).values(newDates.map((d) => ({ settings_id: settingsId, date: d })));
    }

    await tx.insert(carterRoutesTable).values(
      routes.map((r) => ({
        settings_id: settingsId,
        destination_city: r.destination_city,
        price: r.price,
      }))
    );

    return { settingsId, protectedDates };
  });

  req.log.info({ settingsId, driverId: user.id, protectedDates }, "Carter settings saved");

  const message =
    protectedDates.length > 0
      ? `Pengaturan disimpan. ${protectedDates.length} tanggal tidak bisa dihapus karena sudah ada pesanan aktif: ${protectedDates.join(", ")}.`
      : "Pengaturan Carter berhasil disimpan.";

  res.status(200).json({ id: settingsId, message, protected_dates: protectedDates });
});

router.get("/carter/settings/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa melihat Carter." });
    return;
  }

  const [settings] = await db
    .select()
    .from(carterSettingsTable)
    .where(eq(carterSettingsTable.driver_id, user.id));

  if (!settings) {
    res.json(null);
    return;
  }

  const [dates, routes, bookedRows] = await Promise.all([
    db.select().from(carterDatesTable).where(eq(carterDatesTable.settings_id, settings.id)),
    db.select().from(carterRoutesTable).where(eq(carterRoutesTable.settings_id, settings.id)),
    db
      .select({ date: carterBookingsTable.travel_date })
      .from(carterBookingsTable)
      .where(
        and(
          eq(carterBookingsTable.settings_id, settings.id),
          inArray(carterBookingsTable.status, ["pending", "paid"])
        )
      ),
  ]);

  const bookedDates = [...new Set(bookedRows.map((r) => r.date))];

  res.json({
    ...settings,
    dates: dates.map((d) => d.date),
    booked_dates: bookedDates,
    routes: routes.map((r) => ({ destination_city: r.destination_city, price: r.price })),
  });
});

router.delete("/carter/settings/date/:date", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }

  const dateStr = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    res.status(400).json({ error: "Format tanggal tidak valid." });
    return;
  }

  const [settings] = await db.select().from(carterSettingsTable).where(eq(carterSettingsTable.driver_id, user.id));
  if (!settings) { res.status(404).json({ error: "Pengaturan Carter tidak ditemukan." }); return; }

  // Cek apakah ada pesanan aktif pada tanggal ini
  const [activeBooking] = await db
    .select({ id: carterBookingsTable.id })
    .from(carterBookingsTable)
    .where(
      and(
        eq(carterBookingsTable.settings_id, settings.id),
        eq(carterBookingsTable.travel_date, dateStr),
        inArray(carterBookingsTable.status, ["pending", "paid"])
      )
    );

  if (activeBooking) {
    res.status(400).json({ error: "Tidak bisa membatalkan — sudah ada pesanan aktif pada tanggal ini." });
    return;
  }

  await db
    .delete(carterDatesTable)
    .where(and(eq(carterDatesTable.settings_id, settings.id), eq(carterDatesTable.date, dateStr)));

  res.json({ message: "Tanggal berhasil dihapus dari jadwal Carter." });
});

router.get("/carter/search", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Parameter pencarian tidak valid (origin_city, destination_city, date, time)." });
    return;
  }
  const { origin_city, destination_city, date, time } = parsed.data;

  const rows = await db
    .select({
      settings_id: carterSettingsTable.id,
      driver_id: carterSettingsTable.driver_id,
      origin_city: carterSettingsTable.origin_city,
      is_24_hours: carterSettingsTable.is_24_hours,
      hours_start: carterSettingsTable.hours_start,
      hours_end: carterSettingsTable.hours_end,
      is_active: carterSettingsTable.is_active,
      route_destination: carterRoutesTable.destination_city,
      route_price: carterRoutesTable.price,
      driver_nama: usersTable.nama,
      driver_foto_profil: usersTable.foto_profil,
      kendaraan_id: kendaraanTable.id,
      kendaraan_jenis: kendaraanTable.jenis,
      kendaraan_merek: kendaraanTable.merek,
      kendaraan_model: kendaraanTable.model,
      kendaraan_warna: kendaraanTable.warna,
      kendaraan_plat: kendaraanTable.plat_nomor,
      kendaraan_foto: kendaraanTable.foto_url,
    })
    .from(carterSettingsTable)
    .innerJoin(carterDatesTable, eq(carterDatesTable.settings_id, carterSettingsTable.id))
    .innerJoin(carterRoutesTable, eq(carterRoutesTable.settings_id, carterSettingsTable.id))
    .innerJoin(usersTable, eq(usersTable.id, carterSettingsTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, carterSettingsTable.kendaraan_id))
    .where(
      and(
        eq(carterSettingsTable.is_active, true),
        eq(carterSettingsTable.origin_city, origin_city),
        eq(carterDatesTable.date, date),
        eq(carterRoutesTable.destination_city, destination_city)
      )
    );

  const filtered = rows
    .filter((r) => r.kendaraan_id !== null)
    .filter((r) => {
      if (r.is_24_hours) return true;
      if (!r.hours_start || !r.hours_end) return false;
      return time >= r.hours_start && time <= r.hours_end;
    })
    .filter((r) => r.driver_id !== user.id);

  const result = filtered.map((r) => ({
    settings_id: r.settings_id,
    origin_city: r.origin_city,
    destination_city: r.route_destination,
    price: r.route_price,
    is_24_hours: r.is_24_hours,
    hours_start: r.hours_start,
    hours_end: r.hours_end,
    driver: { id: r.driver_id, nama: r.driver_nama, foto_profil: r.driver_foto_profil ?? null },
    kendaraan: {
      id: r.kendaraan_id,
      jenis: r.kendaraan_jenis,
      merek: r.kendaraan_merek,
      model: r.kendaraan_model,
      warna: r.kendaraan_warna,
      plat_nomor: r.kendaraan_plat,
      foto_url: r.kendaraan_foto,
    },
  }));

  res.json(result);
});

router.get("/carter/mitra/:settings_id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const settingsId = parseInt(req.params.settings_id, 10);
  if (isNaN(settingsId)) {
    res.status(400).json({ error: "ID mitra tidak valid." });
    return;
  }

  const [s] = await db
    .select()
    .from(carterSettingsTable)
    .where(eq(carterSettingsTable.id, settingsId));
  if (!s || !s.is_active) {
    res.status(404).json({ error: "Mitra Carter tidak ditemukan." });
    return;
  }

  const [driver] = await db.select().from(usersTable).where(eq(usersTable.id, s.driver_id));
  const [kendaraan] = s.kendaraan_id
    ? await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, s.kendaraan_id))
    : [null];
  const dates = await db.select().from(carterDatesTable).where(eq(carterDatesTable.settings_id, s.id));
  const routes = await db.select().from(carterRoutesTable).where(eq(carterRoutesTable.settings_id, s.id));

  res.json({
    settings_id: s.id,
    origin_city: s.origin_city,
    is_24_hours: s.is_24_hours,
    hours_start: s.hours_start,
    hours_end: s.hours_end,
    driver: driver
      ? { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? null }
      : null,
    kendaraan: kendaraan
      ? {
          id: kendaraan.id,
          jenis: kendaraan.jenis,
          merek: kendaraan.merek,
          model: kendaraan.model,
          warna: kendaraan.warna,
          plat_nomor: kendaraan.plat_nomor,
          foto_url: kendaraan.foto_url,
        }
      : null,
    dates: dates.map((d) => d.date),
    routes: routes.map((r) => ({ destination_city: r.destination_city, price: r.price })),
  });
});

router.post("/carter/:settings_id/book", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "penumpang") {
    res.status(403).json({ error: "Hanya penumpang yang bisa memesan Carter." });
    return;
  }

  const settingsId = parseInt(req.params.settings_id, 10);
  if (isNaN(settingsId)) {
    res.status(400).json({ error: "ID mitra tidak valid." });
    return;
  }

  const parsed = CarterBookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, time, destination_city, pickup, dropoff, payment_method } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(carterSettingsTable)
      .where(eq(carterSettingsTable.id, settingsId))
      .for("update");
    if (!s || !s.is_active) {
      return { error: "Mitra Carter tidak ditemukan atau tidak aktif.", status: 404 } as const;
    }
    if (s.driver_id === user.id) {
      return { error: "Tidak bisa memesan Carter sendiri.", status: 400 } as const;
    }

    const [dateRow] = await tx
      .select()
      .from(carterDatesTable)
      .where(and(eq(carterDatesTable.settings_id, settingsId), eq(carterDatesTable.date, date)));
    if (!dateRow) {
      return { error: "Mitra tidak available pada tanggal tersebut.", status: 400 } as const;
    }

    if (!s.is_24_hours) {
      if (!s.hours_start || !s.hours_end || time < s.hours_start || time > s.hours_end) {
        return {
          error: `Jam ${time} di luar jam operasional mitra (${s.hours_start ?? "-"}–${s.hours_end ?? "-"}).`,
          status: 400,
        } as const;
      }
    }

    const [routeRow] = await tx
      .select()
      .from(carterRoutesTable)
      .where(
        and(
          eq(carterRoutesTable.settings_id, settingsId),
          eq(carterRoutesTable.destination_city, destination_city)
        )
      );
    if (!routeRow) {
      return { error: "Rute tujuan tidak dilayani oleh mitra ini.", status: 400 } as const;
    }

    const now = new Date();
    const requested = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(requested.getTime())) {
      return { error: "Tanggal/jam tidak valid.", status: 400 } as const;
    }
    if (requested.getTime() <= now.getTime()) {
      return { error: "Waktu berangkat sudah lewat. Pilih waktu yang akan datang.", status: 400 } as const;
    }

    if (!s.kendaraan_id) {
      return { error: "Mitra belum mendaftarkan kendaraan.", status: 400 } as const;
    }

    const [created] = await tx
      .insert(carterBookingsTable)
      .values({
        settings_id: settingsId,
        penumpang_id: user.id,
        origin_city: s.origin_city,
        destination_city: routeRow.destination_city,
        travel_date: date,
        travel_time: time,
        pickup_label: pickup.label,
        pickup_detail: pickup.detail ?? null,
        pickup_lat: pickup.lat ?? null,
        pickup_lng: pickup.lng ?? null,
        dropoff_label: dropoff.label,
        dropoff_detail: dropoff.detail ?? null,
        dropoff_lat: dropoff.lat ?? null,
        dropoff_lng: dropoff.lng ?? null,
        total_amount: routeRow.price,
        payment_method,
        status: "pending",
      })
      .returning();

    return { ok: true as const, booking: created };
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }

  req.log.info(
    { bookingId: result.booking.id, settingsId, userId: user.id },
    "Carter booked"
  );
  res.status(201).json(result.booking);
});

async function loadCarterBookingDetail(bookingId: number, currentUserId?: number) {
  const [b] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, bookingId));
  if (!b) return null;

  const [s] = await db
    .select()
    .from(carterSettingsTable)
    .where(eq(carterSettingsTable.id, b.settings_id));

  const [driver] = s
    ? await db.select().from(usersTable).where(eq(usersTable.id, s.driver_id))
    : [null];

  const [penumpang] = b.penumpang_id
    ? await db.select().from(usersTable).where(eq(usersTable.id, b.penumpang_id))
    : [null];

  const [kendaraan] = s?.kendaraan_id
    ? await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, s.kendaraan_id))
    : [null];

  let myRating: { stars: number; comment: string | null } | null = null;
  if (currentUserId) {
    try {
      const result = await pool.query<{ stars: number; comment: string | null }>(
        `SELECT stars, comment FROM ratings WHERE booking_id = $1 AND rater_id = $2 LIMIT 1`,
        [bookingId, currentUserId],
      );
      myRating = result.rows[0] ?? null;
    } catch {
      myRating = null;
    }
  }

  return {
    ...b,
    driver: driver
      ? { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? null, no_whatsapp: driver.no_whatsapp ?? null }
      : null,
    penumpang: penumpang
      ? { id: penumpang.id, nama: penumpang.nama, no_whatsapp: penumpang.no_whatsapp ?? null, foto_profil: penumpang.foto_profil ?? null }
      : null,
    kendaraan: kendaraan
      ? {
          id: kendaraan.id,
          jenis: kendaraan.jenis,
          merek: kendaraan.merek,
          model: kendaraan.model,
          warna: kendaraan.warna,
          plat_nomor: kendaraan.plat_nomor,
          foto_url: kendaraan.foto_url,
        }
      : null,
    settings: s
      ? {
          id: s.id,
          driver_id: s.driver_id,
          is_24_hours: s.is_24_hours,
          hours_start: s.hours_start,
          hours_end: s.hours_end,
          origin_city: s.origin_city,
        }
      : null,
    my_rating: myRating ?? null,
  };
}

router.get("/carter-bookings/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "penumpang") {
    res.status(403).json({ error: "Hanya penumpang yang bisa melihat carter sendiri." });
    return;
  }

  const rows = await db
    .select({
      b: carterBookingsTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(carterBookingsTable)
    .leftJoin(carterSettingsTable, eq(carterSettingsTable.id, carterBookingsTable.settings_id))
    .leftJoin(usersTable, eq(usersTable.id, carterSettingsTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, carterSettingsTable.kendaraan_id))
    .where(eq(carterBookingsTable.penumpang_id, user.id))
    .orderBy(sql`${carterBookingsTable.created_at} DESC`);

  res.json(
    rows.map(({ b, driver, kendaraan }) => ({
      ...b,
      driver: driver ? { id: driver.id, nama: driver.nama, no_whatsapp: driver.no_whatsapp ?? null } : null,
      kendaraan: kendaraan ? { id: kendaraan.id, merek: kendaraan.merek, model: kendaraan.model, plat_nomor: kendaraan.plat_nomor } : null,
    })),
  );
});

router.get("/carter-bookings/incoming", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa melihat pesanan carter masuk." });
    return;
  }

  const rows = await db
    .select({
      b: carterBookingsTable,
      penumpang: usersTable,
    })
    .from(carterBookingsTable)
    .innerJoin(carterSettingsTable, eq(carterSettingsTable.id, carterBookingsTable.settings_id))
    .leftJoin(usersTable, eq(usersTable.id, carterBookingsTable.penumpang_id))
    .where(eq(carterSettingsTable.driver_id, user.id))
    .orderBy(sql`${carterBookingsTable.created_at} DESC`);

  res.json(
    rows.map(({ b, penumpang }) => ({
      ...b,
      penumpang: penumpang ? { id: penumpang.id, nama: penumpang.nama, no_whatsapp: penumpang.no_whatsapp ?? null } : null,
    })),
  );
});

router.get("/carter-bookings/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID booking tidak valid." });
    return;
  }
  const detail = await loadCarterBookingDetail(id, user.id);
  if (!detail) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }
  const isOwnerPenumpang = detail.penumpang_id === user.id;
  const isOwnerMitra = detail.settings?.driver_id === user.id;
  if (!isOwnerPenumpang && !isOwnerMitra) {
    res.status(403).json({ error: "Tidak boleh mengakses pesanan ini." });
    return;
  }
  res.json({ ...detail, is_mitra: isOwnerMitra });
});

router.post("/carter-bookings/:id/confirm-pickup", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [booking] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (booking.penumpang_id !== user.id) { res.status(403).json({ error: "Bukan pesanan Anda." }); return; }
  if (!["paid", "aktif"].includes(booking.status)) {
    res.status(400).json({ error: "Status tidak memungkinkan konfirmasi." }); return;
  }
  if (booking.pickup_confirmed_at) {
    res.json({ ok: true }); return;
  }
  await db.update(carterBookingsTable).set({ pickup_confirmed_at: new Date(), updated_at: new Date() }).where(eq(carterBookingsTable.id, id));
  res.json({ ok: true });
});

router.post("/carter-bookings/:id/confirm-dropoff", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [booking] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (booking.penumpang_id !== user.id) { res.status(403).json({ error: "Bukan pesanan Anda." }); return; }
  if (booking.status !== "selesai" && booking.trip_progress !== "selesai") {
    res.status(400).json({ error: "Trip belum selesai." }); return;
  }
  if (booking.dropoff_confirmed_at) {
    res.json({ ok: true }); return;
  }
  await db.update(carterBookingsTable).set({ dropoff_confirmed_at: new Date(), updated_at: new Date() }).where(eq(carterBookingsTable.id, id));
  res.json({ ok: true });
});

router.post("/carter-bookings/:id/cancel", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [booking] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!booking) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (booking.penumpang_id !== user.id) { res.status(403).json({ error: "Tidak boleh membatalkan pesanan ini." }); return; }
  if (!["pending", "paid"].includes(booking.status)) {
    res.status(400).json({ error: "Pesanan tidak dapat dibatalkan karena sudah aktif atau selesai." }); return;
  }
  await db.update(carterBookingsTable).set({ status: "batal" }).where(eq(carterBookingsTable.id, id));
  res.json({ ok: true });
});

router.post("/carter-bookings/:id/payment-proof", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID booking tidak valid." });
    return;
  }
  const parsed = PaymentProofBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [b] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!b) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }
  if (b.penumpang_id !== user.id) {
    res.status(403).json({ error: "Bukan pesanan Anda." });
    return;
  }
  if (b.status !== "pending" && b.status !== "paid") {
    res.status(400).json({ error: "Status pesanan tidak memungkinkan upload bukti." });
    return;
  }

  await db
    .update(carterBookingsTable)
    .set({ payment_proof_url: parsed.data.url, status: "paid", updated_at: new Date() })
    .where(eq(carterBookingsTable.id, id));

  req.log.info({ bookingId: id, userId: user.id }, "Carter payment proof uploaded");
  res.json({ ok: true });
});

router.patch("/carter-bookings/:id/driver-location", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat dan lng harus berupa angka." });
    return;
  }
  const [b] = await db
    .select({ penumpang_id: carterBookingsTable.penumpang_id, settings_id: carterBookingsTable.settings_id, status: carterBookingsTable.status })
    .from(carterBookingsTable)
    .where(eq(carterBookingsTable.id, id));
  if (!b) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }
  const [s] = await db.select({ driver_id: carterSettingsTable.driver_id }).from(carterSettingsTable).where(eq(carterSettingsTable.id, b.settings_id));
  if (!s || s.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan mitra untuk pesanan ini." });
    return;
  }
  await db
    .update(carterBookingsTable)
    .set({ driver_lat: lat, driver_lng: lng, driver_location_updated_at: new Date() })
    .where(eq(carterBookingsTable.id, id));
  res.json({ ok: true });
});

router.patch("/carter-bookings/:id/trip-progress", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const [b] = await db
    .select({ settings_id: carterBookingsTable.settings_id, status: carterBookingsTable.status, trip_progress: carterBookingsTable.trip_progress })
    .from(carterBookingsTable)
    .where(eq(carterBookingsTable.id, id));
  if (!b) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }
  const [s] = await db.select({ driver_id: carterSettingsTable.driver_id }).from(carterSettingsTable).where(eq(carterSettingsTable.id, b.settings_id));
  if (!s || s.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan mitra untuk pesanan ini." });
    return;
  }
  if (b.status === "selesai" || b.trip_progress === "selesai") {
    res.status(400).json({ error: "Perjalanan sudah selesai." });
    return;
  }
  const NEXT: Record<string, string> = {
    menunggu: "menuju_jemput",
    menuju_jemput: "sudah_jemput",
    sudah_jemput: "dalam_perjalanan",
    dalam_perjalanan: "selesai",
  };
  const requestedProgress = (req.body as Record<string, unknown> | undefined)?.trip_progress as string | undefined;
  const currentProgress = b.trip_progress ?? "menunggu";
  const next_progress = requestedProgress ?? NEXT[currentProgress];
  const allowed = ["menunggu", "menuju_jemput", "sudah_jemput", "dalam_perjalanan", "selesai"];
  if (!next_progress || !allowed.includes(next_progress)) {
    res.status(400).json({ error: "trip_progress tidak valid." });
    return;
  }
  const updates: Record<string, unknown> = { trip_progress: next_progress, updated_at: new Date() };
  if (next_progress === "selesai") {
    updates.status = "selesai";
  } else if (b.status === "paid") {
    updates.status = "aktif";
  }
  await db.update(carterBookingsTable).set(updates).where(eq(carterBookingsTable.id, id));
  req.log.info({ bookingId: id, trip_progress: next_progress }, "Carter trip progress updated");
  res.json({ ok: true, trip_progress: next_progress });
});

router.post("/carter-bookings/:id/rate", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const { stars, comment } = (req.body ?? {}) as { stars?: number; comment?: string };
  if (!stars || stars < 1 || stars > 5) {
    res.status(400).json({ error: "Bintang harus antara 1–5." }); return;
  }

  const [b] = await db
    .select({ penumpang_id: carterBookingsTable.penumpang_id, settings_id: carterBookingsTable.settings_id, status: carterBookingsTable.status })
    .from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (b.status !== "selesai") { res.status(400).json({ error: "Perjalanan belum selesai." }); return; }

  const [s] = await db.select({ driver_id: carterSettingsTable.driver_id }).from(carterSettingsTable).where(eq(carterSettingsTable.id, b.settings_id));
  if (!s) { res.status(404).json({ error: "Mitra tidak ditemukan." }); return; }

  const isPenumpang = user.id === b.penumpang_id;
  const isMitra = user.id === s.driver_id;
  if (!isPenumpang && !isMitra) { res.status(403).json({ error: "Bukan peserta perjalanan ini." }); return; }

  const ratee_id = isPenumpang ? s.driver_id : b.penumpang_id;

  try {
    const insert = await pool.query(
      `INSERT INTO ratings (booking_id, rater_id, ratee_id, stars, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [id, user.id, ratee_id, stars, comment ?? null],
    );
    if (insert.rows.length === 0) {
      await pool.query(
        `UPDATE ratings SET stars = $1, comment = $2
         WHERE rater_id = $3 AND booking_id = $4`,
        [stars, comment ?? null, user.id, id],
      );
    }
  } catch (err: any) {
    req.log.error({ err, bookingId: id }, "Carter rate error");
    res.status(500).json({ error: `DB error: ${err?.message ?? String(err)}` });
    return;
  }

  req.log.info({ bookingId: id, rater: user.id, stars }, "Carter booking rated");
  res.json({ ok: true });
});

export default router;
