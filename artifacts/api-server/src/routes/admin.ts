import { Router, type IRouter } from "express";
import { eq, desc, count, sum, and, gte, lte, ilike, or, isNotNull, sql as drizzleSql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  db,
  usersTable,
  sessionsTable,
  schedulesTable,
  scheduleBookingsTable,
  carterBookingsTable,
  carterSettingsTable,
  kendaraanTable,
  ratingsTable,
  kotaListTable,
  announcementsTable,
  routePricesTable,
  adminLogsTable,
  chatThreadsTable,
  rentalBookingsTable,
  rentalKendaraanTable,
  pushSubscriptionsTable,
} from "@workspace/db";
import { createNotification } from "../lib/notifications";

const router: IRouter = Router();

async function getAdminFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const now = new Date();
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.token, token));
  if (!session || session.expires_at < now) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.user_id));
  if (!user || user.role !== "admin") return null;
  return user;
}

async function logAdmin(adminId: number, adminNama: string, aksi: string, detail?: string) {
  await db.insert(adminLogsTable).values({ admin_id: adminId, admin_nama: adminNama, aksi, detail: detail ?? null });
}

function adminGuard(handler: Parameters<typeof router.get>[1]) {
  return (async (req: any, res: any, next: any): Promise<void> => {
    try {
      const admin = await getAdminFromToken(req.headers.authorization);
      if (!admin) { res.status(401).json({ error: "Akses ditolak. Hanya admin." }); return; }
      (req as any).admin = admin;
      await (handler as any)(req, res, next);
    } catch (err) {
      next(err);
    }
  }) as any;
}

// ===================== DASHBOARD STATS =====================
router.get("/admin/stats", adminGuard(async (req: any, res: any) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalUsers] = await db.select({ c: count() }).from(usersTable);
  const [totalDrivers] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.role, "driver"));
  const [totalPenumpang] = await db.select({ c: count() }).from(usersTable).where(eq(usersTable.role, "penumpang"));
  const [totalBookings] = await db.select({ c: count() }).from(scheduleBookingsTable);
  const [totalCarter] = await db.select({ c: count() }).from(carterBookingsTable);
  const [totalRental] = await db.select({ c: count() }).from(rentalBookingsTable);
  const [bookingHariIni] = await db.select({ c: count() }).from(scheduleBookingsTable)
    .where(and(gte(scheduleBookingsTable.created_at, today), lte(scheduleBookingsTable.created_at, tomorrow)));
  const [pendapatanTotal] = await db.select({ s: sum(scheduleBookingsTable.total_amount) })
    .from(scheduleBookingsTable).where(eq(scheduleBookingsTable.status, "paid"));
  const [pendapatanCarter] = await db.select({ s: sum(carterBookingsTable.total_amount) })
    .from(carterBookingsTable).where(eq(carterBookingsTable.status, "paid"));
  const [pendapatanRental] = await db.select({ s: sum(rentalBookingsTable.total_amount) })
    .from(rentalBookingsTable).where(or(
      eq(rentalBookingsTable.status, "paid"),
      eq(rentalBookingsTable.status, "confirmed"),
      eq(rentalBookingsTable.status, "aktif"),
      eq(rentalBookingsTable.status, "selesai"),
    ));
  const [tripAktif] = await db.select({ c: count() }).from(schedulesTable)
    .where(eq(schedulesTable.trip_progress, "dalam_perjalanan"));
  const [pembayaranPending] = await db.select({ c: count() }).from(scheduleBookingsTable)
    .where(eq(scheduleBookingsTable.status, "paid"));

  res.json({
    total_users: totalUsers.c,
    total_drivers: totalDrivers.c,
    total_penumpang: totalPenumpang.c,
    total_bookings: Number(totalBookings.c) + Number(totalCarter.c) + Number(totalRental.c),
    booking_hari_ini: bookingHariIni.c,
    pendapatan_total: Number(pendapatanTotal.s ?? 0) + Number(pendapatanCarter.s ?? 0) + Number(pendapatanRental.s ?? 0),
    trip_aktif: tripAktif.c,
    pembayaran_pending: pembayaranPending.c,
  });
}));

// ===================== USERS =====================
router.get("/admin/users", adminGuard(async (req: any, res: any) => {
  const { q, role } = req.query as Record<string, string>;
  let query = db
    .select({
      id: usersTable.id, nama: usersTable.nama, no_whatsapp: usersTable.no_whatsapp,
      role: usersTable.role, kota: usersTable.kota, nik: usersTable.nik,
      foto_profil: usersTable.foto_profil, foto_diri: usersTable.foto_diri,
      is_verified: usersTable.is_verified, is_suspended: usersTable.is_suspended,
      created_at: usersTable.created_at, last_login: usersTable.last_login,
      last_active: usersTable.last_active,
      provinsi: kotaListTable.provinsi,
    })
    .from(usersTable)
    .leftJoin(kotaListTable, drizzleSql`lower(${usersTable.kota}) = lower(${kotaListTable.nama_kota})`)
    .$dynamic();
  const conds: any[] = [];
  if (role) conds.push(eq(usersTable.role, role));
  if (q) conds.push(or(ilike(usersTable.nama, `%${q}%`), ilike(usersTable.no_whatsapp, `%${q}%`)));
  if (conds.length) query = query.where(and(...conds));
  const users = await query.orderBy(desc(usersTable.created_at)).limit(100);
  res.json(users);
}));

// ===================== PENDING MITRA =====================
router.get("/admin/pending-mitra", adminGuard(async (_req: any, res: any) => {
  const mitra = await db.select().from(usersTable)
    .where(and(eq(usersTable.role, "driver"), eq(usersTable.is_verified, false)))
    .orderBy(desc(usersTable.created_at));
  res.json(mitra.map(u => ({
    id: u.id, nama: u.nama, no_whatsapp: u.no_whatsapp,
    kota: u.kota, model_kendaraan: u.model_kendaraan,
    foto_diri: u.foto_diri, foto_stnk: u.foto_stnk,
    created_at: u.created_at,
  })));
}));

router.patch("/admin/users/:id/approve", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User tidak ditemukan." }); return; }
  if (target.role !== "driver" || target.is_verified) {
    res.status(400).json({ error: "Hanya mitra driver yang belum diverifikasi yang bisa disetujui." }); return;
  }
  const [u] = await db.update(usersTable).set({ is_verified: true }).where(eq(usersTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "APPROVE_MITRA", `Mitra #${id} (${u.nama}) disetujui`);
  createNotification(id, "mitra_approved", "Pendaftaran Disetujui!", "Selamat! Akun Mitra Driver Anda telah diverifikasi oleh admin. Anda sudah bisa mulai menerima penumpang.", "user", id).catch(() => {});
  res.json({ ok: true });
}));

router.patch("/admin/users/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!u) { res.status(404).json({ error: "User tidak ditemukan." }); return; }
  if (u.role !== "driver" || u.is_verified) {
    res.status(400).json({ error: "Hanya mitra driver yang belum diverifikasi yang bisa ditolak." }); return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.user_id, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_MITRA", `Mitra #${id} (${u.nama}) ditolak dan dihapus`);
  res.json({ ok: true });
}));

router.patch("/admin/users/:id/suspend", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [u] = await db.update(usersTable).set({ is_suspended: true }).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User tidak ditemukan." }); return; }
  await db.delete(sessionsTable).where(eq(sessionsTable.user_id, id));
  await logAdmin(req.admin.id, req.admin.nama, "SUSPEND_USER", `User #${id} (${u.nama}) disuspend`);
  res.json({ ok: true });
}));

router.patch("/admin/users/:id/unsuspend", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [u] = await db.update(usersTable).set({ is_suspended: false }).where(eq(usersTable.id, id)).returning();
  if (!u) { res.status(404).json({ error: "User tidak ditemukan." }); return; }
  await logAdmin(req.admin.id, req.admin.nama, "UNSUSPEND_USER", `User #${id} (${u.nama}) diaktifkan kembali`);
  res.json({ ok: true });
}));

router.patch("/admin/users/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const { role, nama, kota } = req.body as Record<string, string>;
  const updates: Record<string, any> = {};
  if (role) updates.role = role;
  if (nama) updates.nama = nama;
  if (kota !== undefined) updates.kota = kota ? kota.trim().toLowerCase() : null;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Tidak ada perubahan." }); return; }
  const [current] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!current) { res.status(404).json({ error: "User tidak ditemukan." }); return; }
  const effectiveRole = updates.role ?? current.role;
  const effectiveKota = updates.kota !== undefined ? updates.kota : current.kota;
  if (effectiveRole === "driver" && (!effectiveKota || !effectiveKota.trim())) {
    res.status(400).json({ error: "Mitra wajib mengisi provinsi dan kota domisili." });
    return;
  }
  const [u] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "UPDATE_USER", `User #${id} diupdate: ${JSON.stringify(updates)}`);
  res.json(u);
}));

router.delete("/admin/users/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  await db.delete(sessionsTable).where(eq(sessionsTable.user_id, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_USER", `User #${id} dihapus`);
  res.json({ ok: true });
}));

// ===================== SCHEDULES =====================
router.get("/admin/schedules/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const penumpangAlias = alias(usersTable, "penumpang_alias");

  const [schedRow] = await db
    .select({
      s: schedulesTable,
      driver: {
        id: usersTable.id,
        nama: usersTable.nama,
        no_whatsapp: usersTable.no_whatsapp,
        foto_profil: usersTable.foto_profil,
        nama_bank: usersTable.nama_bank,
        no_rekening: usersTable.no_rekening,
        nama_pemilik_rekening: usersTable.nama_pemilik_rekening,
      },
      kendaraan: {
        merek: kendaraanTable.merek,
        model: kendaraanTable.model,
        plat_nomor: kendaraanTable.plat_nomor,
        warna: kendaraanTable.warna,
        foto_url: kendaraanTable.foto_url,
      },
    })
    .from(schedulesTable)
    .leftJoin(usersTable, eq(schedulesTable.driver_id, usersTable.id))
    .leftJoin(
      kendaraanTable,
      and(
        eq(kendaraanTable.driver_id, schedulesTable.driver_id),
        eq(kendaraanTable.is_default, true),
      ),
    )
    .where(eq(schedulesTable.id, id));

  if (!schedRow) { res.status(404).json({ error: "Jadwal tidak ditemukan." }); return; }

  const bookingRows = await db
    .select({
      b: scheduleBookingsTable,
      penumpang: {
        id: penumpangAlias.id,
        nama: penumpangAlias.nama,
        no_whatsapp: penumpangAlias.no_whatsapp,
      },
    })
    .from(scheduleBookingsTable)
    .leftJoin(penumpangAlias, eq(scheduleBookingsTable.penumpang_id, penumpangAlias.id))
    .where(eq(scheduleBookingsTable.schedule_id, id))
    .orderBy(scheduleBookingsTable.created_at);

  const bookings = bookingRows.map(r => ({
    ...r.b,
    penumpang_nama: r.penumpang?.nama ?? "–",
    penumpang_no_wa: r.penumpang?.no_whatsapp ?? null,
  }));

  const totalPendapatan = bookings
    .filter(b => ["confirmed", "aktif", "selesai"].includes(b.status))
    .reduce((acc, b) => acc + b.total_amount, 0);

  res.json({
    ...schedRow.s,
    driver: schedRow.driver?.id ? schedRow.driver : null,
    kendaraan: schedRow.kendaraan?.plat_nomor ? schedRow.kendaraan : null,
    total_pendapatan: totalPendapatan,
    bookings,
  });
}));

router.get("/admin/schedules", adminGuard(async (req: any, res: any) => {
  const { date } = req.query as Record<string, string>;
  const schedConds: any[] = [];
  if (date) schedConds.push(eq(schedulesTable.departure_date, date));

  const [schedRows, aggRows] = await Promise.all([
    db.select({ s: schedulesTable, driver: { id: usersTable.id, nama: usersTable.nama } })
      .from(schedulesTable)
      .leftJoin(usersTable, eq(schedulesTable.driver_id, usersTable.id))
      .where(schedConds.length ? and(...schedConds) : undefined)
      .orderBy(desc(schedulesTable.created_at)).limit(200),
    db.select({
      schedule_id: scheduleBookingsTable.schedule_id,
      penumpang_count: count(scheduleBookingsTable.id),
      total_pendapatan: sum(scheduleBookingsTable.total_amount),
    })
      .from(scheduleBookingsTable)
      .where(or(
        eq(scheduleBookingsTable.status, "confirmed"),
        eq(scheduleBookingsTable.status, "aktif"),
        eq(scheduleBookingsTable.status, "selesai"),
      ))
      .groupBy(scheduleBookingsTable.schedule_id),
  ]);
  const aggMap = new Map(aggRows.map(a => [
    a.schedule_id,
    { penumpang_count: Number(a.penumpang_count), total_pendapatan: Number(a.total_pendapatan ?? 0) },
  ]));
  res.json(schedRows.map(r => ({
    ...r.s,
    driver: r.driver,
    penumpang_count: aggMap.get(r.s.id)?.penumpang_count ?? 0,
    total_pendapatan: aggMap.get(r.s.id)?.total_pendapatan ?? 0,
  })));
}));

router.patch("/admin/schedules/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const { departure_date, departure_time, price_per_seat } = req.body as Record<string, any>;
  const updates: Record<string, any> = {};
  if (departure_date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(departure_date))) {
      res.status(400).json({ error: "Format tanggal tidak valid (YYYY-MM-DD)." }); return;
    }
    updates.departure_date = departure_date;
  }
  if (departure_time !== undefined) {
    if (!/^\d{2}:\d{2}$/.test(String(departure_time))) {
      res.status(400).json({ error: "Format waktu tidak valid (HH:MM)." }); return;
    }
    updates.departure_time = departure_time;
  }
  if (price_per_seat !== undefined) {
    const parsed = Number(price_per_seat);
    if (isNaN(parsed) || parsed <= 0) {
      res.status(400).json({ error: "Harga per kursi harus angka positif." }); return;
    }
    updates.price_per_seat = parsed;
  }
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Tidak ada perubahan." }); return; }
  const [s] = await db.update(schedulesTable).set(updates).where(eq(schedulesTable.id, id)).returning();
  if (!s) { res.status(404).json({ error: "Jadwal tidak ditemukan." }); return; }
  await logAdmin(req.admin.id, req.admin.nama, "EDIT_SCHEDULE", `Jadwal #${id} diupdate: ${JSON.stringify(updates)}`);
  res.json(s);
}));

router.delete("/admin/schedules/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  await db.delete(schedulesTable).where(eq(schedulesTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_SCHEDULE", `Jadwal #${id} dihapus`);
  res.json({ ok: true });
}));

// ===================== BOOKINGS REGULER =====================
const driverAlias = alias(usersTable, "driver_alias");
router.get("/admin/bookings", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select({
    b: scheduleBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama, no_whatsapp: usersTable.no_whatsapp },
    schedule: {
      id: schedulesTable.id,
      origin_city: schedulesTable.origin_city,
      destination_city: schedulesTable.destination_city,
      departure_date: schedulesTable.departure_date,
      departure_time: schedulesTable.departure_time,
      trip_progress: schedulesTable.trip_progress,
    },
    driver: { id: driverAlias.id, nama: driverAlias.nama },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.penumpang_id, usersTable.id))
    .leftJoin(schedulesTable, eq(scheduleBookingsTable.schedule_id, schedulesTable.id))
    .leftJoin(driverAlias, eq(schedulesTable.driver_id, driverAlias.id))
    .orderBy(desc(scheduleBookingsTable.created_at))
    .limit(200);
  res.json(rows.map(r => ({ ...r.b, user: r.user, schedule: r.schedule, driver: r.driver })));
}));

router.get("/admin/bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const bPenumpang = alias(usersTable, "b_penumpang");
  const bDriver = alias(usersTable, "b_driver");

  const [row] = await db
    .select({
      b: scheduleBookingsTable,
      penumpang: { id: bPenumpang.id, nama: bPenumpang.nama, no_whatsapp: bPenumpang.no_whatsapp },
      schedule: {
        id: schedulesTable.id,
        origin_city: schedulesTable.origin_city,
        destination_city: schedulesTable.destination_city,
        departure_date: schedulesTable.departure_date,
        departure_time: schedulesTable.departure_time,
        trip_progress: schedulesTable.trip_progress,
      },
      driver: { id: bDriver.id, nama: bDriver.nama, no_whatsapp: bDriver.no_whatsapp, foto_profil: bDriver.foto_profil, nama_bank: bDriver.nama_bank, no_rekening: bDriver.no_rekening, nama_pemilik_rekening: bDriver.nama_pemilik_rekening },
      kendaraan: { merek: kendaraanTable.merek, model: kendaraanTable.model, plat_nomor: kendaraanTable.plat_nomor, warna: kendaraanTable.warna, foto_url: kendaraanTable.foto_url },
    })
    .from(scheduleBookingsTable)
    .leftJoin(bPenumpang, eq(scheduleBookingsTable.penumpang_id, bPenumpang.id))
    .leftJoin(schedulesTable, eq(scheduleBookingsTable.schedule_id, schedulesTable.id))
    .leftJoin(bDriver, eq(schedulesTable.driver_id, bDriver.id))
    .leftJoin(kendaraanTable, and(eq(kendaraanTable.driver_id, schedulesTable.driver_id), eq(kendaraanTable.is_default, true)))
    .where(eq(scheduleBookingsTable.id, id));

  if (!row) { res.status(404).json({ error: "Booking tidak ditemukan." }); return; }

  res.json({
    ...row.b,
    penumpang: row.penumpang?.id ? row.penumpang : null,
    schedule: row.schedule?.id ? row.schedule : null,
    driver: row.driver?.id ? row.driver : null,
    kendaraan: row.kendaraan?.plat_nomor ? row.kendaraan : null,
  });
}));

router.patch("/admin/bookings/:id/cancel", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(scheduleBookingsTable)
    .set({ status: "cancelled", cancelled_at: new Date() })
    .where(eq(scheduleBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CANCEL_BOOKING", `Booking #${id} dibatalkan`);
  res.json(b);
}));

router.delete("/admin/bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.select().from(scheduleBookingsTable).where(eq(scheduleBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Booking tidak ditemukan." }); return; }
  await db.delete(scheduleBookingsTable).where(eq(scheduleBookingsTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_BOOKING", `Booking reguler #${id} dihapus permanen`);
  res.json({ ok: true });
}));

// ===================== CARTER BOOKINGS =====================
router.get("/admin/carter-bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const penumpangAlias = alias(usersTable, "penumpang_alias");
  const driverAlias = alias(usersTable, "driver_alias");

  const [row] = await db
    .select({
      b: carterBookingsTable,
      penumpang: {
        id: penumpangAlias.id,
        nama: penumpangAlias.nama,
        no_whatsapp: penumpangAlias.no_whatsapp,
      },
      driver: {
        id: driverAlias.id,
        nama: driverAlias.nama,
        no_whatsapp: driverAlias.no_whatsapp,
        foto_profil: driverAlias.foto_profil,
        nama_bank: driverAlias.nama_bank,
        no_rekening: driverAlias.no_rekening,
        nama_pemilik_rekening: driverAlias.nama_pemilik_rekening,
      },
      kendaraan: {
        merek: kendaraanTable.merek,
        model: kendaraanTable.model,
        plat_nomor: kendaraanTable.plat_nomor,
        warna: kendaraanTable.warna,
        foto_url: kendaraanTable.foto_url,
      },
    })
    .from(carterBookingsTable)
    .leftJoin(penumpangAlias, eq(carterBookingsTable.penumpang_id, penumpangAlias.id))
    .leftJoin(carterSettingsTable, eq(carterBookingsTable.settings_id, carterSettingsTable.id))
    .leftJoin(driverAlias, eq(carterSettingsTable.driver_id, driverAlias.id))
    .leftJoin(
      kendaraanTable,
      and(
        eq(kendaraanTable.driver_id, carterSettingsTable.driver_id),
        eq(kendaraanTable.is_default, true),
      ),
    )
    .where(eq(carterBookingsTable.id, id));

  if (!row) { res.status(404).json({ error: "Booking carter tidak ditemukan." }); return; }

  res.json({
    ...row.b,
    penumpang: row.penumpang?.id ? row.penumpang : null,
    driver: row.driver?.id ? row.driver : null,
    kendaraan: row.kendaraan?.plat_nomor ? row.kendaraan : null,
  });
}));

router.get("/admin/carter-bookings", adminGuard(async (req: any, res: any) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select({
    b: carterBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(carterBookingsTable)
    .leftJoin(usersTable, eq(carterBookingsTable.penumpang_id, usersTable.id))
    .$dynamic();
  if (status) q = q.where(eq(carterBookingsTable.status, status));
  const rows = await q.orderBy(desc(carterBookingsTable.created_at)).limit(200);
  res.json(rows.map(r => ({ ...r.b, user: r.user })));
}));

router.patch("/admin/carter-bookings/:id/cancel", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "cancelled", cancelled_at: new Date() })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CANCEL_CARTER", `Carter booking #${id} dibatalkan`);
  res.json(b);
}));

router.patch("/admin/carter-bookings/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking carter tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat dikonfirmasi." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "confirmed" })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_CARTER_PAYMENT", `Carter #${id} pembayaran dikonfirmasi`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_verified",
      "E-Tiket Carter Berhasil!",
      "Pembayaran carter Anda telah dikonfirmasi oleh admin. E-tiket Anda sudah aktif!",
      "carter_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/carter-bookings/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking carter tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat ditolak." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "pending", payment_proof_url: null })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_CARTER_PAYMENT", `Carter #${id} pembayaran ditolak`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_rejected",
      "Bukti Pembayaran Carter Ditolak",
      "Bukti pembayaran carter Anda tidak dapat diverifikasi. Silakan upload ulang bukti pembayaran yang valid.",
      "carter_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.delete("/admin/carter-bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.select().from(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Booking carter tidak ditemukan." }); return; }
  await db.delete(carterBookingsTable).where(eq(carterBookingsTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_CARTER_BOOKING", `Booking carter #${id} dihapus permanen`);
  res.json({ ok: true });
}));

// ===================== RENTAL BOOKINGS =====================
router.get("/admin/rental-bookings", adminGuard(async (req: any, res: any) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select({
    b: rentalBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(rentalBookingsTable)
    .leftJoin(usersTable, eq(rentalBookingsTable.penyewa_id, usersTable.id))
    .$dynamic();
  if (status) q = q.where(eq(rentalBookingsTable.status, status));
  const rows = await q.orderBy(desc(rentalBookingsTable.created_at)).limit(200);
  res.json(rows.map(r => ({ ...r.b, user: r.user })));
}));

router.get("/admin/rental-bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const penyewaAlias = alias(usersTable, "rental_penyewa");
  const driverAlias = alias(usersTable, "rental_driver");
  const [row] = await db
    .select({
      b: rentalBookingsTable,
      penyewa: { id: penyewaAlias.id, nama: penyewaAlias.nama, no_whatsapp: penyewaAlias.no_whatsapp },
      driver: {
        id: driverAlias.id, nama: driverAlias.nama, no_whatsapp: driverAlias.no_whatsapp,
        nama_bank: driverAlias.nama_bank, no_rekening: driverAlias.no_rekening, nama_pemilik_rekening: driverAlias.nama_pemilik_rekening,
      },
      kendaraan: { merek: kendaraanTable.merek, model: kendaraanTable.model, plat_nomor: kendaraanTable.plat_nomor, warna: kendaraanTable.warna, foto_url: kendaraanTable.foto_url },
    })
    .from(rentalBookingsTable)
    .leftJoin(penyewaAlias, eq(rentalBookingsTable.penyewa_id, penyewaAlias.id))
    .leftJoin(rentalKendaraanTable, eq(rentalBookingsTable.rental_id, rentalKendaraanTable.id))
    .leftJoin(driverAlias, eq(rentalKendaraanTable.driver_id, driverAlias.id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .where(eq(rentalBookingsTable.id, id));
  if (!row) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  res.json({
    ...row.b,
    penyewa: row.penyewa?.id ? row.penyewa : null,
    driver: row.driver?.id ? row.driver : null,
    kendaraan: row.kendaraan?.plat_nomor ? row.kendaraan : null,
  });
}));

router.patch("/admin/rental-bookings/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat dikonfirmasi." }); return; }
  const [b] = await db.update(rentalBookingsTable).set({ status: "confirmed", updated_at: new Date() }).where(eq(rentalBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_RENTAL_PAYMENT", `Rental #${id} pembayaran dikonfirmasi`);
  if (b?.penyewa_id) {
    createNotification(b.penyewa_id, "booking_verified", "Voucher Rental Berhasil!", "Pembayaran rental Anda telah dikonfirmasi oleh admin. Voucher Anda sudah aktif!", "rental_booking", id).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/rental-bookings/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat ditolak." }); return; }
  const [b] = await db.update(rentalBookingsTable).set({ status: "pending", payment_proof_url: null, updated_at: new Date() }).where(eq(rentalBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_RENTAL_PAYMENT", `Rental #${id} pembayaran ditolak`);
  if (b?.penyewa_id) {
    createNotification(b.penyewa_id, "booking_rejected", "Bukti Pembayaran Rental Ditolak", "Bukti pembayaran rental Anda tidak dapat diverifikasi. Silakan upload ulang bukti pembayaran yang valid.", "rental_booking", id).catch(() => {});
  }
  res.json(b);
}));

router.delete("/admin/rental-bookings/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  await db.delete(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_RENTAL_BOOKING", `Booking rental #${id} dihapus permanen`);
  res.json({ ok: true });
}));

// ===================== VERIFIKASI PEMBAYARAN =====================
router.get("/admin/payments", adminGuard(async (_req: any, res: any) => {
  const payDriver = alias(usersTable, "pay_driver");
  const schedule = await db.select({
    b: scheduleBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
    schedule: {
      id: schedulesTable.id,
      origin_city: schedulesTable.origin_city,
      destination_city: schedulesTable.destination_city,
    },
    driver: {
      id: payDriver.id,
      nama: payDriver.nama,
      nama_bank: payDriver.nama_bank,
      no_rekening: payDriver.no_rekening,
      nama_pemilik_rekening: payDriver.nama_pemilik_rekening,
    },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.penumpang_id, usersTable.id))
    .leftJoin(schedulesTable, eq(scheduleBookingsTable.schedule_id, schedulesTable.id))
    .leftJoin(payDriver, eq(schedulesTable.driver_id, payDriver.id))
    .where(eq(scheduleBookingsTable.status, "paid"))
    .orderBy(desc(scheduleBookingsTable.created_at)).limit(100);

  const carter = await db.select({
    b: carterBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(carterBookingsTable)
    .leftJoin(usersTable, eq(carterBookingsTable.penumpang_id, usersTable.id))
    .where(eq(carterBookingsTable.status, "paid"))
    .orderBy(desc(carterBookingsTable.created_at)).limit(100);

  const rental = await db.select({
    b: rentalBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
    driver: {
      id: payDriver.id,
      nama: payDriver.nama,
      nama_bank: payDriver.nama_bank,
      no_rekening: payDriver.no_rekening,
      nama_pemilik_rekening: payDriver.nama_pemilik_rekening,
    },
  })
    .from(rentalBookingsTable)
    .leftJoin(usersTable, eq(rentalBookingsTable.penyewa_id, usersTable.id))
    .leftJoin(rentalKendaraanTable, eq(rentalBookingsTable.rental_id, rentalKendaraanTable.id))
    .leftJoin(payDriver, eq(rentalKendaraanTable.driver_id, payDriver.id))
    .where(eq(rentalBookingsTable.status, "paid"))
    .orderBy(desc(rentalBookingsTable.created_at)).limit(100);

  res.json({
    schedule: schedule.map(r => ({
      ...r.b,
      user: r.user,
      schedule: r.schedule?.id ? r.schedule : null,
      driver: r.driver?.id ? r.driver : null,
      jenis: "reguler",
    })),
    carter: carter.map(r => ({ ...r.b, user: r.user, jenis: "carter" })),
    rental: rental.map(r => ({ ...r.b, user: r.user, driver: r.driver?.id ? r.driver : null, jenis: "rental" })),
  });
}));

router.patch("/admin/payments/booking/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(scheduleBookingsTable).where(eq(scheduleBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat dikonfirmasi." }); return; }
  const [b] = await db.update(scheduleBookingsTable)
    .set({ status: "confirmed" })
    .where(eq(scheduleBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_PAYMENT", `Booking #${id} pembayaran dikonfirmasi`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_verified",
      "E-Tiket Berhasil!",
      "Pembayaran Anda telah dikonfirmasi oleh admin. Selamat, e-tiket Anda sudah aktif!",
      "schedule_booking", id,
    ).catch(() => {});
  }
  if (b?.schedule_id) {
    (async () => {
      const [[schedule], [penumpang], remainingPaid] = await Promise.all([
        db.select().from(schedulesTable).where(eq(schedulesTable.id, b.schedule_id)),
        db.select({ nama: usersTable.nama }).from(usersTable).where(eq(usersTable.id, b.penumpang_id)),
        db.select({ cnt: count() }).from(scheduleBookingsTable).where(and(
          eq(scheduleBookingsTable.schedule_id, b.schedule_id),
          eq(scheduleBookingsTable.status, "paid"),
        )),
      ]);
      if (!schedule?.driver_id) return;
      const rute = `${schedule.origin_city} → ${schedule.destination_city}`;
      const penumpangNama = penumpang?.nama ?? "Penumpang";
      await createNotification(
        schedule.driver_id, "payment_confirmed",
        "Pembayaran Penumpang Dikonfirmasi",
        `Pembayaran ${penumpangNama} untuk rute ${rute} sudah dikonfirmasi oleh admin.`,
        "schedule", b.schedule_id,
      );
      const stillPaid = Number(remainingPaid[0]?.cnt ?? 0);
      if (stillPaid === 0) {
        await createNotification(
          schedule.driver_id, "all_payments_confirmed",
          "Semua Pembayaran Dikonfirmasi",
          `Semua pembayaran sudah dikonfirmasi. Anda sudah bisa mulai menjemput penumpang untuk rute ${rute}.`,
          "schedule", b.schedule_id,
        );
      }
    })().catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/payments/booking/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(scheduleBookingsTable)
    .set({ status: "pending", payment_proof_url: null })
    .where(eq(scheduleBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_PAYMENT", `Booking #${id} pembayaran ditolak`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_rejected",
      "Bukti Pembayaran Ditolak",
      "Bukti pembayaran Anda tidak dapat diverifikasi. Silakan upload ulang bukti pembayaran yang valid.",
      "schedule_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/payments/rental/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat dikonfirmasi." }); return; }
  const [b] = await db.update(rentalBookingsTable)
    .set({ status: "confirmed", updated_at: new Date() })
    .where(eq(rentalBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_RENTAL_PAYMENT", `Rental #${id} pembayaran dikonfirmasi`);
  if (b?.penyewa_id) {
    createNotification(
      b.penyewa_id, "booking_verified",
      "Voucher Rental Berhasil!",
      "Pembayaran rental Anda telah dikonfirmasi oleh admin. Voucher Anda sudah aktif!",
      "rental_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/payments/rental/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [existing] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Booking rental tidak ditemukan." }); return; }
  if (existing.status !== "paid") { res.status(400).json({ error: "Hanya booking dengan status 'paid' yang dapat ditolak." }); return; }
  const [b] = await db.update(rentalBookingsTable)
    .set({ status: "pending", payment_proof_url: null, updated_at: new Date() })
    .where(eq(rentalBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_RENTAL_PAYMENT", `Rental #${id} pembayaran ditolak`);
  if (b?.penyewa_id) {
    createNotification(
      b.penyewa_id, "booking_rejected",
      "Bukti Pembayaran Rental Ditolak",
      "Bukti pembayaran rental Anda tidak dapat diverifikasi. Silakan upload ulang bukti pembayaran yang valid.",
      "rental_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/payments/carter/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "confirmed" })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_CARTER_PAYMENT", `Carter #${id} pembayaran dikonfirmasi`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_verified",
      "E-Tiket Carter Berhasil!",
      "Pembayaran carter Anda telah dikonfirmasi oleh admin. E-tiket Anda sudah aktif!",
      "carter_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

router.patch("/admin/payments/carter/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "pending", payment_proof_url: null })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_CARTER_PAYMENT", `Carter #${id} pembayaran ditolak`);
  if (b?.penumpang_id) {
    createNotification(
      b.penumpang_id, "booking_rejected",
      "Bukti Pembayaran Carter Ditolak",
      "Bukti pembayaran carter Anda tidak dapat diverifikasi. Silakan upload ulang bukti pembayaran yang valid.",
      "carter_booking", id,
    ).catch(() => {});
  }
  res.json(b);
}));

// ===================== KENDARAAN =====================
router.get("/admin/kendaraan", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select({
    k: kendaraanTable,
    driver: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(kendaraanTable)
    .leftJoin(usersTable, eq(kendaraanTable.driver_id, usersTable.id))
    .orderBy(desc(kendaraanTable.id));
  res.json(rows.map(r => ({ ...r.k, driver: r.driver })));
}));

// ===================== RATINGS =====================
router.get("/admin/ratings", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select({
    r: ratingsTable,
    rater: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(ratingsTable)
    .leftJoin(usersTable, eq(ratingsTable.rater_id, usersTable.id))
    .orderBy(desc(ratingsTable.created_at)).limit(200);
  res.json(rows.map(r => ({ ...r.r, rater: r.rater })));
}));

// ===================== LAPORAN KEUANGAN =====================
router.get("/admin/laporan", adminGuard(async (req: any, res: any) => {
  const { dari, sampai } = req.query as Record<string, string>;
  const start = dari ? new Date(dari) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const end = sampai ? new Date(sampai) : new Date();
  end.setHours(23, 59, 59, 999);

  const bookings = await db.select({
    b: scheduleBookingsTable,
    user: { nama: usersTable.nama },
    schedule: { origin_city: schedulesTable.origin_city, destination_city: schedulesTable.destination_city },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.penumpang_id, usersTable.id))
    .leftJoin(schedulesTable, eq(scheduleBookingsTable.schedule_id, schedulesTable.id))
    .where(and(
      gte(scheduleBookingsTable.created_at, start),
      lte(scheduleBookingsTable.created_at, end),
      or(eq(scheduleBookingsTable.status, "paid"), eq(scheduleBookingsTable.status, "confirmed")),
    ))
    .orderBy(desc(scheduleBookingsTable.created_at));

  const carterB = await db.select({
    b: carterBookingsTable,
    user: { nama: usersTable.nama },
  })
    .from(carterBookingsTable)
    .leftJoin(usersTable, eq(carterBookingsTable.penumpang_id, usersTable.id))
    .where(and(
      gte(carterBookingsTable.created_at, start),
      lte(carterBookingsTable.created_at, end),
      or(eq(carterBookingsTable.status, "paid"), eq(carterBookingsTable.status, "confirmed")),
    ))
    .orderBy(desc(carterBookingsTable.created_at));

  const rentalB = await db.select({
    b: rentalBookingsTable,
    user: { nama: usersTable.nama },
  })
    .from(rentalBookingsTable)
    .leftJoin(usersTable, eq(rentalBookingsTable.penyewa_id, usersTable.id))
    .where(and(
      gte(rentalBookingsTable.created_at, start),
      lte(rentalBookingsTable.created_at, end),
      or(
        eq(rentalBookingsTable.status, "paid"),
        eq(rentalBookingsTable.status, "confirmed"),
        eq(rentalBookingsTable.status, "aktif"),
        eq(rentalBookingsTable.status, "selesai"),
      ),
    ))
    .orderBy(desc(rentalBookingsTable.created_at));

  const platformRate = 0.10;

  const bookingItems = bookings.map(r => {
    const bruto = Number(r.b.total_amount);
    const komisi = Math.round(bruto * platformRate);
    return { ...r.b, user: r.user, schedule: r.schedule, jenis: "reguler" as const, komisi_platform: komisi, nett_driver: bruto - komisi };
  });
  const carterItems = carterB.map(r => {
    const bruto = Number(r.b.total_amount);
    const komisi = Math.round(bruto * platformRate);
    return { ...r.b, user: r.user, jenis: "carter" as const, komisi_platform: komisi, nett_driver: bruto - komisi };
  });
  const rentalItems = rentalB.map(r => {
    const bruto = Number(r.b.total_amount);
    const komisi = Math.round(bruto * platformRate);
    return { ...r.b, user: r.user, jenis: "rental" as const, komisi_platform: komisi, nett_driver: bruto - komisi };
  });

  const totalReguler = bookingItems.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalCarter = carterItems.reduce((s, r) => s + Number(r.total_amount), 0);
  const totalRental = rentalItems.reduce((s, r) => s + Number(r.total_amount), 0);
  const komisiReguler = bookingItems.reduce((s, r) => s + r.komisi_platform, 0);
  const komisiCarter = carterItems.reduce((s, r) => s + r.komisi_platform, 0);
  const komisiRental = rentalItems.reduce((s, r) => s + r.komisi_platform, 0);
  const nettReguler = bookingItems.reduce((s, r) => s + r.nett_driver, 0);
  const nettCarter = carterItems.reduce((s, r) => s + r.nett_driver, 0);
  const nettRental = rentalItems.reduce((s, r) => s + r.nett_driver, 0);

  res.json({
    periode: { dari: start, sampai: end },
    platform_rate: platformRate,
    total_reguler: totalReguler,
    total_carter: totalCarter,
    total_rental: totalRental,
    total: totalReguler + totalCarter + totalRental,
    komisi_platform_reguler: komisiReguler,
    nett_driver_reguler: nettReguler,
    komisi_platform_carter: komisiCarter,
    nett_driver_carter: nettCarter,
    komisi_platform_rental: komisiRental,
    nett_driver_rental: nettRental,
    komisi_platform: komisiReguler + komisiCarter + komisiRental,
    nett_driver: nettReguler + nettCarter + nettRental,
    bookings: bookingItems,
    carter: carterItems,
    rental: rentalItems,
  });
}));

// ===================== KOTA/RUTE =====================
router.get("/admin/kota", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select().from(kotaListTable).orderBy(kotaListTable.nama_kota);
  res.json(rows);
}));

router.get("/admin/wilayah", adminGuard(async (_req: any, res: any) => {
  const rows = await db.selectDistinct({ wilayah: kotaListTable.wilayah }).from(kotaListTable).where(isNotNull(kotaListTable.wilayah)).orderBy(kotaListTable.wilayah);
  res.json(rows.map(r => r.wilayah).filter(Boolean));
}));

router.post("/admin/kota", adminGuard(async (req: any, res: any) => {
  const { nama_kota, provinsi, wilayah } = req.body as { nama_kota?: string; provinsi?: string; wilayah?: string };
  if (!nama_kota?.trim()) { res.status(400).json({ error: "Nama kota wajib diisi." }); return; }
  if (!provinsi?.trim()) { res.status(400).json({ error: "Provinsi wajib dipilih." }); return; }
  const [k] = await db.insert(kotaListTable).values({
    nama_kota: nama_kota.trim(),
    provinsi: provinsi.trim(),
    wilayah: wilayah?.trim() || null,
  }).returning();
  await logAdmin(req.admin.id, req.admin.nama, "ADD_KOTA", `Kota "${nama_kota}" (${provinsi}) ditambahkan`);
  res.json(k);
}));

router.patch("/admin/kota/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const { provinsi, wilayah } = req.body as { provinsi?: string; wilayah?: string };
  if (!provinsi?.trim()) { res.status(400).json({ error: "Provinsi wajib dipilih." }); return; }
  const [k] = await db.update(kotaListTable)
    .set({ provinsi: provinsi.trim(), wilayah: wilayah?.trim() || null })
    .where(eq(kotaListTable.id, id))
    .returning();
  if (!k) { res.status(404).json({ error: "Kota tidak ditemukan." }); return; }
  await logAdmin(req.admin.id, req.admin.nama, "EDIT_KOTA", `Kota "${k.nama_kota}" diubah ke provinsi ${provinsi}`);
  res.json(k);
}));

router.delete("/admin/kota/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [k] = await db.select().from(kotaListTable).where(eq(kotaListTable.id, id));
  await db.delete(kotaListTable).where(eq(kotaListTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_KOTA", `Kota "${k?.nama_kota}" dihapus`);
  res.json({ ok: true });
}));

// ===================== HARGA RUTE =====================
router.get("/admin/harga", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select().from(routePricesTable).orderBy(routePricesTable.origin_city);
  res.json(rows);
}));

router.post("/admin/harga", adminGuard(async (req: any, res: any) => {
  const { origin_city, destination_city, harga } = req.body as Record<string, any>;
  if (!origin_city || !destination_city || !harga) {
    res.status(400).json({ error: "origin_city, destination_city, harga wajib diisi." }); return;
  }
  const [h] = await db.insert(routePricesTable)
    .values({ origin_city, destination_city, harga: String(harga), updated_at: new Date() })
    .returning();
  await logAdmin(req.admin.id, req.admin.nama, "ADD_HARGA", `Harga ${origin_city}→${destination_city}: ${harga}`);
  res.json(h);
}));

router.patch("/admin/harga/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const { harga } = req.body as { harga?: number };
  if (!harga) { res.status(400).json({ error: "Harga wajib diisi." }); return; }
  const [h] = await db.update(routePricesTable)
    .set({ harga: String(harga), updated_at: new Date() })
    .where(eq(routePricesTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "UPDATE_HARGA", `Harga #${id} diupdate: ${harga}`);
  res.json(h);
}));

router.delete("/admin/harga/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  await db.delete(routePricesTable).where(eq(routePricesTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_HARGA", `Harga #${id} dihapus`);
  res.json({ ok: true });
}));

// ===================== PENGUMUMAN =====================
router.get("/admin/pengumuman", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select({
    a: announcementsTable,
    admin: { nama: usersTable.nama },
  })
    .from(announcementsTable)
    .leftJoin(usersTable, eq(announcementsTable.created_by_id, usersTable.id))
    .orderBy(desc(announcementsTable.created_at)).limit(50);
  res.json(rows.map(r => ({ ...r.a, admin: r.admin })));
}));

router.post("/admin/pengumuman", adminGuard(async (req: any, res: any) => {
  const { judul, isi, target } = req.body as Record<string, string>;
  if (!judul?.trim() || !isi?.trim()) {
    res.status(400).json({ error: "Judul dan isi wajib diisi." }); return;
  }
  const [a] = await db.insert(announcementsTable)
    .values({ judul, isi, target: target ?? "all", created_by_id: req.admin.id })
    .returning();
  await logAdmin(req.admin.id, req.admin.nama, "SEND_PENGUMUMAN", `Pengumuman "${judul}" dikirim ke ${target ?? "all"}`);
  res.json(a);
}));

router.delete("/admin/pengumuman/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  await db.delete(announcementsTable).where(eq(announcementsTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_PENGUMUMAN", `Pengumuman #${id} dihapus`);
  res.json({ ok: true });
}));

// ===================== PETA LOKASI LIVE =====================
router.get("/admin/lokasi", adminGuard(async (_req: any, res: any) => {
  const activeSchedules = await db.select({
    s: schedulesTable,
    driver: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(schedulesTable)
    .leftJoin(usersTable, eq(schedulesTable.driver_id, usersTable.id))
    .where(eq(schedulesTable.trip_progress, "dalam_perjalanan"));

  if (!activeSchedules.length) { res.json([]); return; }

  const scheduleIds = activeSchedules.map(r => r.s.id);

  const bookingRows = await db.select({
    b: {
      id: scheduleBookingsTable.id,
      schedule_id: scheduleBookingsTable.schedule_id,
      pickup_lat: scheduleBookingsTable.pickup_lat,
      pickup_lng: scheduleBookingsTable.pickup_lng,
      pickup_label: scheduleBookingsTable.pickup_label,
      dropoff_lat: scheduleBookingsTable.dropoff_lat,
      dropoff_lng: scheduleBookingsTable.dropoff_lng,
      dropoff_label: scheduleBookingsTable.dropoff_label,
      kursi: scheduleBookingsTable.kursi,
      status: scheduleBookingsTable.status,
    },
    penumpang: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.penumpang_id, usersTable.id))
    .where(
      and(
        drizzleSql`${scheduleBookingsTable.schedule_id} = ANY(${scheduleIds})`,
        or(
          eq(scheduleBookingsTable.status, "confirmed"),
          eq(scheduleBookingsTable.status, "paid"),
        ),
      ),
    );

  const bookingsBySchedule: Record<number, typeof bookingRows> = {};
  for (const row of bookingRows) {
    const sid = row.b.schedule_id;
    if (!bookingsBySchedule[sid]) bookingsBySchedule[sid] = [];
    bookingsBySchedule[sid].push(row);
  }

  const result = activeSchedules.map(r => ({
    id: r.s.id,
    driver: r.driver,
    driver_lat: r.s.driver_lat,
    driver_lng: r.s.driver_lng,
    driver_location_updated_at: r.s.driver_location_updated_at,
    origin_city: r.s.origin_city,
    destination_city: r.s.destination_city,
    departure_date: r.s.departure_date,
    departure_time: r.s.departure_time,
    trip_progress: r.s.trip_progress,
    penumpang: (bookingsBySchedule[r.s.id] ?? []).map(row => ({
      booking_id: row.b.id,
      nama: row.penumpang?.nama ?? "Penumpang",
      kursi: row.b.kursi,
      status: row.b.status,
      pickup_lat: row.b.pickup_lat,
      pickup_lng: row.b.pickup_lng,
      pickup_label: row.b.pickup_label,
      dropoff_lat: row.b.dropoff_lat,
      dropoff_lng: row.b.dropoff_lng,
      dropoff_label: row.b.dropoff_label,
    })),
  }));

  res.json(result);
}));

// ===================== LOG AKTIVITAS =====================
router.get("/admin/logs", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select().from(adminLogsTable).orderBy(desc(adminLogsTable.created_at)).limit(200);
  res.json(rows);
}));

// ===================== RESET DATA DEMO =====================
router.post("/admin/reset-demo-data", adminGuard(async (_req: any, res: any) => {
  // Hapus semua data transaksional, pertahankan: users, kendaraan, carter_settings, kota_list, route_prices
  await db.delete(chatThreadsTable);          // cascades chat_messages
  await db.delete(schedulesTable);            // cascades schedule_bookings, ratings
  await db.delete(carterBookingsTable);
  await db.delete(rentalBookingsTable);
  await db.delete(announcementsTable);
  await db.delete(adminLogsTable);
  await db.delete(sessionsTable);
  await db.delete(pushSubscriptionsTable);
  res.json({ ok: true, message: "Semua data riwayat, chat, dan sesi berhasil direset." });
}));

// ===================== CLEAR ORDERS & CHAT =====================
router.post("/admin/clear-orders-chat", adminGuard(async (_req: any, res: any) => {
  // Hapus: ratings, chat, bookings, schedules, rental
  // Pertahankan: users, kendaraan, carter_settings, sessions, kota_list, route_prices
  await db.execute(drizzleSql`DELETE FROM ratings`);
  await db.execute(drizzleSql`DELETE FROM chat_messages`);
  await db.execute(drizzleSql`DELETE FROM chat_threads`);
  await db.execute(drizzleSql`DELETE FROM rental_bookings`);
  await db.execute(drizzleSql`DELETE FROM carter_bookings`);
  await db.execute(drizzleSql`DELETE FROM schedule_bookings`);
  await db.execute(drizzleSql`DELETE FROM schedules`);
  res.json({ ok: true, message: "Semua order, jadwal, dan chat berhasil dihapus." });
}));

export default router;
