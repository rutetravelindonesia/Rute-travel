import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { schedulesTable } from "./schedules";
import { carterBookingsTable } from "./carter-bookings";
import { usersTable } from "./users";

export const ratingsTable = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    schedule_id: integer("schedule_id").references(() => schedulesTable.id, { onDelete: "cascade" }),
    carter_booking_id: integer("carter_booking_id").references(() => carterBookingsTable.id, { onDelete: "cascade" }),
    booking_id: integer("booking_id").notNull(),
    booking_type: text("booking_type").notNull().default("schedule"),
    rater_id: integer("rater_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ratee_id: integer("ratee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(),
    comment: text("comment"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRaterBooking: uniqueIndex("ratings_rater_booking_unique").on(t.rater_id, t.booking_id, t.booking_type),
  }),
);

export type Rating = typeof ratingsTable.$inferSelect;
export type InsertRating = typeof ratingsTable.$inferInsert;
