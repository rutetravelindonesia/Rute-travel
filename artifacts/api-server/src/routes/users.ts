import { Router, type IRouter } from "express";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import {
  db,
  sessionsTable,
  usersTable,
  schedulesTable,
  scheduleBookingsTable,
  ratingsTable,
} from "@workspace/db";
function isValidFotoUrl(s: string): boolean {
  if (!s) return true;
  return s.startsWith("https://res.cloudinary.com/") || s.startsWith("/objects/uploads/");
}

const router: IRouter = Router();
const SALT_ROUNDS = 12;

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

const EditProfilBody = z.object({
  nama: z.string().min(2).max(100),
  no_whatsapp: z
    .string()
    .min(9)
    .max(15)
    .regex(/^08\d+$/, "Nomor harus diawali 08"),
});

const ChangePasswordBody = z.object({
  password_lama: z.string().min(1),
  password_baru: z.string().min(6, "Password baru minimal 6 karakter"),
  konfirmasi: z.string().min(1),
});

router.get("/users/me", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  res.json({
    id: user.id,
    nama: user.nama,
    no_whatsapp: user.no_whatsapp,
    role: user.role,
    nik: user.nik,
    kota: user.kota,
    jenis_kendaraan: user.jenis_kendaraan,
    plat_nomor: user.plat_nomor,
    foto_profil: user.foto_profil ?? null,
    nama_bank: user.nama_bank ?? null,
    no_rekening: user.no_rekening ?? null,
    nama_pemilik_rekening: user.nama_pemilik_rekening ?? null,
    created_at: user.created_at,
  });
});

router.patch("/users/me", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = EditProfilBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid." });
    return;
  }
  const { nama, no_whatsapp } = parsed.data;
  if (no_whatsapp !== user.no_whatsapp) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.no_whatsapp, no_whatsapp));
    if (existing) {
      res.status(409).json({ error: "Nomor WhatsApp sudah digunakan akun lain." });
      return;
    }
  }
  const [updated] = await db
    .update(usersTable)
    .set({ nama, no_whatsapp })
    .where(eq(usersTable.id, user.id))
    .returning({
      id: usersTable.id,
      nama: usersTable.nama,
      no_whatsapp: usersTable.no_whatsapp,
      role: usersTable.role,
      kota: usersTable.kota,
      nik: usersTable.nik,
      jenis_kendaraan: usersTable.jenis_kendaraan,
      plat_nomor: usersTable.plat_nomor,
      foto_profil: usersTable.foto_profil,
      created_at: usersTable.created_at,
    });
  res.json(updated);
});

router.patch("/users/me/rekening", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const { nama_bank, no_rekening, nama_pemilik_rekening } = req.body as Record<string, string>;
  if (!nama_bank?.trim() || !no_rekening?.trim() || !nama_pemilik_rekening?.trim()) {
    res.status(400).json({ error: "Nama bank, nomor rekening, dan nama pemilik rekening wajib diisi." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({
      nama_bank: nama_bank.trim(),
      no_rekening: no_rekening.trim(),
      nama_pemilik_rekening: nama_pemilik_rekening.trim(),
    })
    .where(eq(usersTable.id, user.id))
    .returning({
      nama_bank: usersTable.nama_bank,
      no_rekening: usersTable.no_rekening,
      nama_pemilik_rekening: usersTable.nama_pemilik_rekening,
    });
  res.json(updated);
});

router.post("/users/me/foto-profil", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const { foto_profil } = req.body as { foto_profil?: string };
  if (!foto_profil || !isValidFotoUrl(foto_profil)) {
    res.status(400).json({ error: "Foto profil tidak valid. Harus diunggah lewat aplikasi." });
    return;
  }
  const [updated] = await db
    .update(usersTable)
    .set({ foto_profil })
    .where(eq(usersTable.id, user.id))
    .returning({ foto_profil: usersTable.foto_profil });
  res.json(updated);
});


router.post("/users/me/change-password", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Data tidak valid." });
    return;
  }
  const { password_lama, password_baru, konfirmasi } = parsed.data;
  if (password_baru !== konfirmasi) {
    res.status(400).json({ error: "Konfirmasi password tidak cocok." });
    return;
  }
  const match = await bcrypt.compare(password_lama, user.password_hash);
  if (!match) {
    res.status(400).json({ error: "Password lama tidak benar." });
    return;
  }
  const password_hash = await bcrypt.hash(password_baru, SALT_ROUNDS);
  await db.update(usersTable).set({ password_hash }).where(eq(usersTable.id, user.id));
  res.json({ ok: true });
});

router.get("/users/me/income-summary", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya mitra driver." });
    return;
  }

  const myScheduleIds = (
    await db
      .select({ id: schedulesTable.id })
      .from(schedulesTable)
      .where(eq(schedulesTable.driver_id, user.id))
  ).map((r) => r.id);

  if (myScheduleIds.length === 0) {
    res.json({ bulan_ini: 0, total: 0, trip_selesai: 0, total_penumpang: 0 });
    return;
  }

  const witaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const firstOfMonth = new Date(
    Date.UTC(witaNow.getUTCFullYear(), witaNow.getUTCMonth(), 1) - 8 * 60 * 60 * 1000,
  );

  const [totalRow] = await db
    .select({
      income: sql<number>`COALESCE(SUM(${scheduleBookingsTable.total_amount}), 0)::bigint`,
      penumpang: sql<number>`COUNT(*)::int`,
    })
    .from(scheduleBookingsTable)
    .where(
      and(
        inArray(scheduleBookingsTable.schedule_id, myScheduleIds),
        inArray(scheduleBookingsTable.status, ["paid", "aktif", "selesai"]),
      ),
    );

  const [bulanRow] = await db
    .select({
      income: sql<number>`COALESCE(SUM(${scheduleBookingsTable.total_amount}), 0)::bigint`,
    })
    .from(scheduleBookingsTable)
    .where(
      and(
        inArray(scheduleBookingsTable.schedule_id, myScheduleIds),
        inArray(scheduleBookingsTable.status, ["paid", "aktif", "selesai"]),
        gte(scheduleBookingsTable.created_at, firstOfMonth),
      ),
    );

  const [tripRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(schedulesTable)
    .where(
      and(
        eq(schedulesTable.driver_id, user.id),
        eq(schedulesTable.trip_progress, "selesai"),
      ),
    );

  res.json({
    bulan_ini: Number(bulanRow?.income ?? 0),
    total: Number(totalRow?.income ?? 0),
    trip_selesai: tripRow?.count ?? 0,
    total_penumpang: totalRow?.penumpang ?? 0,
  });
});

router.get("/users/me/ratings-received", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya mitra driver." });
    return;
  }
  const rows = await db
    .select({
      id: ratingsTable.id,
      stars: ratingsTable.stars,
      comment: ratingsTable.comment,
      created_at: ratingsTable.created_at,
      rater_nama: usersTable.nama,
    })
    .from(ratingsTable)
    .leftJoin(usersTable, eq(usersTable.id, ratingsTable.rater_id))
    .where(eq(ratingsTable.ratee_id, user.id))
    .orderBy(sql`${ratingsTable.created_at} DESC`)
    .limit(50);

  res.json(rows.map((r) => ({ ...r, rater_nama: r.rater_nama ?? "Penumpang" })));
});

export default router;
