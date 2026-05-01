import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool, usersTable } from "@workspace/db";
import { logger } from "./logger";

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
    const values = KOTA_KALTIM.map(k => `('${k}')`).join(",");
    await pool.query(
      `INSERT INTO kota_list (nama_kota) VALUES ${values} ON CONFLICT (nama_kota) DO NOTHING`
    );
    logger.info("Kota list seeded.");
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
