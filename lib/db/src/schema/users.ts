import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  nama: text("nama").notNull(),
  no_whatsapp: text("no_whatsapp").unique().notNull(),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull().default("penumpang"),
  nik: text("nik"),
  kota: text("kota"),
  jenis_kendaraan: text("jenis_kendaraan"),
  model_kendaraan: text("model_kendaraan"),
  plat_nomor: text("plat_nomor"),
  foto_profil: text("foto_profil"),
  foto_diri: text("foto_diri"),
  foto_stnk: text("foto_stnk"),
  is_verified: boolean("is_verified").notNull().default(true),
  is_suspended: boolean("is_suspended").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
