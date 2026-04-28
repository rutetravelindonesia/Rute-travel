import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db, usersTable, sessionsTable } from "@workspace/db";
import { LoginBody, RegisterBody } from "@workspace/api-zod";

const router: IRouter = Router();

const SALT_ROUNDS = 10;
const SESSION_DAYS = 30;

function generateToken(): string {
  return crypto.randomBytes(48).toString("hex");
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
    plat_nomor: user.plat_nomor,
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

  const { nama, no_whatsapp, password, role, nik, kota, jenis_kendaraan, plat_nomor } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.no_whatsapp, no_whatsapp));
  if (existing) {
    res.status(400).json({ error: "Nomor WhatsApp sudah terdaftar. Silakan login." });
    return;
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  const [user] = await db.insert(usersTable).values({
    nama,
    no_whatsapp,
    password_hash,
    role,
    nik: nik ?? null,
    kota: kota ?? null,
    jenis_kendaraan: jenis_kendaraan ?? null,
    plat_nomor: plat_nomor ?? null,
  }).returning();

  const token = generateToken();
  await db.insert(sessionsTable).values({
    user_id: user.id,
    token,
    expires_at: sessionExpiresAt(),
  });

  req.log.info({ userId: user.id, role: user.role }, "User registered");
  res.status(201).json({ token, user: safeUser(user) });
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
