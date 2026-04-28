import { Router, type IRouter } from "express";
import { eq, and, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sessionsTable,
  usersTable,
  kendaraanTable,
  tebenganPulangTable,
  tebenganBookingsTable,
  tebenganWaypointsTable,
} from "@workspace/db";
import { sendPushToUser } from "../lib/push";

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

const WaypointBody = z.object({
  city: z.string().min(1).max(100),
  order_index: z.number().int().positive(),
  price_from_prev: z.number().int().min(0),
});

const CreateTebenganBody = z.object({
  kendaraan_id: z.number().int().positive(),
  origin_city: z.string().min(1).max(100),
  destination_city: z.string().min(1).max(100),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  departure_time: z.string().regex(/^\d{2}:\d{2}$/, "Format jam harus HH:MM"),
  max_kursi: z.number().int().min(1).max(20),
  price_per_seat: z.number().int().min(0),
  catatan: z.string().max(500).optional().nullable(),
  source_jadwal_id: z.number().int().positive().optional().nullable(),
  source_carter_id: z.number().int().positive().optional().nullable(),
  waypoints: z.array(WaypointBody).optional().default([]),
});

const BookTebenganBody = z.object({
  jumlah_kursi: z.number().int().min(1).max(20),
  pickup_address: z.string().min(3).max(300),
  dropoff_address: z.string().max(300).optional().nullable(),
  catatan: z.string().max(300).optional().nullable(),
  boarding_city: z.string().optional().nullable(),
  alighting_city: z.string().optional().nullable(),
});

type RouteStop = { city: string; order_index: number; price_from_prev: number };

function buildFullRoute(
  origin: string,
  destination: string,
  waypoints: RouteStop[],
): { city: string; order_index: number }[] {
  const stops = [{ city: origin, order_index: 0 }, ...waypoints.sort((a, b) => a.order_index - b.order_index)];
  if (waypoints.length === 0 || waypoints[waypoints.length - 1]?.city !== destination) {
    stops.push({ city: destination, order_index: (waypoints[waypoints.length - 1]?.order_index ?? 0) + 1 });
  }
  return stops;
}

function calcSegmentPrice(
  boardingCity: string,
  alightingCity: string,
  origin: string,
  destination: string,
  waypoints: RouteStop[],
  fullPricePerSeat: number,
): number {
  if (waypoints.length === 0) return fullPricePerSeat;
  const sorted = [...waypoints].sort((a, b) => a.order_index - b.order_index);
  const allStops = [origin, ...sorted.map((w) => w.city)];
  if (allStops[allStops.length - 1] !== destination) allStops.push(destination);
  const allPrices = [0, ...sorted.map((w) => w.price_from_prev)];
  const boardIdx = allStops.indexOf(boardingCity);
  const alightIdx = allStops.indexOf(alightingCity);
  if (boardIdx < 0 || alightIdx < 0 || alightIdx <= boardIdx) return fullPricePerSeat;
  let total = 0;
  for (let i = boardIdx + 1; i <= alightIdx; i++) {
    total += allPrices[i] ?? 0;
  }
  return total;
}

const SearchQuery = z.object({
  origin_city: z.string().optional(),
  destination_city: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const StatusUpdateBody = z.object({
  status: z.enum(["berangkat", "selesai", "batal"]),
});

async function calcKursiTerisi(tebenganId: number): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${tebenganBookingsTable.jumlah_kursi}), 0)::int`,
    })
    .from(tebenganBookingsTable)
    .where(
      and(
        eq(tebenganBookingsTable.tebengan_id, tebenganId),
        sql`${tebenganBookingsTable.status} <> 'batal'`,
      ),
    );
  return row?.total ?? 0;
}

router.post("/tebengan", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa membuat Tebengan Pulang." });
    return;
  }

  const parsed = CreateTebenganBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (data.origin_city === data.destination_city) {
    res.status(400).json({ error: "Kota asal dan tujuan tidak boleh sama." });
    return;
  }

  const waypoints = data.waypoints ?? [];
  if (waypoints.length > 0) {
    const sorted = [...waypoints].sort((a, b) => a.order_index - b.order_index);
    const lastWp = sorted[sorted.length - 1];
    if (!lastWp || lastWp.city !== data.destination_city) {
      res.status(400).json({ error: "Waypoint terakhir harus sama dengan kota tujuan." });
      return;
    }
    const cities = new Set([data.origin_city]);
    for (const wp of sorted.slice(0, -1)) {
      if (cities.has(wp.city) || wp.city === data.destination_city) {
        res.status(400).json({ error: `Kota singgah "${wp.city}" duplikat dengan asal/tujuan atau waypoint lain.` });
        return;
      }
      cities.add(wp.city);
    }
  }

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, data.kendaraan_id));
  if (!k || k.driver_id !== user.id) {
    res.status(400).json({ error: "Kendaraan tidak valid atau bukan milik Anda." });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(tebenganPulangTable)
      .values({
        driver_id: user.id,
        kendaraan_id: data.kendaraan_id,
        origin_city: data.origin_city,
        destination_city: data.destination_city,
        departure_date: data.departure_date,
        departure_time: data.departure_time,
        max_kursi: data.max_kursi,
        price_per_seat: data.price_per_seat,
        catatan: data.catatan ?? null,
        source_jadwal_id: data.source_jadwal_id ?? null,
        source_carter_id: data.source_carter_id ?? null,
        status: "aktif",
      })
      .returning();
    if (waypoints.length > 0) {
      await tx.insert(tebenganWaypointsTable).values(
        waypoints.map((wp) => ({ tebengan_id: t.id, city: wp.city, order_index: wp.order_index, price_from_prev: wp.price_from_prev }))
      );
    }
    return t;
  });

  req.log.info({ tebenganId: created.id, driverId: user.id }, "Tebengan pulang created");
  res.status(201).json(created);
});

router.get("/tebengan/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa melihat Tebengan." });
    return;
  }

  const rows = await db
    .select({
      t: tebenganPulangTable,
      kendaraan: kendaraanTable,
    })
    .from(tebenganPulangTable)
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, tebenganPulangTable.kendaraan_id))
    .where(eq(tebenganPulangTable.driver_id, user.id))
    .orderBy(sql`${tebenganPulangTable.created_at} DESC`);

  const ids = rows.map((r) => r.t.id);
  const seatMap = new Map<number, number>();
  const passengerMap = new Map<number, { id: number; nama: string; jumlah_kursi: number }[]>();
  if (ids.length > 0) {
    const seats = await db
      .select({
        tebengan_id: tebenganBookingsTable.tebengan_id,
        total: sql<number>`COALESCE(SUM(${tebenganBookingsTable.jumlah_kursi}), 0)::int`,
      })
      .from(tebenganBookingsTable)
      .where(
        and(
          inArray(tebenganBookingsTable.tebengan_id, ids),
          sql`${tebenganBookingsTable.status} <> 'batal'`,
        ),
      )
      .groupBy(tebenganBookingsTable.tebengan_id);
    for (const s of seats) seatMap.set(s.tebengan_id, s.total);

    const bookings = await db
      .select({
        tebengan_id: tebenganBookingsTable.tebengan_id,
        jumlah_kursi: tebenganBookingsTable.jumlah_kursi,
        penumpang_id: usersTable.id,
        penumpang_nama: usersTable.nama,
      })
      .from(tebenganBookingsTable)
      .leftJoin(usersTable, eq(usersTable.id, tebenganBookingsTable.penumpang_id))
      .where(
        and(
          inArray(tebenganBookingsTable.tebengan_id, ids),
          sql`${tebenganBookingsTable.status} <> 'batal'`,
        ),
      );
    for (const b of bookings) {
      if (!b.penumpang_id || !b.penumpang_nama) continue;
      const arr = passengerMap.get(b.tebengan_id) ?? [];
      arr.push({ id: b.penumpang_id, nama: b.penumpang_nama, jumlah_kursi: b.jumlah_kursi });
      passengerMap.set(b.tebengan_id, arr);
    }
  }

  res.json(
    rows.map(({ t, kendaraan }) => ({
      ...t,
      kursi_terisi: seatMap.get(t.id) ?? 0,
      kursi_tersisa: t.max_kursi - (seatMap.get(t.id) ?? 0),
      pendapatan: (seatMap.get(t.id) ?? 0) * t.price_per_seat,
      penumpang: passengerMap.get(t.id) ?? [],
      kendaraan: kendaraan
        ? {
            id: kendaraan.id,
            jenis: kendaraan.jenis,
            merek: kendaraan.merek,
            model: kendaraan.model,
            plat_nomor: kendaraan.plat_nomor,
          }
        : null,
    })),
  );
});

router.get("/tebengan/search", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { origin_city, destination_city, date } = parsed.data;

  const conditions = [eq(tebenganPulangTable.status, "aktif")];
  if (origin_city) conditions.push(eq(tebenganPulangTable.origin_city, origin_city));
  if (date) conditions.push(eq(tebenganPulangTable.departure_date, date));

  const rows = await db
    .select({
      t: tebenganPulangTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(tebenganPulangTable)
    .leftJoin(usersTable, eq(usersTable.id, tebenganPulangTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, tebenganPulangTable.kendaraan_id))
    .where(and(...conditions))
    .orderBy(tebenganPulangTable.departure_date, tebenganPulangTable.departure_time);

  const ids = rows.map((r) => r.t.id);

  const [seatMap, waypointsByTebengan] = await Promise.all([
    (async () => {
      const map = new Map<number, number>();
      if (ids.length > 0) {
        const seats = await db
          .select({
            tebengan_id: tebenganBookingsTable.tebengan_id,
            total: sql<number>`COALESCE(SUM(${tebenganBookingsTable.jumlah_kursi}), 0)::int`,
          })
          .from(tebenganBookingsTable)
          .where(and(inArray(tebenganBookingsTable.tebengan_id, ids), sql`${tebenganBookingsTable.status} <> 'batal'`))
          .groupBy(tebenganBookingsTable.tebengan_id);
        for (const s of seats) map.set(s.tebengan_id, s.total);
      }
      return map;
    })(),
    (async () => {
      const map = new Map<number, RouteStop[]>();
      if (ids.length > 0) {
        const wps = await db.select().from(tebenganWaypointsTable).where(inArray(tebenganWaypointsTable.tebengan_id, ids));
        for (const wp of wps) {
          const arr = map.get(wp.tebengan_id) ?? [];
          arr.push({ city: wp.city, order_index: wp.order_index, price_from_prev: wp.price_from_prev });
          map.set(wp.tebengan_id, arr);
        }
      }
      return map;
    })(),
  ]);

  const boardingCity = origin_city;
  const alightingCity = destination_city;

  res.json(
    rows
      .map(({ t, driver, kendaraan }) => {
        const waypoints = waypointsByTebengan.get(t.id) ?? [];
        if (alightingCity) {
          const fullRoute = buildFullRoute(t.origin_city, t.destination_city, waypoints);
          if (!fullRoute.some((stop) => stop.city === alightingCity)) return null;
        }
        const segmentPrice = calcSegmentPrice(
          boardingCity ?? t.origin_city,
          alightingCity ?? t.destination_city,
          t.origin_city, t.destination_city, waypoints, t.price_per_seat
        );
        return {
          ...t,
          kursi_terisi: seatMap.get(t.id) ?? 0,
          kursi_tersisa: t.max_kursi - (seatMap.get(t.id) ?? 0),
          waypoints: waypoints.sort((a, b) => a.order_index - b.order_index),
          segment_price: segmentPrice,
          driver: driver ? { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? null } : null,
          kendaraan: kendaraan
            ? { id: kendaraan.id, jenis: kendaraan.jenis, merek: kendaraan.merek, model: kendaraan.model, plat_nomor: kendaraan.plat_nomor, warna: kendaraan.warna, foto_url: kendaraan.foto_url }
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null && r.kursi_tersisa > 0),
  );
});

router.get("/tebengan/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const [row] = await db
    .select({
      t: tebenganPulangTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(tebenganPulangTable)
    .leftJoin(usersTable, eq(usersTable.id, tebenganPulangTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, tebenganPulangTable.kendaraan_id))
    .where(eq(tebenganPulangTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Tebengan tidak ditemukan." });
    return;
  }

  const isMitra = user.id === row.t.driver_id;
  const allBookings = await db
    .select({
      b: tebenganBookingsTable,
      penumpang: usersTable,
    })
    .from(tebenganBookingsTable)
    .leftJoin(usersTable, eq(usersTable.id, tebenganBookingsTable.penumpang_id))
    .where(eq(tebenganBookingsTable.tebengan_id, id));

  const visibleBookings = isMitra
    ? allBookings
    : allBookings.filter((b) => b.b.penumpang_id === user.id);

  const kursi_terisi = allBookings
    .filter((b) => b.b.status !== "batal")
    .reduce((sum, b) => sum + b.b.jumlah_kursi, 0);

  const rawWaypoints = await db
    .select()
    .from(tebenganWaypointsTable)
    .where(eq(tebenganWaypointsTable.tebengan_id, id));
  const tebenganWaypoints = rawWaypoints.sort((a, b) => a.order_index - b.order_index);

  res.json({
    ...row.t,
    kursi_terisi,
    kursi_tersisa: row.t.max_kursi - kursi_terisi,
    waypoints: tebenganWaypoints,
    driver: row.driver ? { id: row.driver.id, nama: row.driver.nama, no_whatsapp: isMitra ? null : row.driver.no_whatsapp, foto_profil: row.driver.foto_profil ?? null } : null,
    kendaraan: row.kendaraan
      ? {
          id: row.kendaraan.id,
          jenis: row.kendaraan.jenis,
          merek: row.kendaraan.merek,
          model: row.kendaraan.model,
          plat_nomor: row.kendaraan.plat_nomor,
          warna: row.kendaraan.warna,
          foto_url: row.kendaraan.foto_url,
        }
      : null,
    bookings: visibleBookings.map((b) => ({
      ...b.b,
      penumpang: b.penumpang
        ? {
            id: b.penumpang.id,
            nama: b.penumpang.nama,
            no_whatsapp: isMitra ? b.penumpang.no_whatsapp : null,
          }
        : null,
    })),
    is_mitra: isMitra,
  });
});

router.post("/tebengan/:id/book", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "penumpang") {
    res.status(403).json({ error: "Hanya penumpang yang bisa memesan Tebengan." });
    return;
  }

  const parsed = BookTebenganBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const bookWaypoints = await db
    .select()
    .from(tebenganWaypointsTable)
    .where(eq(tebenganWaypointsTable.tebengan_id, id));

  const result = await db.transaction(async (tx) => {
    const [t] = await tx
      .select()
      .from(tebenganPulangTable)
      .where(eq(tebenganPulangTable.id, id))
      .for("update");
    if (!t) return { error: "Tebengan tidak ditemukan.", status: 404 } as const;
    if (t.status !== "aktif") {
      return { error: "Tebengan ini sudah tidak menerima pesanan.", status: 400 } as const;
    }
    if (t.driver_id === user.id) {
      return { error: "Tidak bisa memesan Tebengan sendiri.", status: 400 } as const;
    }

    const boardingCity = parsed.data.boarding_city ?? t.origin_city;
    const alightingCity = parsed.data.alighting_city ?? t.destination_city;

    if (bookWaypoints.length > 0) {
      const fullRoute = buildFullRoute(t.origin_city, t.destination_city, bookWaypoints);
      const boardIdx = fullRoute.findIndex((r) => r.city === boardingCity);
      const alightIdx = fullRoute.findIndex((r) => r.city === alightingCity);
      if (boardIdx < 0) return { error: `Kota naik "${boardingCity}" tidak ada dalam rute.`, status: 400 } as const;
      if (alightIdx < 0) return { error: `Kota turun "${alightingCity}" tidak ada dalam rute.`, status: 400 } as const;
      if (alightIdx <= boardIdx) return { error: "Kota turun harus setelah kota naik.", status: 400 } as const;
    }

    const [existing] = await tx
      .select()
      .from(tebenganBookingsTable)
      .where(
        and(
          eq(tebenganBookingsTable.tebengan_id, id),
          eq(tebenganBookingsTable.penumpang_id, user.id),
          sql`${tebenganBookingsTable.status} <> 'batal'`,
        ),
      );
    if (existing) {
      return { error: "Anda sudah memesan Tebengan ini.", status: 400 } as const;
    }

    const [seatRow] = await tx
      .select({
        total: sql<number>`COALESCE(SUM(${tebenganBookingsTable.jumlah_kursi}), 0)::int`,
      })
      .from(tebenganBookingsTable)
      .where(
        and(
          eq(tebenganBookingsTable.tebengan_id, id),
          sql`${tebenganBookingsTable.status} <> 'batal'`,
        ),
      );
    const sisa = t.max_kursi - (seatRow?.total ?? 0);
    if (parsed.data.jumlah_kursi > sisa) {
      return { error: `Kursi tersisa hanya ${sisa}.`, status: 400 } as const;
    }

    const pricePerSeat = calcSegmentPrice(boardingCity, alightingCity, t.origin_city, t.destination_city, bookWaypoints, t.price_per_seat);
    const total_harga = parsed.data.jumlah_kursi * pricePerSeat;
    const [booking] = await tx
      .insert(tebenganBookingsTable)
      .values({
        tebengan_id: id,
        penumpang_id: user.id,
        jumlah_kursi: parsed.data.jumlah_kursi,
        pickup_address: parsed.data.pickup_address,
        dropoff_address: parsed.data.dropoff_address ?? null,
        catatan: parsed.data.catatan ?? null,
        boarding_city: boardingCity !== t.origin_city ? boardingCity : null,
        alighting_city: alightingCity !== t.destination_city ? alightingCity : null,
        total_harga,
        status: "dipesan",
      })
      .returning();
    return { booking, driver_id: t.driver_id } as const;
  });

  if ("error" in result) {
    res.status(result.status as number).json({ error: result.error });
    return;
  }
  req.log.info({ bookingId: result.booking.id, tebenganId: id, userId: user.id }, "Tebengan booked");
  sendPushToUser(result.driver_id, {
    title: "Penumpang Tebengan Baru",
    body: `${user.nama} memesan ${result.booking.jumlah_kursi} kursi tebengan pulang Anda.`,
    tag: `tebengan-new-${result.booking.id}`,
    url: "/pesanan",
  }).catch(() => {});
  res.status(201).json(result.booking);
});

router.delete("/tebengan/:id/book", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const [t] = await db.select().from(tebenganPulangTable).where(eq(tebenganPulangTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Tebengan tidak ditemukan." });
    return;
  }
  if (t.status !== "aktif") {
    res.status(400).json({
      error: "Pesanan tidak bisa dibatalkan karena Tebengan sudah berangkat atau selesai. Hubungi mitra langsung.",
    });
    return;
  }

  const [b] = await db
    .select()
    .from(tebenganBookingsTable)
    .where(
      and(
        eq(tebenganBookingsTable.tebengan_id, id),
        eq(tebenganBookingsTable.penumpang_id, user.id),
        sql`${tebenganBookingsTable.status} <> 'batal'`,
      ),
    );

  if (!b) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }

  await db
    .update(tebenganBookingsTable)
    .set({ status: "batal" })
    .where(eq(tebenganBookingsTable.id, b.id));

  res.json({ ok: true });
});

router.patch("/tebengan/:id/status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  const parsed = StatusUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [t] = await db.select().from(tebenganPulangTable).where(eq(tebenganPulangTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Tebengan tidak ditemukan." });
    return;
  }
  if (t.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan Tebengan milik Anda." });
    return;
  }

  if (parsed.data.status === "batal") {
    const kursi = await calcKursiTerisi(id);
    if (kursi > 0) {
      res.status(400).json({ error: "Tidak bisa membatalkan: sudah ada penumpang yang pesan." });
      return;
    }
  }

  const allowed: Record<string, string[]> = {
    aktif: ["berangkat", "batal"],
    berangkat: ["selesai"],
    selesai: [],
    batal: [],
  };
  if (!allowed[t.status]?.includes(parsed.data.status)) {
    res.status(400).json({ error: `Tidak bisa pindah dari status "${t.status}" ke "${parsed.data.status}".` });
    return;
  }

  const [updated] = await db
    .update(tebenganPulangTable)
    .set({ status: parsed.data.status, updated_at: new Date() })
    .where(eq(tebenganPulangTable.id, id))
    .returning();

  req.log.info({ tebenganId: id, status: parsed.data.status, driverId: user.id }, "Tebengan status updated");
  res.json(updated);
});

router.patch("/tebengan/:id/trip-progress", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const { trip_progress } = req.body as { trip_progress?: string };
  const allowed = ["menunggu", "menuju_jemput"];
  if (!trip_progress || !allowed.includes(trip_progress)) {
    res.status(400).json({ error: "trip_progress tidak valid." });
    return;
  }
  const [t] = await db.select({ driver_id: tebenganPulangTable.driver_id, status: tebenganPulangTable.status }).from(tebenganPulangTable).where(eq(tebenganPulangTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Tebengan tidak ditemukan." });
    return;
  }
  if (t.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan Tebengan milik Anda." });
    return;
  }
  await db.update(tebenganPulangTable).set({ trip_progress, updated_at: new Date() }).where(eq(tebenganPulangTable.id, id));
  res.json({ ok: true, trip_progress });
});

router.patch("/tebengan/:id/driver-location", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat dan lng harus berupa angka." });
    return;
  }
  const [t] = await db.select({ driver_id: tebenganPulangTable.driver_id, status: tebenganPulangTable.status }).from(tebenganPulangTable).where(eq(tebenganPulangTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Tebengan tidak ditemukan." });
    return;
  }
  if (t.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan Tebengan milik Anda." });
    return;
  }
  await db
    .update(tebenganPulangTable)
    .set({ driver_lat: lat, driver_lng: lng, driver_location_updated_at: new Date() })
    .where(eq(tebenganPulangTable.id, id));
  res.json({ ok: true });
});

export default router;

