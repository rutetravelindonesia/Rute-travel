import { Router, type IRouter } from "express";
import { eq, and, ne, sql, inArray, notInArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sessionsTable,
  usersTable,
  schedulesTable,
  kendaraanTable,
  scheduleBookingsTable,
  scheduleWaypointsTable,
  ratingsTable,
} from "@workspace/db";
import { CreateScheduleBody } from "@workspace/api-zod";
import { sendPushToUser } from "../lib/push";

const router: IRouter = Router();

// Returns "yyyy-mm-dd" in WITA (Asia/Makassar = UTC+8) — Kaltim local date.
function todayWITA(): string {
  const witaMs = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(witaMs).toISOString().slice(0, 10);
}

// Returns true if current time is past the 24-hour cancellation cutoff
// (i.e. within 24 hours of the scheduled departure time in WITA).
function pastCancellationCutoff(departureDate: string, departureTime: string): boolean {
  const depMs = new Date(`${departureDate}T${departureTime}:00+08:00`).getTime();
  const cutoffMs = depMs - 24 * 60 * 60 * 1000;
  return Date.now() >= cutoffMs;
}

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

const SearchQuery = z.object({
  origin_city: z.string().optional(),
  destination_city: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const AddressBody = z.object({
  label: z.string().min(2).max(200),
  detail: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

const WaypointBody = z.object({
  city: z.string().min(1).max(100),
  order_index: z.number().int().positive(),
  price_from_prev: z.number().int().min(0),
});

const CreateScheduleWithWaypointsBody = z.object({
  kendaraan_id: z.number().int().positive(),
  origin_city: z.string().min(1),
  destination_city: z.string().min(1),
  departure_date: z.string().min(1),
  departure_time: z.string().min(1),
  capacity: z.number().int().min(1).max(20),
  price_per_seat: z.number().int().min(0),
  waypoints: z.array(WaypointBody).optional().default([]),
});

const BookScheduleBody = z.object({
  kursi: z.array(z.string().min(1).max(8)).min(1).max(20),
  pickup: AddressBody,
  dropoff: AddressBody,
  payment_method: z.enum(["qris", "transfer", "ewallet"]),
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
  // Rute penuh: langsung pakai price_per_seat yang disimpan
  if (boardingCity === origin && alightingCity === destination) return fullPricePerSeat;
  if (waypoints.length === 0) return fullPricePerSeat;

  // Bangun daftar kota dan harga antar kota (price_from_prev = inkremental)
  const sorted = [...waypoints]
    .filter((w) => w.city !== destination) // hanya kota singgah, bukan tujuan akhir
    .sort((a, b) => a.order_index - b.order_index);

  // allStops: [origin, ...intermediate_cities, destination]
  const allStops = [origin, ...sorted.map((w) => w.city), destination];
  // allPrices[i] = harga dari allStops[i-1] ke allStops[i]
  // Kita rekonstruksi dari data DB yang menyimpan price_from_prev inkremental
  const allWaypoints = [...waypoints].sort((a, b) => a.order_index - b.order_index);
  const allPrices = [0, ...allWaypoints.map((w) => w.price_from_prev)];
  // Pastikan allPrices punya cukup entri untuk allStops
  while (allPrices.length < allStops.length) allPrices.push(0);

  const boardIdx = allStops.indexOf(boardingCity);
  const alightIdx = allStops.indexOf(alightingCity);
  if (boardIdx < 0 || alightIdx < 0 || alightIdx <= boardIdx) return fullPricePerSeat;
  let total = 0;
  for (let i = boardIdx + 1; i <= alightIdx; i++) {
    total += allPrices[i] ?? 0;
  }
  return total;
}

const PaymentProofBody = z.object({
  url: z.string().min(3).max(1000),
});

const OfflineSeatsBody = z.object({
  kursi_offline: z.array(z.string().min(1).max(8)).max(20),
});

router.post("/schedules", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa membuat jadwal." });
    return;
  }

  const parsed = CreateScheduleWithWaypointsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { kendaraan_id, origin_city, destination_city, departure_date, departure_time, capacity, price_per_seat, waypoints } = parsed.data;

  if (origin_city === destination_city) {
    res.status(400).json({ error: "Kota asal dan tujuan tidak boleh sama." });
    return;
  }

  if (waypoints.length > 0) {
    const sorted = [...waypoints].sort((a, b) => a.order_index - b.order_index);
    const lastWp = sorted[sorted.length - 1];
    if (!lastWp || lastWp.city !== destination_city) {
      res.status(400).json({ error: "Waypoint terakhir harus sama dengan kota tujuan." });
      return;
    }
    const cities = new Set([origin_city]);
    for (const wp of sorted.slice(0, -1)) {
      if (cities.has(wp.city) || wp.city === destination_city) {
        res.status(400).json({ error: `Kota singgah "${wp.city}" duplikat dengan asal/tujuan atau waypoint lain.` });
        return;
      }
      cities.add(wp.city);
    }
  }

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, kendaraan_id));
  if (!k || k.driver_id !== user.id) {
    res.status(400).json({ error: "Kendaraan tidak valid atau bukan milik Anda." });
    return;
  }

  const schedule = await db.transaction(async (tx) => {
    const [s] = await tx.insert(schedulesTable).values({
      driver_id: user.id,
      kendaraan_id,
      origin_city,
      destination_city,
      departure_date,
      departure_time,
      capacity,
      price_per_seat,
      status: "active",
    }).returning();
    if (waypoints.length > 0) {
      await tx.insert(scheduleWaypointsTable).values(
        waypoints.map((wp) => ({ schedule_id: s.id, city: wp.city, order_index: wp.order_index, price_from_prev: wp.price_from_prev }))
      );
    }
    return s;
  });

  req.log.info({ scheduleId: schedule.id, driverId: user.id }, "Schedule created");
  res.status(201).json(schedule);
});

router.get("/schedules/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa melihat jadwal." });
    return;
  }

  const rows = await db
    .select({
      s: schedulesTable,
      kendaraan: kendaraanTable,
    })
    .from(schedulesTable)
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(eq(schedulesTable.driver_id, user.id))
    .orderBy(schedulesTable.departure_date, schedulesTable.departure_time);

  const ids = rows.map((r) => r.s.id);
  const bookingsByScheduleId = new Map<
    number,
    { id: number; nama: string; jumlah_kursi: number; status: string; kursi: string[] }[]
  >();
  if (ids.length > 0) {
    const bookings = await db
      .select({
        id: scheduleBookingsTable.id,
        schedule_id: scheduleBookingsTable.schedule_id,
        kursi: scheduleBookingsTable.kursi,
        status: scheduleBookingsTable.status,
        nama: usersTable.nama,
      })
      .from(scheduleBookingsTable)
      .leftJoin(usersTable, eq(usersTable.id, scheduleBookingsTable.penumpang_id))
      .where(inArray(scheduleBookingsTable.schedule_id, ids));
    for (const b of bookings) {
      const arr = bookingsByScheduleId.get(b.schedule_id) ?? [];
      arr.push({
        id: b.id,
        nama: b.nama ?? "Penumpang",
        jumlah_kursi: b.kursi.length,
        status: b.status,
        kursi: b.kursi,
      });
      bookingsByScheduleId.set(b.schedule_id, arr);
    }
  }

  res.json(
    rows.map(({ s, kendaraan }) => {
      const allBookings = bookingsByScheduleId.get(s.id) ?? [];
      const activeBookings = allBookings.filter((b) => b.status !== "batal");
      const bookedCount = activeBookings.reduce((sum, b) => sum + b.jumlah_kursi, 0);
      const offlineCount = (s.kursi_offline ?? []).length;
      const kursi_terisi = bookedCount + offlineCount;
      const paidBookings = activeBookings.filter((b) => b.status === "paid");
      const pendapatan = paidBookings.reduce(
        (sum, b) => sum + b.jumlah_kursi * s.price_per_seat,
        0,
      );
      return {
        ...s,
        kursi_terisi,
        kursi_tersisa: s.capacity - kursi_terisi,
        kursi_booked: activeBookings.flatMap((b) => b.kursi),
        pendapatan,
        penumpang: activeBookings.map((b) => ({
          id: b.id,
          nama: b.nama,
          jumlah_kursi: b.jumlah_kursi,
        })),
        kendaraan: kendaraan
          ? {
              id: kendaraan.id,
              merek: kendaraan.merek,
              model: kendaraan.model,
              plat_nomor: kendaraan.plat_nomor,
            }
          : null,
      };
    }),
  );
});

router.get("/schedules/search", async (req, res): Promise<void> => {
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

  const conditions = [
    eq(schedulesTable.status, "active"),
    sql`(${schedulesTable.departure_date} || ' ' || ${schedulesTable.departure_time})::timestamp > (NOW() AT TIME ZONE 'Asia/Makassar')`,
    notInArray(schedulesTable.trip_progress, ["dalam_perjalanan", "selesai"]),
  ];
  if (origin_city) conditions.push(eq(schedulesTable.origin_city, origin_city));
  if (date) conditions.push(eq(schedulesTable.departure_date, date));

  const rows = await db
    .select({
      s: schedulesTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(schedulesTable)
    .leftJoin(usersTable, eq(usersTable.id, schedulesTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(and(...conditions))
    .orderBy(schedulesTable.departure_date, schedulesTable.departure_time);

  const ids = rows.map((r) => r.s.id);

  const [seatsTakenMap, waypointsBySchedule] = await Promise.all([
    (async () => {
      const map = new Map<number, { kursi: string[]; bookings: { boarding_city: string | null; alighting_city: string | null; kursi: string[] }[] }>();
      if (ids.length > 0) {
        const bookings = await db
          .select({
            schedule_id: scheduleBookingsTable.schedule_id,
            kursi: scheduleBookingsTable.kursi,
            boarding_city: scheduleBookingsTable.boarding_city,
            alighting_city: scheduleBookingsTable.alighting_city,
          })
          .from(scheduleBookingsTable)
          .where(and(inArray(scheduleBookingsTable.schedule_id, ids), sql`${scheduleBookingsTable.status} <> 'batal'`));
        for (const b of bookings) {
          const entry = map.get(b.schedule_id) ?? { kursi: [], bookings: [] };
          entry.kursi.push(...b.kursi);
          entry.bookings.push({ boarding_city: b.boarding_city, alighting_city: b.alighting_city, kursi: b.kursi });
          map.set(b.schedule_id, entry);
        }
      }
      return map;
    })(),
    (async () => {
      const map = new Map<number, RouteStop[]>();
      if (ids.length > 0) {
        const wps = await db.select().from(scheduleWaypointsTable).where(inArray(scheduleWaypointsTable.schedule_id, ids));
        for (const wp of wps) {
          const arr = map.get(wp.schedule_id) ?? [];
          arr.push({ city: wp.city, order_index: wp.order_index, price_from_prev: wp.price_from_prev });
          map.set(wp.schedule_id, arr);
        }
      }
      return map;
    })(),
  ]);

  const results = rows
    .map(({ s, driver, kendaraan }) => {
      const waypoints = waypointsBySchedule.get(s.id) ?? [];
      const entry = seatsTakenMap.get(s.id) ?? { kursi: [], bookings: [] };
      const offline = s.kursi_offline ?? [];
      const seats_taken = Array.from(new Set([...entry.kursi, ...offline]));

      if (destination_city) {
        const fullRoute = buildFullRoute(s.origin_city, s.destination_city, waypoints);
        const destInRoute = fullRoute.some((stop) => stop.city === destination_city);
        if (!destInRoute) return null;
      }

      const boardingCity = origin_city ?? s.origin_city;
      const alightingCity = destination_city ?? s.destination_city;
      const segmentPrice = calcSegmentPrice(boardingCity, alightingCity, s.origin_city, s.destination_city, waypoints, s.price_per_seat);

      const fullRoute = buildFullRoute(s.origin_city, s.destination_city, waypoints);
      const boardIdx = fullRoute.findIndex((stop) => stop.city === boardingCity);
      const alightIdx = fullRoute.findIndex((stop) => stop.city === alightingCity);

      let kursi_tersisa = s.capacity - seats_taken.length;
      if (waypoints.length > 0 && boardIdx >= 0 && alightIdx > boardIdx) {
        let maxOverlap = 0;
        for (let segI = boardIdx; segI < alightIdx; segI++) {
          const segStart = fullRoute[segI]?.city;
          const segEnd = fullRoute[segI + 1]?.city;
          if (!segStart || !segEnd) continue;
          const segOverlap = entry.bookings.reduce((sum, b) => {
            const bBoardCity = b.boarding_city ?? s.origin_city;
            const bAlightCity = b.alighting_city ?? s.destination_city;
            const bBoardIdx = fullRoute.findIndex((r) => r.city === bBoardCity);
            const bAlightIdx = fullRoute.findIndex((r) => r.city === bAlightCity);
            const overlaps = bBoardIdx < alightIdx && bAlightIdx > boardIdx;
            return overlaps ? sum + b.kursi.length : sum;
          }, 0);
          const offlineCount = offline.length;
          maxOverlap = Math.max(maxOverlap, segOverlap + offlineCount);
        }
        kursi_tersisa = s.capacity - maxOverlap;
      }

      return {
        ...s,
        seats_taken,
        kursi_terisi: seats_taken.length,
        kursi_tersisa,
        waypoints: waypoints.sort((a, b) => a.order_index - b.order_index),
        segment_price: segmentPrice,
        driver: driver ? { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? null } : null,
        kendaraan: kendaraan
          ? { id: kendaraan.id, jenis: kendaraan.jenis, merek: kendaraan.merek, model: kendaraan.model, plat_nomor: kendaraan.plat_nomor, warna: kendaraan.warna, foto_url: kendaraan.foto_url }
          : null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && r.kursi_tersisa > 0);

  res.json(results);
});

router.get("/schedules/:id", async (req, res): Promise<void> => {
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
      s: schedulesTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(schedulesTable)
    .leftJoin(usersTable, eq(usersTable.id, schedulesTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(eq(schedulesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Jadwal tidak ditemukan." });
    return;
  }

  const allBookings = await db
    .select({
      kursi: scheduleBookingsTable.kursi,
      status: scheduleBookingsTable.status,
    })
    .from(scheduleBookingsTable)
    .where(eq(scheduleBookingsTable.schedule_id, id));

  const bookedSeats: string[] = [];
  for (const b of allBookings) {
    if (b.status === "batal") continue;
    bookedSeats.push(...b.kursi);
  }
  const offlineSeats = row.s.kursi_offline ?? [];
  const seats_taken = Array.from(new Set([...bookedSeats, ...offlineSeats]));

  const rawWaypoints = await db
    .select()
    .from(scheduleWaypointsTable)
    .where(eq(scheduleWaypointsTable.schedule_id, id));
  const waypoints = rawWaypoints.sort((a, b) => a.order_index - b.order_index);

  res.json({
    ...row.s,
    seats_taken,
    kursi_terisi: seats_taken.length,
    kursi_tersisa: row.s.capacity - seats_taken.length,
    waypoints,
    driver: row.driver ? { id: row.driver.id, nama: row.driver.nama, foto_profil: row.driver.foto_profil ?? null } : null,
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
  });
});

router.get("/schedules/:id/trip-detail", async (req, res): Promise<void> => {
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
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa mengakses." });
    return;
  }

  const [schedRow] = await db
    .select({ s: schedulesTable, kendaraan: kendaraanTable })
    .from(schedulesTable)
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(and(eq(schedulesTable.id, id), eq(schedulesTable.driver_id, user.id)));

  if (!schedRow) {
    res.status(404).json({ error: "Jadwal tidak ditemukan atau bukan milik Anda." });
    return;
  }

  const bookingRows = await db
    .select({ b: scheduleBookingsTable, p: usersTable })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(usersTable.id, scheduleBookingsTable.penumpang_id))
    .where(and(eq(scheduleBookingsTable.schedule_id, id), ne(scheduleBookingsTable.status, "batal")))
    .orderBy(scheduleBookingsTable.created_at);

  const passengers = bookingRows.map(({ b, p }) => ({
    booking_id: b.id,
    kursi: b.kursi,
    status: b.status,
    total_amount: b.total_amount,
    pickup_lat: b.pickup_lat ?? null,
    pickup_lng: b.pickup_lng ?? null,
    pickup_label: b.pickup_label ?? null,
    catatan: b.catatan ?? null,
    penumpang: p
      ? { id: p.id, nama: p.nama, no_whatsapp: p.no_whatsapp ?? null, foto_profil: p.foto_profil ?? null }
      : null,
  }));

  const total_pendapatan = passengers.reduce((sum, p) => sum + (p.total_amount ?? 0), 0);

  res.json({
    ...schedRow.s,
    kendaraan: schedRow.kendaraan
      ? {
          id: schedRow.kendaraan.id,
          jenis: schedRow.kendaraan.jenis,
          merek: schedRow.kendaraan.merek,
          model: schedRow.kendaraan.model,
          warna: schedRow.kendaraan.warna,
          plat_nomor: schedRow.kendaraan.plat_nomor,
          foto_url: schedRow.kendaraan.foto_url,
        }
      : null,
    passengers,
    total_pendapatan,
  });
});

router.post("/schedules/:id/book", async (req, res): Promise<void> => {
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
    res.status(403).json({ error: "Hanya penumpang yang bisa memesan jadwal." });
    return;
  }

  const parsed = BookScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const scheduleWaypoints = await db
    .select()
    .from(scheduleWaypointsTable)
    .where(eq(scheduleWaypointsTable.schedule_id, id));

  const result = await db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.id, id))
      .for("update");
    if (!s) return { error: "Jadwal tidak ditemukan.", status: 404 } as const;
    if (s.status !== "active") {
      return { error: "Jadwal ini sudah tidak menerima pesanan.", status: 400 } as const;
    }
    if (s.driver_id === user.id) {
      return { error: "Tidak bisa memesan jadwal sendiri.", status: 400 } as const;
    }

    const requested = parsed.data.kursi.map((k) => k.trim());
    const dedup = Array.from(new Set(requested));
    if (dedup.length !== requested.length) {
      return { error: "Ada nomor kursi yang dobel.", status: 400 } as const;
    }
    const invalid = dedup.filter((k) => !/^\d+$/.test(k) || parseInt(k, 10) < 1 || parseInt(k, 10) > s.capacity);
    if (invalid.length > 0) {
      return {
        error: `Nomor kursi tidak valid: ${invalid.join(", ")} (kapasitas 1–${s.capacity}).`,
        status: 400,
      } as const;
    }

    const boardingCity = parsed.data.boarding_city ?? s.origin_city;
    const alightingCity = parsed.data.alighting_city ?? s.destination_city;

    if (scheduleWaypoints.length > 0) {
      const fullRoute = buildFullRoute(s.origin_city, s.destination_city, scheduleWaypoints);
      const boardIdx = fullRoute.findIndex((r) => r.city === boardingCity);
      const alightIdx = fullRoute.findIndex((r) => r.city === alightingCity);
      if (boardIdx < 0) return { error: `Kota boarding "${boardingCity}" tidak ada dalam rute.`, status: 400 } as const;
      if (alightIdx < 0) return { error: `Kota turun "${alightingCity}" tidak ada dalam rute.`, status: 400 } as const;
      if (alightIdx <= boardIdx) return { error: "Kota turun harus setelah kota naik dalam rute.", status: 400 } as const;
    }

    const taken = await tx
      .select({
        kursi: scheduleBookingsTable.kursi,
        boarding_city: scheduleBookingsTable.boarding_city,
        alighting_city: scheduleBookingsTable.alighting_city,
      })
      .from(scheduleBookingsTable)
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          sql`${scheduleBookingsTable.status} <> 'batal'`,
        ),
      );

    if (scheduleWaypoints.length > 0) {
      const fullRoute = buildFullRoute(s.origin_city, s.destination_city, scheduleWaypoints);
      const boardIdx = fullRoute.findIndex((r) => r.city === boardingCity);
      const alightIdx = fullRoute.findIndex((r) => r.city === alightingCity);
      let maxOnSegment = 0;
      for (let segI = boardIdx; segI < alightIdx; segI++) {
        const overlapCount = taken.reduce((sum, b) => {
          const bBoardCity = b.boarding_city ?? s.origin_city;
          const bAlightCity = b.alighting_city ?? s.destination_city;
          const bBoardIdx = fullRoute.findIndex((r) => r.city === bBoardCity);
          const bAlightIdx = fullRoute.findIndex((r) => r.city === bAlightCity);
          const overlaps = bBoardIdx < alightIdx && bAlightIdx > boardIdx;
          return overlaps ? sum + b.kursi.length : sum;
        }, 0);
        maxOnSegment = Math.max(maxOnSegment, overlapCount);
      }
      const offlineCount = (s.kursi_offline ?? []).length;
      if (maxOnSegment + offlineCount + dedup.length > s.capacity) {
        return { error: "Kursi tidak cukup untuk segmen rute yang dipilih.", status: 409 } as const;
      }
    } else {
      const occupied = new Set<string>();
      for (const t of taken) for (const k of t.kursi) occupied.add(k);
      for (const k of s.kursi_offline ?? []) occupied.add(k);
      const conflict = dedup.filter((k) => occupied.has(k));
      if (conflict.length > 0) {
        return {
          error: `Kursi ${conflict.join(", ")} sudah dibooking penumpang lain. Silakan pilih kursi lain.`,
          status: 409,
        } as const;
      }
      if (occupied.size + dedup.length > s.capacity) {
        return { error: "Jumlah kursi melebihi kapasitas.", status: 400 } as const;
      }
    }

    const pricePerSeat = calcSegmentPrice(boardingCity, alightingCity, s.origin_city, s.destination_city, scheduleWaypoints, s.price_per_seat);
    const total_amount = dedup.length * pricePerSeat;

    const [booking] = await tx
      .insert(scheduleBookingsTable)
      .values({
        schedule_id: id,
        penumpang_id: user.id,
        kursi: dedup,
        pickup_label: parsed.data.pickup.label,
        pickup_detail: parsed.data.pickup.detail ?? null,
        pickup_lat: parsed.data.pickup.lat ?? null,
        pickup_lng: parsed.data.pickup.lng ?? null,
        dropoff_label: parsed.data.dropoff.label,
        dropoff_detail: parsed.data.dropoff.detail ?? null,
        dropoff_lat: parsed.data.dropoff.lat ?? null,
        dropoff_lng: parsed.data.dropoff.lng ?? null,
        boarding_city: boardingCity !== s.origin_city ? boardingCity : null,
        alighting_city: alightingCity !== s.destination_city ? alightingCity : null,
        total_amount,
        payment_method: parsed.data.payment_method,
        status: "pending",
      })
      .returning();
    return { booking, driver_id: s.driver_id } as const;
  });

  if ("error" in result) {
    res.status(result.status as number).json({ error: result.error });
    return;
  }
  req.log.info({ bookingId: result.booking.id, scheduleId: id, userId: user.id }, "Schedule booked");
  sendPushToUser(result.driver_id, {
    title: "Pesanan Baru Masuk",
    body: `${user.nama} memesan ${result.booking.kursi.length} kursi untuk jadwal Anda.`,
    tag: `booking-new-${result.booking.id}`,
    url: "/pesanan",
  }).catch(() => {});
  res.status(201).json(result.booking);
});

router.get("/bookings/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "penumpang") {
    res.status(403).json({ error: "Hanya penumpang yang bisa melihat pesanan." });
    return;
  }

  const rows = await db
    .select({
      b: scheduleBookingsTable,
      s: schedulesTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(scheduleBookingsTable)
    .leftJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
    .leftJoin(usersTable, eq(usersTable.id, schedulesTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(eq(scheduleBookingsTable.penumpang_id, user.id))
    .orderBy(sql`${scheduleBookingsTable.created_at} DESC`);

  // Fetch ratings already given by this user for these bookings
  const bookingIds = rows.map((r) => r.b.id);
  const myRatings = bookingIds.length
    ? await db
        .select({ booking_id: ratingsTable.booking_id })
        .from(ratingsTable)
        .where(
          and(
            eq(ratingsTable.rater_id, user.id),
            inArray(ratingsTable.booking_id, bookingIds),
          ),
        )
    : [];
  const ratedSet = new Set(myRatings.map((r) => r.booking_id));

  res.json(
    rows.map(({ b, s, driver, kendaraan }) => {
      const canCancel =
        ["pending", "paid", "aktif"].includes(b.status) &&
        !!s?.departure_date &&
        !!s?.departure_time &&
        !pastCancellationCutoff(s.departure_date, s.departure_time);
      return {
        ...b,
        schedule: s
          ? {
              id: s.id,
              origin_city: s.origin_city,
              destination_city: s.destination_city,
              departure_date: s.departure_date,
              departure_time: s.departure_time,
              price_per_seat: s.price_per_seat,
              trip_progress: s.trip_progress,
            }
          : null,
        driver: driver
          ? { id: driver.id, nama: driver.nama, no_whatsapp: driver.no_whatsapp, foto_profil: driver.foto_profil ?? null }
          : null,
        kendaraan: kendaraan
          ? {
              id: kendaraan.id,
              jenis: kendaraan.jenis,
              merek: kendaraan.merek,
              model: kendaraan.model,
              plat_nomor: kendaraan.plat_nomor,
            }
          : null,
        can_cancel: canCancel,
        already_rated: ratedSet.has(b.id),
      };
    }),
  );
});

router.get("/bookings/incoming", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa melihat pesanan masuk." });
    return;
  }

  const rows = await db
    .select({
      b: scheduleBookingsTable,
      s: schedulesTable,
      penumpang: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(scheduleBookingsTable)
    .innerJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
    .leftJoin(usersTable, eq(usersTable.id, scheduleBookingsTable.penumpang_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(eq(schedulesTable.driver_id, user.id))
    .orderBy(sql`${scheduleBookingsTable.created_at} DESC`);

  res.json(
    rows.map(({ b, s, penumpang, kendaraan }) => ({
      ...b,
      schedule: s
        ? {
            id: s.id,
            origin_city: s.origin_city,
            destination_city: s.destination_city,
            departure_date: s.departure_date,
            departure_time: s.departure_time,
            price_per_seat: s.price_per_seat,
            trip_progress: s.trip_progress,
          }
        : null,
      penumpang: penumpang
        ? { id: penumpang.id, nama: penumpang.nama, no_whatsapp: penumpang.no_whatsapp }
        : null,
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

router.put("/schedules/:id/offline-seats", async (req, res): Promise<void> => {
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
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa menandai kursi." });
    return;
  }

  const parsed = OfflineSeatsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [s] = await tx
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.id, id))
      .for("update");
    if (!s) return { error: "Jadwal tidak ditemukan.", status: 404 } as const;
    if (s.driver_id !== user.id) {
      return { error: "Bukan jadwal Anda.", status: 403 } as const;
    }
    if (s.trip_progress === "selesai") {
      return { error: "Trip sudah selesai, kursi tidak bisa diubah.", status: 400 } as const;
    }

    const requested = parsed.data.kursi_offline.map((k) => k.trim());
    const dedup = Array.from(new Set(requested));
    const invalid = dedup.filter(
      (k) => !/^\d+$/.test(k) || parseInt(k, 10) < 1 || parseInt(k, 10) > s.capacity,
    );
    if (invalid.length > 0) {
      return {
        error: `Nomor kursi tidak valid: ${invalid.join(", ")} (kapasitas 1–${s.capacity}).`,
        status: 400,
      } as const;
    }

    const taken = await tx
      .select({ kursi: scheduleBookingsTable.kursi })
      .from(scheduleBookingsTable)
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          sql`${scheduleBookingsTable.status} <> 'batal'`,
        ),
      );
    const bookedSet = new Set<string>();
    for (const t of taken) for (const k of t.kursi) bookedSet.add(k);
    const conflict = dedup.filter((k) => bookedSet.has(k));
    if (conflict.length > 0) {
      return {
        error: `Kursi ${conflict.join(", ")} sudah dipesan penumpang online dan tidak bisa ditandai offline.`,
        status: 409,
      } as const;
    }
    if (bookedSet.size + dedup.length > s.capacity) {
      return { error: "Total kursi melebihi kapasitas kendaraan.", status: 400 } as const;
    }

    await tx
      .update(schedulesTable)
      .set({ kursi_offline: dedup })
      .where(eq(schedulesTable.id, id));

    return { ok: true, kursi_offline: dedup } as const;
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ id, kursi_offline: result.kursi_offline });
});

router.delete("/schedules/:id", async (req, res): Promise<void> => {
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
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa membatalkan jadwal." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [sched] = await tx
      .select()
      .from(schedulesTable)
      .where(eq(schedulesTable.id, id))
      .for("update");
    if (!sched) return { error: "Jadwal tidak ditemukan.", status: 404 } as const;
    if (sched.driver_id !== user.id) return { error: "Bukan jadwal Anda.", status: 403 } as const;
    if (sched.trip_progress !== "belum_jemput") {
      return { error: "Jadwal yang sudah berjalan tidak bisa dibatalkan.", status: 400 } as const;
    }

    // Cek apakah ada pesanan aktif
    const activeBookings = await tx
      .select({ id: scheduleBookingsTable.id })
      .from(scheduleBookingsTable)
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          ne(scheduleBookingsTable.status, "batal"),
        ),
      );
    if (activeBookings.length > 0) {
      return {
        error: "Jadwal tidak bisa dibatalkan karena sudah ada penumpang yang memesan.",
        status: 400,
      } as const;
    }

    // Hapus waypoints lalu jadwal
    await tx.delete(scheduleWaypointsTable).where(eq(scheduleWaypointsTable.schedule_id, id));
    await tx.delete(schedulesTable).where(eq(schedulesTable.id, id));
    return { ok: true } as const;
  });

  if ("error" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ success: true });
});

router.patch("/schedules/:id/trip-progress", async (req, res): Promise<void> => {
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
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa mengubah progres trip." });
    return;
  }

  const [sched] = await db.select().from(schedulesTable).where(eq(schedulesTable.id, id));
  if (!sched) {
    res.status(404).json({ error: "Jadwal tidak ditemukan." });
    return;
  }
  if (sched.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan jadwal Anda." });
    return;
  }

  const next: Record<string, string> = {
    belum_jemput: "sudah_jemput",
    sudah_jemput: "semua_naik",
    semua_naik: "dalam_perjalanan",
    dalam_perjalanan: "selesai",
  };
  const nextProgress = next[sched.trip_progress];
  if (!nextProgress) {
    res.status(400).json({ error: "Trip sudah selesai." });
    return;
  }

  await db
    .update(schedulesTable)
    .set({ trip_progress: nextProgress })
    .where(eq(schedulesTable.id, id));

  if (nextProgress === "sudah_jemput") {
    await db
      .update(scheduleBookingsTable)
      .set({ status: "aktif", updated_at: new Date() })
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          inArray(scheduleBookingsTable.status, ["paid", "pending"]),
        ),
      );
  } else if (nextProgress === "selesai") {
    await db
      .update(scheduleBookingsTable)
      .set({ status: "selesai", updated_at: new Date() })
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          inArray(scheduleBookingsTable.status, ["paid", "aktif"]),
        ),
      );
  }

  const progressMessages: Record<string, { title: string; body: string }> = {
    sudah_jemput: { title: "Sopir Sedang Menjemput", body: "Sopir Anda sedang dalam perjalanan menjemput. Bersiap-siaplah!" },
    dalam_perjalanan: { title: "Perjalanan Dimulai", body: "Perjalanan Anda telah dimulai. Selamat menikmati perjalanan!" },
    selesai: { title: "Perjalanan Selesai", body: "Perjalanan Anda telah selesai. Terima kasih telah menggunakan RUTE!" },
  };
  const msg = progressMessages[nextProgress];
  if (msg) {
    const passengers = await db
      .select({ penumpang_id: scheduleBookingsTable.penumpang_id })
      .from(scheduleBookingsTable)
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, id),
          sql`${scheduleBookingsTable.status} <> 'batal'`,
        ),
      );
    for (const p of passengers) {
      sendPushToUser(p.penumpang_id, {
        ...msg,
        tag: `trip-${id}-${nextProgress}`,
        url: "/pesanan",
      }).catch(() => {});
    }
  }

  res.json({ id, trip_progress: nextProgress });
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
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
      b: scheduleBookingsTable,
      s: schedulesTable,
      driver: usersTable,
      kendaraan: kendaraanTable,
    })
    .from(scheduleBookingsTable)
    .leftJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
    .leftJoin(usersTable, eq(usersTable.id, schedulesTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, schedulesTable.kendaraan_id))
    .where(eq(scheduleBookingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }

  const isPenumpang = user.id === row.b.penumpang_id;
  const isMitra = !!row.s && user.id === row.s.driver_id;
  if (!isPenumpang && !isMitra) {
    res.status(403).json({ error: "Tidak boleh melihat pesanan ini." });
    return;
  }

  const canCancel =
    isPenumpang &&
    ["pending", "paid", "aktif"].includes(row.b.status) &&
    !!row.s?.departure_date &&
    !!row.s?.departure_time &&
    !pastCancellationCutoff(row.s.departure_date, row.s.departure_time);

  // already_rated by current user (penumpang)
  let alreadyRated = false;
  if (isPenumpang) {
    const [r] = await db
      .select({ id: ratingsTable.id })
      .from(ratingsTable)
      .where(
        and(
          eq(ratingsTable.rater_id, user.id),
          eq(ratingsTable.booking_id, id),
        ),
      );
    alreadyRated = !!r;
  }

  res.json({
    ...row.b,
    schedule: row.s
      ? {
          id: row.s.id,
          origin_city: row.s.origin_city,
          destination_city: row.s.destination_city,
          departure_date: row.s.departure_date,
          departure_time: row.s.departure_time,
          price_per_seat: row.s.price_per_seat,
          capacity: row.s.capacity,
          trip_progress: row.s.trip_progress,
          driver_lat: row.s.driver_lat ?? null,
          driver_lng: row.s.driver_lng ?? null,
          driver_location_updated_at: row.s.driver_location_updated_at ?? null,
        }
      : null,
    driver: row.driver
      ? {
          id: row.driver.id,
          nama: row.driver.nama,
          no_whatsapp: row.driver.no_whatsapp,
          foto_profil: row.driver.foto_profil ?? null,
        }
      : null,
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
    is_mitra: isMitra,
    can_cancel: canCancel,
    already_rated: alreadyRated,
  });
});

// ---------- Penumpang side actions ----------

const RatingBody = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional().nullable(),
});

async function loadBookingForPenumpang(id: number, userId: number) {
  const [row] = await db
    .select({
      b: scheduleBookingsTable,
      s: schedulesTable,
    })
    .from(scheduleBookingsTable)
    .leftJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
    .where(eq(scheduleBookingsTable.id, id));
  if (!row) return { error: "Pesanan tidak ditemukan.", code: 404 as const };
  if (row.b.penumpang_id !== userId) return { error: "Bukan pesanan Anda.", code: 403 as const };
  return { row };
}

router.post("/bookings/:id/confirm-pickup", async (req, res): Promise<void> => {
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
  const r = await loadBookingForPenumpang(id, user.id);
  if ("error" in r) {
    res.status(r.code).json({ error: r.error });
    return;
  }
  const { row } = r;
  if (!row.s) {
    res.status(400).json({ error: "Jadwal tidak ditemukan." });
    return;
  }
  if (!["sudah_jemput", "dalam_perjalanan", "selesai"].includes(row.s.trip_progress)) {
    res.status(400).json({ error: "Mitra belum menjemput Anda." });
    return;
  }
  if (row.b.pickup_confirmed_at) {
    res.json({ ok: true, pickup_confirmed_at: row.b.pickup_confirmed_at });
    return;
  }
  const [updated] = await db
    .update(scheduleBookingsTable)
    .set({ pickup_confirmed_at: new Date(), updated_at: new Date() })
    .where(eq(scheduleBookingsTable.id, id))
    .returning();
  res.json({ ok: true, pickup_confirmed_at: updated.pickup_confirmed_at });
});

router.post("/bookings/:id/confirm-dropoff", async (req, res): Promise<void> => {
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
  const r = await loadBookingForPenumpang(id, user.id);
  if ("error" in r) {
    res.status(r.code).json({ error: r.error });
    return;
  }
  const { row } = r;
  if (!row.s) {
    res.status(400).json({ error: "Jadwal tidak ditemukan." });
    return;
  }
  if (row.s.trip_progress !== "selesai") {
    res.status(400).json({ error: "Trip belum selesai." });
    return;
  }
  if (row.b.dropoff_confirmed_at) {
    res.json({ ok: true, dropoff_confirmed_at: row.b.dropoff_confirmed_at });
    return;
  }
  const [updated] = await db
    .update(scheduleBookingsTable)
    .set({ dropoff_confirmed_at: new Date(), updated_at: new Date() })
    .where(eq(scheduleBookingsTable.id, id))
    .returning();
  res.json({ ok: true, dropoff_confirmed_at: updated.dropoff_confirmed_at });
});

router.post("/bookings/:id/cancel", async (req, res): Promise<void> => {
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
  const r = await loadBookingForPenumpang(id, user.id);
  if ("error" in r) {
    res.status(r.code).json({ error: r.error });
    return;
  }
  const { row } = r;
  if (!row.s) {
    res.status(400).json({ error: "Jadwal tidak ditemukan." });
    return;
  }
  if (!["pending", "paid", "aktif"].includes(row.b.status)) {
    res.status(400).json({ error: "Pesanan tidak dapat dibatalkan." });
    return;
  }
  if (!row.s.departure_time || pastCancellationCutoff(row.s.departure_date, row.s.departure_time)) {
    res
      .status(400)
      .json({ error: "Pembatalan hanya bisa dilakukan minimal 24 jam sebelum keberangkatan." });
    return;
  }
  await db
    .update(scheduleBookingsTable)
    .set({ status: "batal", cancelled_at: new Date(), updated_at: new Date() })
    .where(eq(scheduleBookingsTable.id, id));
  if (row.s?.driver_id) {
    sendPushToUser(row.s.driver_id, {
      title: "Pesanan Dibatalkan",
      body: `${user.nama} membatalkan pesanan untuk jadwal Anda.`,
      tag: `booking-cancel-${id}`,
      url: "/pesanan",
    }).catch(() => {});
  }
  res.json({ ok: true });
});

router.post("/bookings/:id/rating", async (req, res): Promise<void> => {
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
  const parsed = RatingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const r = await loadBookingForPenumpang(id, user.id);
  if ("error" in r) {
    res.status(r.code).json({ error: r.error });
    return;
  }
  const { row } = r;
  if (!row.s) {
    res.status(400).json({ error: "Jadwal tidak ditemukan." });
    return;
  }
  if (row.b.status !== "selesai") {
    res.status(400).json({ error: "Rating hanya bisa diberikan setelah trip selesai." });
    return;
  }
  const inserted = await db
    .insert(ratingsTable)
    .values({
      schedule_id: row.s.id,
      booking_id: id,
      rater_id: user.id,
      ratee_id: row.s.driver_id,
      stars: parsed.data.stars,
      comment: parsed.data.comment ?? null,
    })
    .onConflictDoNothing({ target: [ratingsTable.rater_id, ratingsTable.booking_id] })
    .returning({ id: ratingsTable.id });
  if (inserted.length === 0) {
    res.status(400).json({ error: "Anda sudah memberi rating untuk pesanan ini." });
    return;
  }
  res.json({ ok: true });
});

router.get("/users/:id/rating-summary", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const [agg] = await db
    .select({
      avg: sql<number>`COALESCE(AVG(${ratingsTable.stars})::float, 0)`.as("avg"),
      count: sql<number>`COUNT(*)::int`.as("count"),
    })
    .from(ratingsTable)
    .where(eq(ratingsTable.ratee_id, id));
  res.json({ avg: agg?.avg ?? 0, count: agg?.count ?? 0 });
});

router.post("/bookings/:id/payment-proof", async (req, res): Promise<void> => {
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

  const parsed = PaymentProofBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [b] = await db
    .select()
    .from(scheduleBookingsTable)
    .where(eq(scheduleBookingsTable.id, id));
  if (!b) {
    res.status(404).json({ error: "Pesanan tidak ditemukan." });
    return;
  }
  if (b.penumpang_id !== user.id) {
    res.status(403).json({ error: "Bukan pesanan Anda." });
    return;
  }
  if (b.status !== "pending" && b.status !== "paid") {
    res.status(400).json({ error: `Tidak bisa upload bukti — status pesanan: ${b.status}.` });
    return;
  }

  const [updated] = await db
    .update(scheduleBookingsTable)
    .set({
      payment_proof_url: parsed.data.url,
      status: "paid",
      updated_at: new Date(),
    })
    .where(eq(scheduleBookingsTable.id, id))
    .returning();

  req.log.info({ bookingId: id, userId: user.id }, "Payment proof uploaded");
  res.json(updated);
});

// ---------- Driver location sharing ----------

router.patch("/schedules/:id/driver-location", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }
  const { lat, lng } = req.body as { lat?: number; lng?: number };
  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat dan lng wajib diisi." }); return;
  }
  const [sched] = await db.select({ driver_id: schedulesTable.driver_id })
    .from(schedulesTable).where(eq(schedulesTable.id, id));
  if (!sched || sched.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan jadwal Anda." }); return;
  }
  await db.update(schedulesTable)
    .set({ driver_lat: lat, driver_lng: lng, driver_location_updated_at: new Date() })
    .where(eq(schedulesTable.id, id));
  res.json({ ok: true });
});

export default router;
