import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const carterSettingsTable = pgTable("carter_settings", {
  id: serial("id").primaryKey(),
  driver_id: integer("driver_id").notNull().unique(),
  kendaraan_id: integer("kendaraan_id"),
  origin_city: text("origin_city").notNull(),
  is_24_hours: boolean("is_24_hours").notNull().default(false),
  hours_start: text("hours_start"),
  hours_end: text("hours_end"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carterDatesTable = pgTable("carter_dates", {
  id: serial("id").primaryKey(),
  settings_id: integer("settings_id").notNull(),
  date: text("date").notNull(),
});

export const carterRoutesTable = pgTable("carter_routes", {
  id: serial("id").primaryKey(),
  settings_id: integer("settings_id").notNull(),
  destination_city: text("destination_city").notNull(),
  price: integer("price").notNull(),
});

export type CarterSettings = typeof carterSettingsTable.$inferSelect;
export type InsertCarterSettings = typeof carterSettingsTable.$inferInsert;
export type CarterDate = typeof carterDatesTable.$inferSelect;
export type CarterRoute = typeof carterRoutesTable.$inferSelect;
