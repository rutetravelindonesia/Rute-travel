import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, pool, usersTable, sessionsTable } from "@workspace/db";
import { LoginBody, RegisterBody } from "@workspace/api-zod";
import { sendWhatsAppOTP } from "../lib/fonnte";

const router: IRouter = Router();

const SALT_ROUNDS = 10;
const SESSION_DAYS = 30;
const OTP_MINUTES = 5;

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sessionExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + SESSION_DAYS);
  return d;
}

function safeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    nama: user.nama,
    no_whatsapp: user.no_whatsapp,
    role: user.role,
    nik: user.nik,
    kota: user.kota,
    jenis_kendaraan: user.jenis_kendaraan,
    model_kendaraan: user.model_kendaraan,
    plat_nomor: user.plat_nomor,
    foto_diri: user.foto_diri,
    foto_stnk: user.foto_stnk,
    is_verified: user.is_verified,
    created_at: user.created_at,
  };
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

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { no_whatsapp, password, role } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.no_whatsapp, no_whatsapp));

  if (!user) {
    res.status(401).json({ error: "Nomor WhatsApp atau password salah." });
    return;
  }

  if (user.role !== role) {
    res.status(401).json({ error: `Akun ini terdaftar sebagai ${user.role === "driver" ? "Mitra Driver" : "Penumpang"}, bukan ${role === "driver" ? "Mitra Driver" : "Penumpang"}.` });
    return;
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: "Nomor WhatsApp atau password salah." });
    return;
  }

  if (!user.is_verified && user.role === "penumpang") {
    res.status(403).json({ error: "Akun belum diverifikasi. Silakan cek WhatsApp Anda untuk kode OTP.", needs_otp: true, user_id: user.id });
    return;
  }

  const token = generateToken();
  await db.insert(sessionsTable).values({
    user_id: user.id,
    token,
    expires_at: sessionExpiresAt(),
  });

  req.log.info({ userId: user.id, role: user.role }, "User logged in");
  res.json({ token, user: safeUser(user) });
});

router.post("/auth/admin-login", async (req, res): Promise<void> => {
  const { no_whatsapp, password } = req.body as { no_whatsapp?: string; password?: string };
  if (!no_whatsapp || !password) {
    res.status(400).json({ error: "no_whatsapp dan password wajib diisi." }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.no_whatsapp, no_whatsapp));
  if (!user || user.role !== "admin") {
    res.status(401).json({ error: "Akun admin tidak ditemukan." }); return;
  }
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    res.status(401).json({ error: "Password salah." }); return;
  }
  const token = generateToken();
  await db.insert(sessionsTable).values({ user_id: user.id, token, expires_at: sessionExpiresAt() });
  req.log.info({ userId: user.id }, "Admin logged in");
  res.json({ token, user: safeUser(user) });
});

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    nama, no_whatsapp, password, role,
    nik, kota, jenis_kendaraan, model_kendaraan, plat_nomor,
    foto_diri, foto_stnk,
  } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.no_whatsapp, no_whatsapp));
  if (existing) {
    res.status(400).json({ error: "Nomor WhatsApp sudah terdaftar. Silakan login." });
    return;
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const isPenumpang = role === "penumpang";

  const [user] = await db.insert(usersTable).values({
    nama,
    no_whatsapp,
    password_hash,
    role,
    nik: nik ?? null,
    kota: kota ?? null,
    jenis_kendaraan: jenis_kendaraan ?? null,
    model_kendaraan: model_kendaraan ?? null,
    plat_nomor: plat_nomor ?? null,
    foto_diri: foto_diri ?? null,
    foto_stnk: foto_stnk ?? null,
    is_verified: !isPenumpang,
  }).returning();

  req.log.info({ userId: user.id, role: user.role }, "User registered");

  if (isPenumpang) {
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
    await pool.query(
      `INSERT INTO otp_codes (no_whatsapp, code, expires_at) VALUES ($1, $2, $3)`,
      [no_whatsapp, code, expiresAt],
    );
    try {
      await sendWhatsAppOTP(no_whatsapp, code);
    } catch (err) {
      req.log.error({ err }, "Gagal kirim OTP WhatsApp");
    }
    res.status(201).json({ needs_otp: true, user_id: user.id, no_whatsapp });
    return;
  }

  const token = generateToken();
  await db.insert(sessionsTable).values({
    user_id: user.id,
    token,
    expires_at: sessionExpiresAt(),
  });
  res.status(201).json({ token, user: safeUser(user) });
});

router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const { user_id, code } = req.body as { user_id?: number; code?: string };
  if (!user_id || !code) {
    res.status(400).json({ error: "user_id dan code wajib diisi." }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, user_id));
  if (!user) {
    res.status(404).json({ error: "Akun tidak ditemukan." }); return;
  }
  const now = new Date();
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM otp_codes WHERE no_whatsapp=$1 AND code=$2 AND expires_at > $3 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [user.no_whatsapp, code, now],
  );
  if (rows.length === 0) {
    res.status(400).json({ error: "Kode OTP tidak valid atau sudah kadaluarsa." }); return;
  }
  await pool.query(`UPDATE otp_codes SET used_at=$1 WHERE id=$2`, [now, rows[0].id]);
  await db.update(usersTable).set({ is_verified: true }).where(eq(usersTable.id, user_id));
  const token = generateToken();
  await db.insert(sessionsTable).values({ user_id: user.id, token, expires_at: sessionExpiresAt() });
  req.log.info({ userId: user.id }, "OTP verified, user active");
  res.json({ token, user: { ...safeUser(user), is_verified: true } });
});

router.post("/auth/resend-otp", async (req, res): Promise<void> => {
  const { user_id } = req.body as { user_id?: number };
  if (!user_id) {
    res.status(400).json({ error: "user_id wajib diisi." }); return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, user_id));
  if (!user || user.role !== "penumpang") {
    res.status(404).json({ error: "Akun tidak ditemukan." }); return;
  }
  if (user.is_verified) {
    res.status(400).json({ error: "Akun sudah terverifikasi." }); return;
  }
  // Hapus OTP lama yang belum terpakai
  await pool.query(`UPDATE otp_codes SET used_at=NOW() WHERE no_whatsapp=$1 AND used_at IS NULL`, [user.no_whatsapp]);
  const code = generateOTP();
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  await pool.query(
    `INSERT INTO otp_codes (no_whatsapp, code, expires_at) VALUES ($1, $2, $3)`,
    [user.no_whatsapp, code, expiresAt],
  );
  try {
    await sendWhatsAppOTP(user.no_whatsapp, code);
  } catch (err) {
    req.log.error({ err }, "Gagal kirim ulang OTP");
    res.status(500).json({ error: "Gagal mengirim OTP. Coba lagi." }); return;
  }
  res.json({ ok: true });
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  res.json(safeUser(user));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
  }
  res.sendStatus(204);
});

export default router;
