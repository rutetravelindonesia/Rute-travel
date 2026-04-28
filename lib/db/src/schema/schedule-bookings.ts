import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { schedulesTable } from "./schedules";
import { usersTable } from "./users";

export const scheduleBookingsTable = pgTable("schedule_bookings", {
  id: serial("id").primaryKey(),
  schedule_id: integer("schedule_id")
    .notNull()
    .references(() => schedulesTable.id, { onDelete: "cascade" }),
  penumpang_id: integer("penumpang_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kursi: text("kursi").array().notNull(),
  pickup_label: text("pickup_label").notNull(),
  pickup_detail: text("pickup_detail"),
  pickup_lat: real("pickup_lat"),
  pickup_lng: real("pickup_lng"),
  dropoff_label: text("dropoff_label").notNull(),
  dropoff_detail: text("dropoff_detail"),
  dropoff_lat: real("dropoff_lat"),
  dropoff_lng: real("dropoff_lng"),
  boarding_city: text("boarding_city"),
  alighting_city: text("alighting_city"),
  total_amount: integer("total_amount").notNull(),
  payment_method: text("payment_method").notNull(),
  payment_proof_url: text("payment_proof_url"),
  status: text("status").notNull().default("pending"),
  pickup_confirmed_at: timestamp("pickup_confirmed_at", { withTimezone: true }),
  dropoff_confirmed_at: timestamp("dropoff_confirmed_at", { withTimezone: true }),
  cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduleBooking = typeof scheduleBookingsTable.$inferSelect;
export type InsertScheduleBooking = typeof scheduleBookingsTable.$inferInsert;
