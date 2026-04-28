import { Router, type IRouter } from "express";
import { eq, desc, count, sum, and, gte, lte, ilike, or } from "drizzle-orm";
import {
  db,
  usersTable,
  sessionsTable,
  schedulesTable,
  scheduleBookingsTable,
  carterBookingsTable,
  kendaraanTable,
  ratingsTable,
  kotaListTable,
  announcementsTable,
  routePricesTable,
  adminLogsTable,
  chatThreadsTable,
  tebenganPulangTable,
  pushSubscriptionsTable,
} from "@workspace/db";

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
  return (async (req: any, res: any): Promise<void> => {
    const admin = await getAdminFromToken(req.headers.authorization);
    if (!admin) { res.status(401).json({ error: "Akses ditolak. Hanya admin." }); return; }
    (req as any).admin = admin;
    return (handler as any)(req, res);
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
  const [bookingHariIni] = await db.select({ c: count() }).from(scheduleBookingsTable)
    .where(and(gte(scheduleBookingsTable.created_at, today), lte(scheduleBookingsTable.created_at, tomorrow)));
  const [pendapatanTotal] = await db.select({ s: sum(scheduleBookingsTable.total_amount) })
    .from(scheduleBookingsTable).where(eq(scheduleBookingsTable.status, "paid"));
  const [pendapatanCarter] = await db.select({ s: sum(carterBookingsTable.total_amount) })
    .from(carterBookingsTable).where(eq(carterBookingsTable.status, "paid"));
  const [tripAktif] = await db.select({ c: count() }).from(schedulesTable)
    .where(eq(schedulesTable.trip_progress, "dalam_perjalanan"));
  const [pembayaranPending] = await db.select({ c: count() }).from(scheduleBookingsTable)
    .where(eq(scheduleBookingsTable.status, "paid"));

  res.json({
    total_users: totalUsers.c,
    total_drivers: totalDrivers.c,
    total_penumpang: totalPenumpang.c,
    total_bookings: Number(totalBookings.c) + Number(totalCarter.c),
    booking_hari_ini: bookingHariIni.c,
    pendapatan_total: Number(pendapatanTotal.s ?? 0) + Number(pendapatanCarter.s ?? 0),
    trip_aktif: tripAktif.c,
    pembayaran_pending: pembayaranPending.c,
  });
}));

// ===================== USERS =====================
router.get("/admin/users", adminGuard(async (req: any, res: any) => {
  const { q, role } = req.query as Record<string, string>;
  let query = db.select().from(usersTable).$dynamic();
  const conds: any[] = [];
  if (role) conds.push(eq(usersTable.role, role));
  if (q) conds.push(or(ilike(usersTable.nama, `%${q}%`), ilike(usersTable.no_whatsapp, `%${q}%`)));
  if (conds.length) query = query.where(and(...conds));
  const users = await query.orderBy(desc(usersTable.created_at)).limit(100);
  res.json(users.map(u => ({
    id: u.id, nama: u.nama, no_whatsapp: u.no_whatsapp,
    role: u.role, kota: u.kota, nik: u.nik,
    foto_profil: u.foto_profil, created_at: u.created_at,
  })));
}));

router.patch("/admin/users/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const { role, nama, kota } = req.body as Record<string, string>;
  const updates: Record<string, any> = {};
  if (role) updates.role = role;
  if (nama) updates.nama = nama;
  if (kota !== undefined) updates.kota = kota;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "Tidak ada perubahan." }); return; }
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
router.get("/admin/schedules", adminGuard(async (req: any, res: any) => {
  const rows = await db
    .select({ s: schedulesTable, driver: { id: usersTable.id, nama: usersTable.nama } })
    .from(schedulesTable)
    .leftJoin(usersTable, eq(schedulesTable.driver_id, usersTable.id))
    .orderBy(desc(schedulesTable.created_at)).limit(200);
  res.json(rows.map(r => ({ ...r.s, driver: r.driver })));
}));

router.delete("/admin/schedules/:id", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  await db.delete(schedulesTable).where(eq(schedulesTable.id, id));
  await logAdmin(req.admin.id, req.admin.nama, "DELETE_SCHEDULE", `Jadwal #${id} dihapus`);
  res.json({ ok: true });
}));

// ===================== BOOKINGS REGULER =====================
router.get("/admin/bookings", adminGuard(async (req: any, res: any) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select({
    b: scheduleBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
    schedule: { id: schedulesTable.id, origin_city: schedulesTable.origin_city, destination_city: schedulesTable.destination_city, departure_date: schedulesTable.departure_date },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.user_id, usersTable.id))
    .leftJoin(schedulesTable, eq(scheduleBookingsTable.schedule_id, schedulesTable.id))
    .$dynamic();
  if (status) q = q.where(eq(scheduleBookingsTable.status, status));
  const rows = await q.orderBy(desc(scheduleBookingsTable.created_at)).limit(200);
  res.json(rows.map(r => ({ ...r.b, user: r.user, schedule: r.schedule })));
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

// ===================== CARTER BOOKINGS =====================
router.get("/admin/carter-bookings", adminGuard(async (req: any, res: any) => {
  const { status } = req.query as Record<string, string>;
  let q = db.select({
    b: carterBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(carterBookingsTable)
    .leftJoin(usersTable, eq(carterBookingsTable.user_id, usersTable.id))
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

// ===================== VERIFIKASI PEMBAYARAN =====================
router.get("/admin/payments", adminGuard(async (_req: any, res: any) => {
  const schedule = await db.select({
    b: scheduleBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(scheduleBookingsTable)
    .leftJoin(usersTable, eq(scheduleBookingsTable.user_id, usersTable.id))
    .where(eq(scheduleBookingsTable.status, "paid"))
    .orderBy(desc(scheduleBookingsTable.created_at)).limit(100);

  const carter = await db.select({
    b: carterBookingsTable,
    user: { id: usersTable.id, nama: usersTable.nama },
  })
    .from(carterBookingsTable)
    .leftJoin(usersTable, eq(carterBookingsTable.user_id, usersTable.id))
    .where(eq(carterBookingsTable.status, "paid"))
    .orderBy(desc(carterBookingsTable.created_at)).limit(100);

  res.json({
    schedule: schedule.map(r => ({ ...r.b, user: r.user, jenis: "reguler" })),
    carter: carter.map(r => ({ ...r.b, user: r.user, jenis: "carter" })),
  });
}));

router.patch("/admin/payments/booking/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(scheduleBookingsTable)
    .set({ status: "confirmed" })
    .where(eq(scheduleBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_PAYMENT", `Booking #${id} pembayaran dikonfirmasi`);
  res.json(b);
}));

router.patch("/admin/payments/booking/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(scheduleBookingsTable)
    .set({ status: "pending", payment_proof_url: null })
    .where(eq(scheduleBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_PAYMENT", `Booking #${id} pembayaran ditolak`);
  res.json(b);
}));

router.patch("/admin/payments/carter/:id/confirm", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "confirmed" })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "CONFIRM_CARTER_PAYMENT", `Carter #${id} pembayaran dikonfirmasi`);
  res.json(b);
}));

router.patch("/admin/payments/carter/:id/reject", adminGuard(async (req: any, res: any) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.update(carterBookingsTable)
    .set({ status: "pending", payment_proof_url: null })
    .where(eq(carterBookingsTable.id, id)).returning();
  await logAdmin(req.admin.id, req.admin.nama, "REJECT_CARTER_PAYMENT", `Carter #${id} pembayaran ditolak`);
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
    .leftJoin(usersTable, eq(scheduleBookingsTable.user_id, usersTable.id))
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
    .leftJoin(usersTable, eq(carterBookingsTable.user_id, usersTable.id))
    .where(and(
      gte(carterBookingsTable.created_at, start),
      lte(carterBookingsTable.created_at, end),
      or(eq(carterBookingsTable.status, "paid"), eq(carterBookingsTable.status, "confirmed")),
    ))
    .orderBy(desc(carterBookingsTable.created_at));

  const totalReguler = bookings.reduce((s, r) => s + Number(r.b.total_amount), 0);
  const totalCarter = carterB.reduce((s, r) => s + Number(r.b.total_amount), 0);

  res.json({
    periode: { dari: start, sampai: end },
    total_reguler: totalReguler,
    total_carter: totalCarter,
    total: totalReguler + totalCarter,
    bookings: bookings.map(r => ({ ...r.b, user: r.user, schedule: r.schedule, jenis: "reguler" })),
    carter: carterB.map(r => ({ ...r.b, user: r.user, jenis: "carter" })),
  });
}));

// ===================== KOTA/RUTE =====================
router.get("/admin/kota", adminGuard(async (_req: any, res: any) => {
  const rows = await db.select().from(kotaListTable).orderBy(kotaListTable.nama_kota);
  res.json(rows);
}));

router.post("/admin/kota", adminGuard(async (req: any, res: any) => {
  const { nama_kota } = req.body as { nama_kota?: string };
  if (!nama_kota?.trim()) { res.status(400).json({ error: "Nama kota wajib diisi." }); return; }
  const [k] = await db.insert(kotaListTable).values({ nama_kota: nama_kota.trim() }).returning();
  await logAdmin(req.admin.id, req.admin.nama, "ADD_KOTA", `Kota "${nama_kota}" ditambahkan`);
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
  await db.delete(tebenganPulangTable);       // cascades tebengan_bookings
  await db.delete(announcementsTable);
  await db.delete(adminLogsTable);
  await db.delete(sessionsTable);
  await db.delete(pushSubscriptionsTable);
  res.json({ ok: true, message: "Semua data riwayat, chat, dan sesi berhasil direset." });
}));

export default router;
