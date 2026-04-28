import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { schedulesTable } from "./schedules";
import { tebenganPulangTable } from "./tebengan";

export const scheduleWaypointsTable = pgTable("schedule_waypoints", {
  id: serial("id").primaryKey(),
  schedule_id: integer("schedule_id")
    .notNull()
    .references(() => schedulesTable.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  order_index: integer("order_index").notNull(),
  price_from_prev: integer("price_from_prev").notNull(),
});

export const tebenganWaypointsTable = pgTable("tebengan_waypoints", {
  id: serial("id").primaryKey(),
  tebengan_id: integer("tebengan_id")
    .notNull()
    .references(() => tebenganPulangTable.id, { onDelete: "cascade" }),
  city: text("city").notNull(),
  order_index: integer("order_index").notNull(),
  price_from_prev: integer("price_from_prev").notNull(),
});

export type ScheduleWaypoint = typeof scheduleWaypointsTable.$inferSelect;
export type InsertScheduleWaypoint = typeof scheduleWaypointsTable.$inferInsert;
export type TebenganWaypoint = typeof tebenganWaypointsTable.$inferSelect;
export type InsertTebenganWaypoint = typeof tebenganWaypointsTable.$inferInsert;
