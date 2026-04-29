import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { carterSettingsTable } from "./carter";
import { usersTable } from "./users";

export const carterBookingsTable = pgTable("carter_bookings", {
  id: serial("id").primaryKey(),
  settings_id: integer("settings_id")
    .notNull()
    .references(() => carterSettingsTable.id, { onDelete: "cascade" }),
  penumpang_id: integer("penumpang_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  origin_city: text("origin_city").notNull(),
  destination_city: text("destination_city").notNull(),
  travel_date: text("travel_date").notNull(),
  travel_time: text("travel_time").notNull(),
  pickup_label: text("pickup_label").notNull(),
  pickup_detail: text("pickup_detail"),
  pickup_lat: real("pickup_lat"),
  pickup_lng: real("pickup_lng"),
  dropoff_label: text("dropoff_label").notNull(),
  dropoff_detail: text("dropoff_detail"),
  dropoff_lat: real("dropoff_lat"),
  dropoff_lng: real("dropoff_lng"),
  total_amount: integer("total_amount").notNull(),
  payment_method: text("payment_method").notNull(),
  payment_proof_url: text("payment_proof_url"),
  status: text("status").notNull().default("pending"),
  trip_progress: text("trip_progress").notNull().default("menunggu"),
  driver_lat: real("driver_lat"),
  driver_lng: real("driver_lng"),
  driver_location_updated_at: timestamp("driver_location_updated_at", { withTimezone: true }),
  pickup_confirmed_at: timestamp("pickup_confirmed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CarterBooking = typeof carterBookingsTable.$inferSelect;
export type InsertCarterBooking = typeof carterBookingsTable.$inferInsert;
