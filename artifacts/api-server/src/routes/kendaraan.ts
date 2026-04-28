import { Router, type IRouter } from "express";
import { eq, and, ne } from "drizzle-orm";
import {
  db,
  sessionsTable,
  usersTable,
  kendaraanTable,
} from "@workspace/db";
import { KendaraanBody } from "@workspace/api-zod";

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

// Photos must come from our own object storage (presigned upload).
// Accept either: empty (legacy backfill), or a path under /objects/uploads/<uuid>.
const FOTO_PATH_REGEX = /^\/objects\/uploads\/[A-Za-z0-9_-]+$/;
function isValidFotoUrl(s: string): boolean {
  if (!s) return true;
  return FOTO_PATH_REGEX.test(s);
}

router.get("/kendaraan/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang punya kendaraan." });
    return;
  }

  const list = await db
    .select()
    .from(kendaraanTable)
    .where(eq(kendaraanTable.driver_id, user.id));

  list.sort((a, b) => {
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return a.id - b.id;
  });

  res.json(list);
});

router.get("/kendaraan/:id", async (req, res): Promise<void> => {
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

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, id));
  if (!k) {
    res.status(404).json({ error: "Kendaraan tidak ditemukan." });
    return;
  }
  if (k.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan kendaraan Anda." });
    return;
  }
  res.json(k);
});

router.post("/kendaraan", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "driver") {
    res.status(403).json({ error: "Hanya Mitra Driver yang bisa menambah kendaraan." });
    return;
  }

  const parsed = KendaraanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (!isValidFotoUrl(data.foto_url)) {
    res.status(400).json({ error: "Foto kendaraan tidak valid. Harus diunggah lewat aplikasi." });
    return;
  }
  const existing = await db
    .select()
    .from(kendaraanTable)
    .where(eq(kendaraanTable.driver_id, user.id));

  const isDefault = existing.length === 0 || data.is_default === true;

  const created = await db.transaction(async (tx) => {
    if (isDefault) {
      await tx
        .update(kendaraanTable)
        .set({ is_default: false })
        .where(eq(kendaraanTable.driver_id, user.id));
    }
    const [row] = await tx
      .insert(kendaraanTable)
      .values({
        driver_id: user.id,
        jenis: data.jenis,
        merek: data.merek,
        model: data.model,
        plat_nomor: data.plat_nomor,
        warna: data.warna,
        tahun: data.tahun,
        foto_url: data.foto_url,
        is_default: isDefault,
      })
      .returning();
    return row;
  });

  req.log.info({ kendaraanId: created.id, driverId: user.id }, "Kendaraan created");
  res.status(201).json(created);
});

router.put("/kendaraan/:id", async (req, res): Promise<void> => {
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

  const [existing] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Kendaraan tidak ditemukan." });
    return;
  }
  if (existing.driver_id !== user.id) {
    res.status(403).json({ error: "Bukan kendaraan Anda." });
    return;
  }

  const parsed = KendaraanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  if (!isValidFotoUrl(data.foto_url)) {
    res.status(400).json({ error: "Foto kendaraan tidak valid. Harus diunggah lewat aplikasi." });
    return;
  }
  const wantsDefault = data.is_default === true || existing.is_default;

  const updated = await db.transaction(async (tx) => {
    if (wantsDefault) {
      await tx
        .update(kendaraanTable)
        .set({ is_default: false })
        .where(and(eq(kendaraanTable.driver_id, user.id), ne(kendaraanTable.id, id)));
    }
    const [row] = await tx
      .update(kendaraanTable)
      .set({
        jenis: data.jenis,
        merek: data.merek,
        model: data.model,
        plat_nomor: data.plat_nomor,
        warna: data.warna,
        tahun: data.tahun,
        foto_url: data.foto_url,
        is_default: wantsDefault,
        updated_at: new Date(),
      })
      .where(eq(kendaraanTable.id, id))
      .returning();
    return row;
  });

  res.json(updated);
});

router.post("/kendaraan/:id/set-default", async (req, res): Promise<void> => {
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

  const [existing] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, id));
  if (!existing || existing.driver_id !== user.id) {
    res.status(404).json({ error: "Kendaraan tidak ditemukan." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(kendaraanTable)
      .set({ is_default: false })
      .where(eq(kendaraanTable.driver_id, user.id));
    await tx.update(kendaraanTable).set({ is_default: true }).where(eq(kendaraanTable.id, id));
  });

  res.json({ ok: true });
});

router.delete("/kendaraan/:id", async (req, res): Promise<void> => {
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

  const [existing] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, id));
  if (!existing || existing.driver_id !== user.id) {
    res.status(404).json({ error: "Kendaraan tidak ditemukan." });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(kendaraanTable).where(eq(kendaraanTable.id, id));
    if (existing.is_default) {
      const remaining = await tx
        .select()
        .from(kendaraanTable)
        .where(eq(kendaraanTable.driver_id, user.id));
      if (remaining.length > 0) {
        await tx
          .update(kendaraanTable)
          .set({ is_default: true })
          .where(eq(kendaraanTable.id, remaining[0].id));
      }
    }
  });

  res.json({ ok: true });
});

export default router;
