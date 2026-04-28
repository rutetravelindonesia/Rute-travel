import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const kendaraanTable = pgTable("kendaraan", {
  id: serial("id").primaryKey(),
  driver_id: integer("driver_id").notNull(),
  jenis: text("jenis").notNull(),
  merek: text("merek").notNull(),
  model: text("model").notNull(),
  plat_nomor: text("plat_nomor").notNull(),
  warna: text("warna").notNull(),
  tahun: integer("tahun").notNull(),
  foto_url: text("foto_url").notNull(),
  is_default: boolean("is_default").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Kendaraan = typeof kendaraanTable.$inferSelect;
export type InsertKendaraan = typeof kendaraanTable.$inferInsert;
