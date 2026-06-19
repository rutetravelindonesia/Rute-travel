import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { kendaraanTable } from "./kendaraan";

export const tebenganPulangTable = pgTable("tebengan_pulang", {
  id: serial("id").primaryKey(),
  driver_id: integer("driver_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kendaraan_id: integer("kendaraan_id")
    .notNull()
    .references(() => kendaraanTable.id, { onDelete: "restrict" }),
  origin_city: text("origin_city").notNull(),
  destination_city: text("destination_city").notNull(),
  departure_date: text("departure_date").notNull(),
  departure_time: text("departure_time").notNull(),
  max_kursi: integer("max_kursi").notNull(),
  price_per_seat: integer("price_per_seat").notNull(),
  catatan: text("catatan"),
  status: text("status").notNull().default("aktif"),
  trip_progress: text("trip_progress").notNull().default("menunggu"),
  source_jadwal_id: integer("source_jadwal_id"),
  source_carter_id: integer("source_carter_id"),
  driver_lat: real("driver_lat"),
  driver_lng: real("driver_lng"),
  driver_location_updated_at: timestamp("driver_location_updated_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tebenganBookingsTable = pgTable("tebengan_bookings", {
  id: serial("id").primaryKey(),
  tebengan_id: integer("tebengan_id")
    .notNull()
    .references(() => tebenganPulangTable.id, { onDelete: "cascade" }),
  penumpang_id: integer("penumpang_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  jumlah_kursi: integer("jumlah_kursi").notNull(),
  pickup_address: text("pickup_address").notNull(),
  dropoff_address: text("dropoff_address"),
  catatan: text("catatan"),
  boarding_city: text("boarding_city"),
  alighting_city: text("alighting_city"),
  total_harga: integer("total_harga").notNull(),
  status: text("status").notNull().default("dipesan"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TebenganPulang = typeof tebenganPulangTable.$inferSelect;
export type InsertTebenganPulang = typeof tebenganPulangTable.$inferInsert;
export type TebenganBooking = typeof tebenganBookingsTable.$inferSelect;
export type InsertTebenganBooking = typeof tebenganBookingsTable.$inferInsert;
