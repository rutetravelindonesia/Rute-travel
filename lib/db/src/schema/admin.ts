import { pgTable, serial, text, integer, timestamp, numeric } from "drizzle-orm/pg-core";

export const kotaListTable = pgTable("kota_list", {
  id: serial("id").primaryKey(),
  nama_kota: text("nama_kota").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  judul: text("judul").notNull(),
  isi: text("isi").notNull(),
  target: text("target").notNull().default("all"),
  created_by_id: integer("created_by_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const routePricesTable = pgTable("route_prices", {
  id: serial("id").primaryKey(),
  origin_city: text("origin_city").notNull(),
  destination_city: text("destination_city").notNull(),
  harga: numeric("harga", { precision: 12, scale: 0 }).notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminLogsTable = pgTable("admin_logs", {
  id: serial("id").primaryKey(),
  admin_id: integer("admin_id").notNull(),
  admin_nama: text("admin_nama").notNull(),
  aksi: text("aksi").notNull(),
  detail: text("detail"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
