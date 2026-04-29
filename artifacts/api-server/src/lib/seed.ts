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
