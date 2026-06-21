import { pgTable, text, serial, integer, real, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { kendaraanTable } from "./kendaraan";

// A rental offer published by a mitra/driver for one of their vehicles.
// mode: "lepas_kunci" (self-drive), "dengan_sopir" (with driver), or "dua-duanya" (both).
// Prices are per day. harga_lepas_kunci / harga_dengan_sopir are nullable; a price
// is only set for the mode(s) the offer supports.
export const rentalKendaraanTable = pgTable("rental_kendaraan", {
  id: serial("id").primaryKey(),
  driver_id: integer("driver_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kendaraan_id: integer("kendaraan_id")
    .notNull()
    .references(() => kendaraanTable.id, { onDelete: "cascade" }),
  kota: text("kota").notNull(),
  mode: text("mode").notNull().default("lepas_kunci"),
  harga_lepas_kunci: integer("harga_lepas_kunci"),
  harga_dengan_sopir: integer("harga_dengan_sopir"),
  deposit: integer("deposit").notNull().default(0),
  catatan: text("catatan"),
  syarat: text("syarat"),
  alamat_kantor: text("alamat_kantor"),
  kantor_detail: text("kantor_detail"),
  kantor_lat: real("kantor_lat"),
  kantor_lng: real("kantor_lng"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  driverKendaraanUnique: uniqueIndex("rental_kendaraan_driver_kendaraan_unique").on(t.driver_id, t.kendaraan_id),
}));

// A rental booking made by a penyewa (penumpang).
export const rentalBookingsTable = pgTable("rental_bookings", {
  id: serial("id").primaryKey(),
  rental_id: integer("rental_id")
    .notNull()
    .references(() => rentalKendaraanTable.id, { onDelete: "cascade" }),
  penyewa_id: integer("penyewa_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(),
  kota: text("kota").notNull(),
  tanggal_mulai: text("tanggal_mulai").notNull(),
  tanggal_selesai: text("tanggal_selesai").notNull(),
  jam_mulai: text("jam_mulai").notNull(),
  jam_selesai: text("jam_selesai").notNull(),
  total_hari: integer("total_hari").notNull(),
  harga_per_hari: integer("harga_per_hari").notNull(),
  deposit: integer("deposit").notNull().default(0),
  total_amount: integer("total_amount").notNull(),
  pickup_label: text("pickup_label"),
  pickup_detail: text("pickup_detail"),
  pickup_lat: real("pickup_lat"),
  pickup_lng: real("pickup_lng"),
  ambil_di_kantor: boolean("ambil_di_kantor").notNull().default(false),
  dropoff_label: text("dropoff_label"),
  dropoff_detail: text("dropoff_detail"),
  dropoff_lat: real("dropoff_lat"),
  dropoff_lng: real("dropoff_lng"),
  catatan: text("catatan"),
  payment_method: text("payment_method").notNull(),
  payment_proof_url: text("payment_proof_url"),
  status: text("status").notNull().default("pending"),
  trip_progress: text("trip_progress").notNull().default("menunggu"),
  driver_lat: real("driver_lat"),
  driver_lng: real("driver_lng"),
  driver_location_updated_at: timestamp("driver_location_updated_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RentalKendaraan = typeof rentalKendaraanTable.$inferSelect;
export type InsertRentalKendaraan = typeof rentalKendaraanTable.$inferInsert;
export type RentalBooking = typeof rentalBookingsTable.$inferSelect;
export type InsertRentalBooking = typeof rentalBookingsTable.$inferInsert;
