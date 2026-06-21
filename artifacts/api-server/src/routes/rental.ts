// rental kendaraan routes
import { Router, type IRouter } from "express";
import { createNotification } from "../lib/notifications";
import { eq, and, sql, inArray, lte, gte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  pool,
  sessionsTable,
  usersTable,
  rentalKendaraanTable,
  rentalBookingsTable,
  kendaraanTable,
} from "@workspace/db";

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

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hitungHari(mulai: string, selesai: string): number {
  const a = new Date(`${mulai}T00:00:00+08:00`).getTime();
  const b = new Date(`${selesai}T00:00:00+08:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.round((b - a) / 86400000) + 1;
  return diff;
}

const OfferBody = z.object({
  kendaraan_id: z.number().int().positive(),
  kota: z.string().min(2).max(100),
  mode: z.enum(["lepas_kunci", "dengan_sopir", "dua-duanya"]),
  harga_lepas_kunci: z.number().int().min(0).max(100_000_000).optional().nullable(),
  harga_dengan_sopir: z.number().int().min(0).max(100_000_000).optional().nullable(),
  deposit: z.number().int().min(0).max(100_000_000).optional().nullable(),
  catatan: z.string().max(500).optional().nullable(),
  syarat: z.string().max(2000).optional().nullable(),
  tersedia_mulai: z.string().regex(DATE_RE).optional().nullable(),
  tersedia_sampai: z.string().regex(DATE_RE).optional().nullable(),
  alamat_kantor: z.string().max(200).optional().nullable(),
  kantor_detail: z.string().max(500).optional().nullable(),
  kantor_lat: z.number().min(-90).max(90).optional().nullable(),
  kantor_lng: z.number().min(-180).max(180).optional().nullable(),
  tersedia_24jam: z.boolean().optional(),
  jam_buka: z.string().regex(TIME_RE).optional().nullable(),
  jam_tutup: z.string().regex(TIME_RE).optional().nullable(),
});

const AddressBody = z.object({
  label: z.string().min(2).max(200),
  detail: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});

const BookBody = z.object({
  mode: z.enum(["lepas_kunci", "dengan_sopir"]),
  tanggal_mulai: z.string().regex(DATE_RE),
  tanggal_selesai: z.string().regex(DATE_RE),
  jam_mulai: z.string().regex(TIME_RE),
  jam_selesai: z.string().regex(TIME_RE),
  ambil_di_kantor: z.boolean().optional(),
  pickup: AddressBody.optional().nullable(),
  dropoff: AddressBody.optional().nullable(),
  catatan: z.string().max(500).optional().nullable(),
  payment_method: z.enum(["qris", "transfer", "ewallet"]),
});

const PaymentProofBody = z.object({
  url: z.string().min(3).max(1000),
});

function validateOfferPricing(
  mode: string,
  harga_lepas_kunci: number | null | undefined,
  harga_dengan_sopir: number | null | undefined,
): string | null {
  const wantLepas = mode === "lepas_kunci" || mode === "dua-duanya";
  const wantSopir = mode === "dengan_sopir" || mode === "dua-duanya";
  if (wantLepas && (harga_lepas_kunci == null || harga_lepas_kunci <= 0)) {
    return "Harga sewa lepas kunci per hari wajib diisi.";
  }
  if (wantSopir && (harga_dengan_sopir == null || harga_dengan_sopir <= 0)) {
    return "Harga sewa dengan sopir per hari wajib diisi.";
  }
  return null;
}

// Validasi jam ketersediaan. Bila bukan 24 jam, jam buka & tutup wajib dan tutup harus setelah buka.
function validateOfferJam(
  is24: boolean,
  jam_buka: string | null | undefined,
  jam_tutup: string | null | undefined,
): string | null {
  if (is24) return null;
  if (!jam_buka || !jam_tutup) return "Jam buka dan jam tutup wajib diisi jika unit tidak tersedia 24 jam.";
  if (jam_tutup <= jam_buka) return "Jam tutup harus setelah jam buka.";
  return null;
}

// ===== MITRA: buat penawaran rental =====
router.post("/rental/offer", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver yang bisa membuka rental." }); return; }

  const parsed = OfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { kendaraan_id, kota, mode, harga_lepas_kunci, harga_dengan_sopir, deposit, catatan, syarat, tersedia_mulai, tersedia_sampai, alamat_kantor, kantor_detail, kantor_lat, kantor_lng, tersedia_24jam, jam_buka, jam_tutup } = parsed.data;

  const pricingErr = validateOfferPricing(mode, harga_lepas_kunci, harga_dengan_sopir);
  if (pricingErr) { res.status(400).json({ error: pricingErr }); return; }

  if (tersedia_mulai && tersedia_sampai && tersedia_sampai < tersedia_mulai) {
    res.status(400).json({ error: "Tanggal 'Tersedia sampai' harus sama dengan atau setelah 'Tersedia mulai'." }); return;
  }

  const is24 = tersedia_24jam !== false;
  const jamErr = validateOfferJam(is24, jam_buka, jam_tutup);
  if (jamErr) { res.status(400).json({ error: jamErr }); return; }

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, kendaraan_id));
  if (!k || k.driver_id !== user.id) { res.status(400).json({ error: "Kendaraan tidak valid atau bukan milik Anda." }); return; }

  const [existing] = await db
    .select({ id: rentalKendaraanTable.id })
    .from(rentalKendaraanTable)
    .where(and(eq(rentalKendaraanTable.driver_id, user.id), eq(rentalKendaraanTable.kendaraan_id, kendaraan_id)));
  if (existing) {
    res.status(400).json({ error: "Kendaraan ini sudah memiliki penawaran rental. Silakan edit penawaran yang ada." });
    return;
  }

  const wantLepas = mode === "lepas_kunci" || mode === "dua-duanya";
  const wantSopir = mode === "dengan_sopir" || mode === "dua-duanya";

  const [created] = await db
    .insert(rentalKendaraanTable)
    .values({
      driver_id: user.id,
      kendaraan_id,
      kota,
      mode,
      harga_lepas_kunci: wantLepas ? harga_lepas_kunci ?? null : null,
      harga_dengan_sopir: wantSopir ? harga_dengan_sopir ?? null : null,
      deposit: wantLepas ? deposit ?? 0 : 0,
      catatan: catatan ?? null,
      syarat: syarat?.trim() || null,
      tersedia_mulai: tersedia_mulai || null,
      tersedia_sampai: tersedia_sampai || null,
      alamat_kantor: alamat_kantor?.trim() || null,
      kantor_detail: kantor_detail ?? null,
      kantor_lat: kantor_lat ?? null,
      kantor_lng: kantor_lng ?? null,
      tersedia_24jam: is24,
      jam_buka: is24 ? null : jam_buka ?? null,
      jam_tutup: is24 ? null : jam_tutup ?? null,
      is_active: true,
    })
    .returning();

  req.log.info({ offerId: created.id, driverId: user.id }, "Rental offer created");
  res.status(201).json(created);
});

// ===== MITRA: update penawaran rental =====
router.put("/rental/offer/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID penawaran tidak valid." }); return; }

  const parsed = OfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { kendaraan_id, kota, mode, harga_lepas_kunci, harga_dengan_sopir, deposit, catatan, syarat, tersedia_mulai, tersedia_sampai, alamat_kantor, kantor_detail, kantor_lat, kantor_lng, tersedia_24jam, jam_buka, jam_tutup } = parsed.data;

  const pricingErr = validateOfferPricing(mode, harga_lepas_kunci, harga_dengan_sopir);
  if (pricingErr) { res.status(400).json({ error: pricingErr }); return; }

  if (tersedia_mulai && tersedia_sampai && tersedia_sampai < tersedia_mulai) {
    res.status(400).json({ error: "Tanggal 'Tersedia sampai' harus sama dengan atau setelah 'Tersedia mulai'." }); return;
  }

  const is24 = tersedia_24jam !== false;
  const jamErr = validateOfferJam(is24, jam_buka, jam_tutup);
  if (jamErr) { res.status(400).json({ error: jamErr }); return; }

  const [offer] = await db.select().from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, id));
  if (!offer || offer.driver_id !== user.id) { res.status(404).json({ error: "Penawaran tidak ditemukan." }); return; }

  const [k] = await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, kendaraan_id));
  if (!k || k.driver_id !== user.id) { res.status(400).json({ error: "Kendaraan tidak valid atau bukan milik Anda." }); return; }

  const wantLepas = mode === "lepas_kunci" || mode === "dua-duanya";
  const wantSopir = mode === "dengan_sopir" || mode === "dua-duanya";

  await db
    .update(rentalKendaraanTable)
    .set({
      kendaraan_id,
      kota,
      mode,
      harga_lepas_kunci: wantLepas ? harga_lepas_kunci ?? null : null,
      harga_dengan_sopir: wantSopir ? harga_dengan_sopir ?? null : null,
      deposit: wantLepas ? deposit ?? 0 : 0,
      catatan: catatan ?? null,
      syarat: syarat?.trim() || null,
      tersedia_mulai: tersedia_mulai || null,
      tersedia_sampai: tersedia_sampai || null,
      alamat_kantor: alamat_kantor?.trim() || null,
      kantor_detail: kantor_detail ?? null,
      kantor_lat: kantor_lat ?? null,
      kantor_lng: kantor_lng ?? null,
      tersedia_24jam: is24,
      jam_buka: is24 ? null : jam_buka ?? null,
      jam_tutup: is24 ? null : jam_tutup ?? null,
      updated_at: new Date(),
    })
    .where(eq(rentalKendaraanTable.id, id));

  res.json({ ok: true, message: "Penawaran rental berhasil diperbarui." });
});

// ===== MITRA: aktif/nonaktif penawaran =====
router.patch("/rental/offer/:id/toggle", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [offer] = await db.select().from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, id));
  if (!offer || offer.driver_id !== user.id) { res.status(404).json({ error: "Penawaran tidak ditemukan." }); return; }
  await db.update(rentalKendaraanTable).set({ is_active: !offer.is_active, updated_at: new Date() }).where(eq(rentalKendaraanTable.id, id));
  res.json({ ok: true, is_active: !offer.is_active });
});

// ===== MITRA: hapus penawaran =====
router.delete("/rental/offer/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [offer] = await db.select().from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, id));
  if (!offer || offer.driver_id !== user.id) { res.status(404).json({ error: "Penawaran tidak ditemukan." }); return; }

  const [active] = await db
    .select({ id: rentalBookingsTable.id })
    .from(rentalBookingsTable)
    .where(and(eq(rentalBookingsTable.rental_id, id), sql`${rentalBookingsTable.status} IN ('pending','paid','confirmed','aktif')`));
  if (active) {
    res.status(400).json({ error: "Tidak bisa menghapus — masih ada pesanan aktif. Nonaktifkan saja penawaran ini." });
    return;
  }
  await db.delete(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, id));
  res.json({ ok: true, message: "Penawaran rental dihapus." });
});

// ===== MITRA: daftar penawaran sendiri =====
router.get("/rental/offer/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }

  const rows = await db
    .select({ o: rentalKendaraanTable, k: kendaraanTable })
    .from(rentalKendaraanTable)
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .where(eq(rentalKendaraanTable.driver_id, user.id))
    .orderBy(sql`${rentalKendaraanTable.created_at} DESC`);

  res.json(
    rows.map(({ o, k }) => ({
      ...o,
      kendaraan: k
        ? { id: k.id, jenis: k.jenis, merek: k.merek, model: k.model, warna: k.warna, plat_nomor: k.plat_nomor, foto_url: k.foto_url, tahun: k.tahun }
        : null,
    })),
  );
});

// ===== PENYEWA: cari rental =====
const SearchQuery = z.object({
  kota: z.string().min(2).max(100),
  mode: z.enum(["lepas_kunci", "dengan_sopir"]).optional(),
  tanggal_mulai: z.string().regex(DATE_RE).optional(),
  tanggal_selesai: z.string().regex(DATE_RE).optional(),
  jam_mulai: z.string().regex(TIME_RE).optional(),
  jam_selesai: z.string().regex(TIME_RE).optional(),
});

router.get("/rental/search", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Parameter pencarian tidak valid (kota wajib)." }); return; }
  const { kota, mode, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai } = parsed.data;
  if (tanggal_mulai && tanggal_selesai && tanggal_selesai < tanggal_mulai) {
    res.status(400).json({ error: "Tanggal selesai harus sama atau setelah tanggal mulai." });
    return;
  }

  const rows = await db
    .select({ o: rentalKendaraanTable, k: kendaraanTable, driver: usersTable })
    .from(rentalKendaraanTable)
    .innerJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .innerJoin(usersTable, eq(usersTable.id, rentalKendaraanTable.driver_id))
    .where(and(eq(rentalKendaraanTable.is_active, true), eq(rentalKendaraanTable.kota, kota)));

  const today = todayISO();
  const reqMulai = tanggal_mulai ?? null;
  const reqSelesai = tanggal_selesai ?? null;
  const useRange = !!(reqMulai && reqSelesai);

  // Sembunyikan unit yang sedang/masih disewa dari penyewa lain. Bila penyewa memilih
  // rentang tanggal, sembunyikan unit yang booking-nya bertabrakan dengan rentang itu;
  // bila tidak, pakai patokan "hari ini". Tiap offer = satu kendaraan.
  const occupied = new Set<number>();
  const offerIds = rows.map(({ o }) => o.id);
  if (offerIds.length > 0) {
    const busy = await db
      .select({ rental_id: rentalBookingsTable.rental_id })
      .from(rentalBookingsTable)
      .where(
        and(
          inArray(rentalBookingsTable.rental_id, offerIds),
          inArray(rentalBookingsTable.status, ["paid", "confirmed", "aktif", "dalam_perjalanan", "pending_verification"]),
          lte(rentalBookingsTable.tanggal_mulai, useRange ? reqSelesai! : today),
          gte(rentalBookingsTable.tanggal_selesai, useRange ? reqMulai! : today),
        ),
      );
    for (const b of busy) occupied.add(b.rental_id);
  }

  const result = rows
    .filter(({ o }) => o.driver_id !== user.id)
    .filter(({ o }) => {
      if (useRange) {
        // Hanya tampilkan unit yang jendela ketersediaannya mencakup rentang tanggal yang diminta.
        if (o.tersedia_mulai && reqMulai! < o.tersedia_mulai) return false;
        if (o.tersedia_sampai && reqSelesai! > o.tersedia_sampai) return false;
        return true;
      }
      return !o.tersedia_sampai || o.tersedia_sampai >= today;
    })
    .filter(({ o }) => !occupied.has(o.id))
    .filter(({ o }) => {
      // Bila penyewa memilih jam ambil/kembali, sembunyikan unit yang jam operasionalnya
      // tidak mencakup jam tersebut. Unit 24 jam selalu lolos.
      if (o.tersedia_24jam || !o.jam_buka || !o.jam_tutup) return true;
      if (jam_mulai && (jam_mulai < o.jam_buka || jam_mulai > o.jam_tutup)) return false;
      if (jam_selesai && (jam_selesai < o.jam_buka || jam_selesai > o.jam_tutup)) return false;
      return true;
    })
    .filter(({ o }) => {
      if (mode === "lepas_kunci") return o.harga_lepas_kunci != null;
      if (mode === "dengan_sopir") return o.harga_dengan_sopir != null;
      return o.harga_lepas_kunci != null || o.harga_dengan_sopir != null;
    })
    .map(({ o, k, driver }) => ({
      id: o.id,
      kota: o.kota,
      mode: o.mode,
      harga_lepas_kunci: o.harga_lepas_kunci,
      harga_dengan_sopir: o.harga_dengan_sopir,
      deposit: o.deposit,
      catatan: o.catatan,
      syarat: o.syarat,
      tersedia_mulai: o.tersedia_mulai,
      tersedia_sampai: o.tersedia_sampai,
      tersedia_24jam: o.tersedia_24jam,
      jam_buka: o.jam_buka,
      jam_tutup: o.jam_tutup,
      alamat_kantor: o.alamat_kantor,
      kantor_detail: o.kantor_detail,
      kantor_lat: o.kantor_lat,
      kantor_lng: o.kantor_lng,
      driver: { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? driver.foto_diri ?? null },
      kendaraan: { id: k.id, jenis: k.jenis, merek: k.merek, model: k.model, warna: k.warna, plat_nomor: k.plat_nomor, foto_url: k.foto_url, tahun: k.tahun },
    }));

  res.json(result);
});

// ===== PENYEWA: detail penawaran =====
router.get("/rental/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const [row] = await db
    .select({ o: rentalKendaraanTable, k: kendaraanTable, driver: usersTable })
    .from(rentalKendaraanTable)
    .innerJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .innerJoin(usersTable, eq(usersTable.id, rentalKendaraanTable.driver_id))
    .where(eq(rentalKendaraanTable.id, id));
  if (!row || !row.o.is_active) { res.status(404).json({ error: "Penawaran rental tidak ditemukan." }); return; }

  const { o, k, driver } = row;
  res.json({
    id: o.id,
    kota: o.kota,
    mode: o.mode,
    harga_lepas_kunci: o.harga_lepas_kunci,
    harga_dengan_sopir: o.harga_dengan_sopir,
    deposit: o.deposit,
    catatan: o.catatan,
    syarat: o.syarat,
    tersedia_mulai: o.tersedia_mulai,
    tersedia_sampai: o.tersedia_sampai,
    tersedia_24jam: o.tersedia_24jam,
    jam_buka: o.jam_buka,
    jam_tutup: o.jam_tutup,
    alamat_kantor: o.alamat_kantor,
    kantor_detail: o.kantor_detail,
    kantor_lat: o.kantor_lat,
    kantor_lng: o.kantor_lng,
    driver: { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? driver.foto_diri ?? null },
    kendaraan: { id: k.id, jenis: k.jenis, merek: k.merek, model: k.model, warna: k.warna, plat_nomor: k.plat_nomor, foto_url: k.foto_url, tahun: k.tahun },
  });
});

// ===== PENYEWA: booking rental =====
router.post("/rental/:id/book", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "penumpang") { res.status(403).json({ error: "Hanya penumpang yang bisa menyewa." }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID penawaran tidak valid." }); return; }

  const parsed = BookBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { mode, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, ambil_di_kantor, pickup, dropoff, catatan, payment_method } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [o] = await tx.select().from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, id)).for("update");
    if (!o || !o.is_active) return { error: "Penawaran rental tidak ditemukan atau tidak aktif.", status: 404 } as const;
    if (o.driver_id === user.id) return { error: "Tidak bisa menyewa kendaraan sendiri.", status: 400 } as const;

    const hargaPerHari = mode === "lepas_kunci" ? o.harga_lepas_kunci : o.harga_dengan_sopir;
    if (hargaPerHari == null || hargaPerHari <= 0) {
      return { error: `Mode ${mode === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir"} tidak tersedia untuk kendaraan ini.`, status: 400 } as const;
    }
    const ambilKantor = ambil_di_kantor === true;
    let pickupVals: { label: string | null; detail: string | null; lat: number | null; lng: number | null };
    let dropoffVals: { label: string | null; detail: string | null; lat: number | null; lng: number | null };
    if (ambilKantor) {
      if (!o.alamat_kantor) {
        return { error: "Mitra belum mengatur alamat kantor untuk pengambilan di tempat. Pilih antar ke lokasi Anda.", status: 400 } as const;
      }
      pickupVals = { label: o.alamat_kantor, detail: o.kantor_detail ?? null, lat: o.kantor_lat ?? null, lng: o.kantor_lng ?? null };
      dropoffVals = { ...pickupVals };
    } else {
      if (!pickup || !pickup.label) {
        return { error: "Lokasi penjemputan wajib diisi.", status: 400 } as const;
      }
      if (!dropoff || !dropoff.label) {
        return { error: "Lokasi pengantaran wajib diisi.", status: 400 } as const;
      }
      pickupVals = { label: pickup.label, detail: pickup.detail ?? null, lat: pickup.lat ?? null, lng: pickup.lng ?? null };
      dropoffVals = { label: dropoff.label, detail: dropoff.detail ?? null, lat: dropoff.lat ?? null, lng: dropoff.lng ?? null };
    }

    const totalHari = hitungHari(tanggal_mulai, tanggal_selesai);
    if (totalHari < 1) return { error: "Tanggal sewa tidak valid.", status: 400 } as const;
    if (tanggal_selesai < tanggal_mulai) return { error: "Tanggal selesai harus setelah tanggal mulai.", status: 400 } as const;
    if (o.tersedia_mulai && tanggal_mulai < o.tersedia_mulai) return { error: `Unit baru tersedia mulai ${o.tersedia_mulai}. Pilih tanggal mulai pada atau setelah tanggal tersebut.`, status: 400 } as const;
    if (o.tersedia_sampai && tanggal_selesai > o.tersedia_sampai) return { error: `Unit hanya tersedia sampai ${o.tersedia_sampai}. Pilih tanggal selesai pada atau sebelum tanggal tersebut.`, status: 400 } as const;

    if (!o.tersedia_24jam && o.jam_buka && o.jam_tutup) {
      if (jam_mulai < o.jam_buka || jam_mulai > o.jam_tutup) {
        return { error: `Jam ambil harus dalam jam operasional unit (${o.jam_buka}–${o.jam_tutup}).`, status: 400 } as const;
      }
      if (jam_selesai < o.jam_buka || jam_selesai > o.jam_tutup) {
        return { error: `Jam kembali harus dalam jam operasional unit (${o.jam_buka}–${o.jam_tutup}).`, status: 400 } as const;
      }
    }

    const startMs = new Date(`${tanggal_mulai}T${jam_mulai}:00+08:00`).getTime();
    if (!Number.isFinite(startMs)) return { error: "Tanggal/jam mulai tidak valid.", status: 400 } as const;
    if (startMs <= Date.now()) return { error: "Waktu mulai sewa sudah lewat. Pilih waktu yang akan datang.", status: 400 } as const;

    // Cegah double-booking: tolak jika rentang tanggal bertabrakan dengan booking aktif lain.
    // Lock pada baris penawaran (rental_kendaraan) di atas men-serialize transaksi konkuren untuk kendaraan ini.
    const overlapping = await tx
      .select({ id: rentalBookingsTable.id })
      .from(rentalBookingsTable)
      .where(
        and(
          eq(rentalBookingsTable.rental_id, id),
          inArray(rentalBookingsTable.status, ["pending", "paid", "confirmed", "aktif"]),
          lte(rentalBookingsTable.tanggal_mulai, tanggal_selesai),
          gte(rentalBookingsTable.tanggal_selesai, tanggal_mulai),
        ),
      );
    if (overlapping.length > 0) {
      return { error: "Kendaraan sudah dibooking pada rentang tanggal tersebut. Silakan pilih tanggal lain.", status: 409 } as const;
    }

    const deposit = mode === "lepas_kunci" ? o.deposit : 0;
    const totalAmount = hargaPerHari * totalHari;

    const [created] = await tx
      .insert(rentalBookingsTable)
      .values({
        rental_id: id,
        penyewa_id: user.id,
        mode,
        kota: o.kota,
        tanggal_mulai,
        tanggal_selesai,
        jam_mulai,
        jam_selesai,
        total_hari: totalHari,
        harga_per_hari: hargaPerHari,
        deposit,
        total_amount: totalAmount,
        ambil_di_kantor: ambilKantor,
        pickup_label: pickupVals.label,
        pickup_detail: pickupVals.detail,
        pickup_lat: pickupVals.lat,
        pickup_lng: pickupVals.lng,
        dropoff_label: dropoffVals.label,
        dropoff_detail: dropoffVals.detail,
        dropoff_lat: dropoffVals.lat,
        dropoff_lng: dropoffVals.lng,
        catatan: catatan ?? null,
        payment_method,
        status: "pending",
      })
      .returning();

    return { ok: true as const, booking: created, driver_id: o.driver_id };
  });

  if ("error" in result) { res.status(result.status).json({ error: result.error }); return; }

  req.log.info({ bookingId: result.booking.id, offerId: id, userId: user.id }, "Rental booked");
  createNotification(
    result.driver_id, "new_booking",
    "Pesanan Rental Baru",
    `${user.nama} menyewa kendaraan Anda (${result.booking.mode === "lepas_kunci" ? "Lepas Kunci" : "Dengan Sopir"}) ${result.booking.total_hari} hari.`,
    "rental_booking", result.booking.id,
  ).catch(() => {});
  res.status(201).json(result.booking);
});

async function loadRentalBookingDetail(bookingId: number, currentUserId?: number) {
  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, bookingId));
  if (!b) return null;

  const [o] = await db.select().from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, b.rental_id));
  const [driver] = o ? await db.select().from(usersTable).where(eq(usersTable.id, o.driver_id)) : [null];
  const [penyewa] = b.penyewa_id ? await db.select().from(usersTable).where(eq(usersTable.id, b.penyewa_id)) : [null];
  const [kendaraan] = o?.kendaraan_id ? await db.select().from(kendaraanTable).where(eq(kendaraanTable.id, o.kendaraan_id)) : [null];

  let myRating: { stars: number; comment: string | null } | null = null;
  if (currentUserId) {
    try {
      const result = await pool.query<{ stars: number; comment: string | null }>(
        `SELECT stars, comment FROM ratings WHERE booking_id = $1 AND rater_id = $2 AND booking_type = 'rental' LIMIT 1`,
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
      ? { id: driver.id, nama: driver.nama, foto_profil: driver.foto_profil ?? driver.foto_diri ?? null, nama_bank: driver.nama_bank ?? null, no_rekening: driver.no_rekening ?? null, nama_pemilik_rekening: driver.nama_pemilik_rekening ?? null }
      : null,
    penyewa: penyewa
      ? { id: penyewa.id, nama: penyewa.nama, foto_profil: penyewa.foto_profil ?? null }
      : null,
    kendaraan: kendaraan
      ? { id: kendaraan.id, jenis: kendaraan.jenis, merek: kendaraan.merek, model: kendaraan.model, warna: kendaraan.warna, plat_nomor: kendaraan.plat_nomor, foto_url: kendaraan.foto_url, tahun: kendaraan.tahun }
      : null,
    offer: o ? { id: o.id, driver_id: o.driver_id, kota: o.kota } : null,
    my_rating: myRating ?? null,
    can_cancel: ["pending", "paid"].includes(b.status),
  };
}

// ===== PENYEWA: pesanan saya =====
router.get("/rental-bookings/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "penumpang") { res.status(403).json({ error: "Hanya penumpang." }); return; }

  const rows = await db
    .select({ b: rentalBookingsTable, o: rentalKendaraanTable, driver: usersTable, k: kendaraanTable })
    .from(rentalBookingsTable)
    .leftJoin(rentalKendaraanTable, eq(rentalKendaraanTable.id, rentalBookingsTable.rental_id))
    .leftJoin(usersTable, eq(usersTable.id, rentalKendaraanTable.driver_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .where(eq(rentalBookingsTable.penyewa_id, user.id))
    .orderBy(sql`${rentalBookingsTable.created_at} DESC`);

  res.json(
    rows.map(({ b, driver, k }) => ({
      ...b,
      driver: driver ? { id: driver.id, nama: driver.nama } : null,
      kendaraan: k ? { id: k.id, merek: k.merek, model: k.model, plat_nomor: k.plat_nomor, foto_url: k.foto_url } : null,
    })),
  );
});

// ===== MITRA: pesanan masuk =====
router.get("/rental-bookings/incoming", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (user.role !== "driver") { res.status(403).json({ error: "Hanya Mitra Driver." }); return; }

  const rows = await db
    .select({ b: rentalBookingsTable, penyewa: usersTable, k: kendaraanTable })
    .from(rentalBookingsTable)
    .innerJoin(rentalKendaraanTable, eq(rentalKendaraanTable.id, rentalBookingsTable.rental_id))
    .leftJoin(usersTable, eq(usersTable.id, rentalBookingsTable.penyewa_id))
    .leftJoin(kendaraanTable, eq(kendaraanTable.id, rentalKendaraanTable.kendaraan_id))
    .where(eq(rentalKendaraanTable.driver_id, user.id))
    .orderBy(sql`${rentalBookingsTable.created_at} DESC`);

  res.json(
    rows.map(({ b, penyewa, k }) => ({
      ...b,
      penyewa: penyewa ? { id: penyewa.id, nama: penyewa.nama } : null,
      kendaraan: k ? { id: k.id, merek: k.merek, model: k.model, plat_nomor: k.plat_nomor } : null,
    })),
  );
});

// ===== detail pesanan (penyewa atau mitra) =====
router.get("/rental-bookings/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID booking tidak valid." }); return; }
  const detail = await loadRentalBookingDetail(id, user.id);
  if (!detail) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  const isOwnerPenyewa = detail.penyewa_id === user.id;
  const isOwnerMitra = detail.offer?.driver_id === user.id;
  if (!isOwnerPenyewa && !isOwnerMitra) { res.status(403).json({ error: "Tidak boleh mengakses pesanan ini." }); return; }
  res.json({ ...detail, is_mitra: isOwnerMitra });
});

// ===== voucher rental (penyewa owner atau admin) =====
router.get("/rental-bookings/:id/etiket", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const currentUser = await getUserFromToken(req.headers.authorization);
  if (!currentUser) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  const detail = await loadRentalBookingDetail(id);
  if (!detail) { res.status(404).json({ error: "Voucher tidak ditemukan." }); return; }

  const isOwner = detail.penyewa_id === currentUser.id;
  const isAdmin = currentUser.role === "admin";
  if (!isOwner && !isAdmin) { res.status(403).json({ error: "Tidak boleh melihat voucher ini." }); return; }

  if (!["confirmed", "aktif", "selesai"].includes(detail.status)) {
    res.status(403).json({
      error: "Voucher belum tersedia. Menunggu verifikasi pembayaran oleh admin.",
      status: "pending_verification",
      booking_status: detail.status,
    });
    return;
  }

  const bookingCode = `RUTE-R${String(id).padStart(5, "0")}`;
  res.json({ ...detail, booking_code: bookingCode });
});

// ===== PENYEWA: upload bukti bayar =====
router.post("/rental-bookings/:id/payment-proof", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID booking tidak valid." }); return; }
  const parsed = PaymentProofBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (b.penyewa_id !== user.id) { res.status(403).json({ error: "Bukan pesanan Anda." }); return; }
  if (b.status !== "pending" && b.status !== "paid") { res.status(400).json({ error: "Status pesanan tidak memungkinkan upload bukti." }); return; }

  await db.update(rentalBookingsTable).set({ payment_proof_url: parsed.data.url, status: "paid", updated_at: new Date() }).where(eq(rentalBookingsTable.id, id));
  req.log.info({ bookingId: id, userId: user.id }, "Rental payment proof uploaded");

  db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .then((admins) => {
      for (const admin of admins) {
        createNotification(
          admin.id, "new_payment_proof",
          "Bukti Transfer Rental Baru Masuk",
          `${user.nama} mengupload bukti transfer untuk booking rental #${id}. Harap segera verifikasi.`,
          "rental_booking", id,
        ).catch(() => {});
      }
    })
    .catch(() => {});

  res.json({ ok: true });
});

// ===== PENYEWA: batalkan =====
router.post("/rental-bookings/:id/cancel", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }
  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (b.penyewa_id !== user.id) { res.status(403).json({ error: "Tidak boleh membatalkan pesanan ini." }); return; }
  if (!["pending", "paid"].includes(b.status)) { res.status(400).json({ error: "Pesanan tidak dapat dibatalkan karena sudah aktif atau selesai." }); return; }

  await db.update(rentalBookingsTable).set({ status: "batal", updated_at: new Date() }).where(eq(rentalBookingsTable.id, id));
  const [o] = await db.select({ driver_id: rentalKendaraanTable.driver_id }).from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, b.rental_id));
  if (o?.driver_id) {
    createNotification(o.driver_id, "cancel_booking", "Pesanan Rental Dibatalkan", `${user.nama} membatalkan pesanan rental Anda.`, "rental_booking", id).catch(() => {});
  }
  res.json({ ok: true });
});

// ===== MITRA: kemajuan rental (serah terima → selesai) =====
router.patch("/rental-bookings/:id/progress", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  const [o] = await db.select({ driver_id: rentalKendaraanTable.driver_id }).from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, b.rental_id));
  if (!o || o.driver_id !== user.id) { res.status(403).json({ error: "Bukan mitra untuk pesanan ini." }); return; }

  if (b.status === "confirmed") {
    await db.update(rentalBookingsTable).set({ status: "aktif", trip_progress: "dalam_perjalanan", updated_at: new Date() }).where(eq(rentalBookingsTable.id, id));
    if (b.penyewa_id) createNotification(b.penyewa_id, "trip_progress", "Rental Dimulai", "Kendaraan rental Anda sudah diserahkan. Selamat menggunakan!", "rental_booking", id).catch(() => {});
    res.json({ ok: true, status: "aktif" });
    return;
  }
  if (b.status === "aktif") {
    await db.update(rentalBookingsTable).set({ status: "selesai", trip_progress: "selesai", updated_at: new Date() }).where(eq(rentalBookingsTable.id, id));
    if (b.penyewa_id) createNotification(b.penyewa_id, "trip_completed", "Rental Selesai", "Rental Anda telah selesai. Terima kasih telah menggunakan RUTE!", "rental_booking", id).catch(() => {});
    res.json({ ok: true, status: "selesai" });
    return;
  }
  res.status(400).json({ error: "Status pesanan tidak memungkinkan perubahan ini. Pembayaran harus dikonfirmasi admin lebih dulu." });
});

// ===== PENYEWA/MITRA: rating =====
router.post("/rental-bookings/:id/rate", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  const { stars, comment } = (req.body ?? {}) as { stars?: number; comment?: string };
  if (!stars || stars < 1 || stars > 5) { res.status(400).json({ error: "Bintang harus antara 1–5." }); return; }

  const [b] = await db.select().from(rentalBookingsTable).where(eq(rentalBookingsTable.id, id));
  if (!b) { res.status(404).json({ error: "Pesanan tidak ditemukan." }); return; }
  if (b.status !== "selesai") { res.status(400).json({ error: "Rental belum selesai." }); return; }

  const [o] = await db.select({ driver_id: rentalKendaraanTable.driver_id }).from(rentalKendaraanTable).where(eq(rentalKendaraanTable.id, b.rental_id));
  if (!o) { res.status(404).json({ error: "Mitra tidak ditemukan." }); return; }

  const isPenyewa = user.id === b.penyewa_id;
  const isMitra = user.id === o.driver_id;
  if (!isPenyewa && !isMitra) { res.status(403).json({ error: "Bukan peserta rental ini." }); return; }
  const ratee_id = isPenyewa ? o.driver_id : b.penyewa_id;

  try {
    const insert = await pool.query(
      `INSERT INTO ratings (booking_id, booking_type, rater_id, ratee_id, stars, comment)
       VALUES ($1, 'rental', $2, $3, $4, $5)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [id, user.id, ratee_id, stars, comment ?? null],
    );
    if (insert.rows.length === 0) {
      await pool.query(
        `UPDATE ratings SET stars = $1, comment = $2 WHERE rater_id = $3 AND booking_id = $4 AND booking_type = 'rental'`,
        [stars, comment ?? null, user.id, id],
      );
    }
  } catch (err: any) {
    req.log.error({ err, bookingId: id }, "Rental rate error");
    res.status(500).json({ error: `DB error: ${err?.message ?? String(err)}` });
    return;
  }

  req.log.info({ bookingId: id, rater: user.id, stars }, "Rental booking rated");
  res.json({ ok: true });
});

export default router;
