import { pgTable, text, serial, integer, timestamp, real } from "drizzle-orm/pg-core";

export const schedulesTable = pgTable("schedules", {
  id: serial("id").primaryKey(),
  driver_id: integer("driver_id").notNull(),
  kendaraan_id: integer("kendaraan_id"),
  origin_city: text("origin_city").notNull(),
  destination_city: text("destination_city").notNull(),
  departure_date: text("departure_date").notNull(),
  departure_time: text("departure_time").notNull(),
  capacity: integer("capacity").notNull(),
  price_per_seat: integer("price_per_seat").notNull(),
  status: text("status").notNull().default("active"),
  trip_progress: text("trip_progress").notNull().default("belum_jemput"),
  kursi_offline: text("kursi_offline").array().notNull().default([]),
  driver_lat: real("driver_lat"),
  driver_lng: real("driver_lng"),
  driver_location_updated_at: timestamp("driver_location_updated_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Schedule = typeof schedulesTable.$inferSelect;
export type InsertSchedule = typeof schedulesTable.$inferInsert;
