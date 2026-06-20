import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { logger } from "./logger";
import { KOTA_INDONESIA } from "./kota-indonesia";

const SALT_ROUNDS = 10;

const ADMIN_PHONE = "08000000000";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Admin RUTE";

export async function runMigrations(): Promise<void> {
  const migrations = [
    `ALTER TABLE carter_settings ADD COLUMN IF NOT EXISTS kendaraan_id INTEGER`,
    `ALTER TABLE carter_bookings ADD COLUMN IF NOT EXISTS pickup_confirmed_at TIMESTAMPTZ`,
    `ALTER TABLE carter_bookings ADD COLUMN IF NOT EXISTS dropoff_confirmed_at TIMESTAMPTZ`,
    `ALTER TABLE ratings ADD COLUMN IF NOT EXISTS booking_type TEXT NOT NULL DEFAULT 'schedule'`,
    `ALTER TABLE ratings ADD COLUMN IF NOT EXISTS carter_booking_id INTEGER`,
    `ALTER TABLE ratings ALTER COLUMN schedule_id DROP NOT NULL`,
    `DROP INDEX IF EXISTS ratings_rater_booking_unique`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ratings_rater_booking_unique ON ratings (rater_id, booking_id, booking_type)`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      ref_type TEXT,
      ref_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id, created_at DESC)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS model_kendaraan TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_diri TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_stnk TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE`,
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id SERIAL PRIMARY KEY,
      no_whatsapp TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS nama_bank TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS no_rekening TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS nama_pemilik_rekening TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ`,
    // ===== RENTAL KENDARAAN =====
    `CREATE TABLE IF NOT EXISTS rental_kendaraan (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kendaraan_id INTEGER NOT NULL REFERENCES kendaraan(id) ON DELETE CASCADE,
      kota TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'lepas_kunci',
      harga_lepas_kunci INTEGER,
      harga_dengan_sopir INTEGER,
      deposit INTEGER NOT NULL DEFAULT 0,
      catatan TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS rental_kendaraan_driver_idx ON rental_kendaraan (driver_id)`,
    `CREATE INDEX IF NOT EXISTS rental_kendaraan_kota_idx ON rental_kendaraan (kota, is_active)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS rental_kendaraan_driver_kendaraan_unique ON rental_kendaraan (driver_id, kendaraan_id)`,
    `CREATE TABLE IF NOT EXISTS rental_bookings (
      id SERIAL PRIMARY KEY,
      rental_id INTEGER NOT NULL REFERENCES rental_kendaraan(id) ON DELETE CASCADE,
      penyewa_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      kota TEXT NOT NULL,
      tanggal_mulai TEXT NOT NULL,
      tanggal_selesai TEXT NOT NULL,
      jam_mulai TEXT NOT NULL,
      jam_selesai TEXT NOT NULL,
      total_hari INTEGER NOT NULL,
      harga_per_hari INTEGER NOT NULL,
      deposit INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL,
      pickup_label TEXT,
      pickup_detail TEXT,
      pickup_lat REAL,
      pickup_lng REAL,
      catatan TEXT,
      payment_method TEXT NOT NULL,
      payment_proof_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      trip_progress TEXT NOT NULL DEFAULT 'menunggu',
      driver_lat REAL,
      driver_lng REAL,
      driver_location_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS rental_bookings_penyewa_idx ON rental_bookings (penyewa_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS rental_bookings_rental_idx ON rental_bookings (rental_id)`,
    // ===== HAPUS FITUR TEBENGAN PULANG (digantikan rental) =====
    `DROP TABLE IF EXISTS tebengan_bookings CASCADE`,
    `DROP TABLE IF EXISTS tebengan_waypoints CASCADE`,
    `DROP TABLE IF EXISTS tebengan_pulang CASCADE`,
  ];
  for (const sql of migrations) {
    try {
      await pool.query(sql);
    } catch (err) {
      logger.error({ err, sql }, "Migration step failed.");
    }
  }
  logger.info("DB migrations checked.");
}

const KOTA_KALTIM = [
  "Balikpapan","Bengalon","Berau","Biduk Biduk","Bontang","Kaliorang","Karangan",
  "Kembang Janggut","Kota Bangun","Kutai Lama","Melak","Muara Badak","Muara Kaman",
  "Penajam","Rantau Pulung","Samarinda","Sanga Sanga","Sangatta","Sangkulirang",
  "Sebulu","Sendawar","Separi","Tali Sayan","Tanah Kuning","Tanjung Batu",
  "Tanjung Redeb","Tanjung Selor","Tarakan","Tenggarong","Wahau",
];

export async function seedKota(): Promise<void> {
  try {
    // Existing Kaltim town list (plain names, kept for backward compatibility).
    const kaltimPlaceholders = KOTA_KALTIM.map((_, i) => `($${i + 1})`).join(",");
    await pool.query(
      `INSERT INTO kota_list (nama_kota) VALUES ${kaltimPlaceholders} ON CONFLICT (nama_kota) DO NOTHING`,
      KOTA_KALTIM
    );

    // Full Indonesia: all provinces + kabupaten/kota, with provinsi populated.
    const nasionalPlaceholders = KOTA_INDONESIA
      .map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`)
      .join(",");
    const nasionalParams = KOTA_INDONESIA.flatMap((k) => [k.nama_kota, k.provinsi]);
    await pool.query(
      `INSERT INTO kota_list (nama_kota, provinsi) VALUES ${nasionalPlaceholders} ON CONFLICT (nama_kota) DO NOTHING`,
      nasionalParams
    );

    logger.info(
      { kaltim: KOTA_KALTIM.length, nasional: KOTA_INDONESIA.length },
      "Kota list seeded."
    );
  } catch (err) {
    logger.error({ err }, "Failed to seed kota list.");
  }
}

export async function seedAdmin(): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.no_whatsapp, ADMIN_PHONE));

    if (existing) {
      logger.info("Admin account already exists — skipping seed.");
      return;
    }

    const password_hash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
    await db.insert(usersTable).values({
      nama: ADMIN_NAME,
      no_whatsapp: ADMIN_PHONE,
      password_hash,
      role: "admin",
    });

    logger.info("Admin account created successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account.");
  }
}
