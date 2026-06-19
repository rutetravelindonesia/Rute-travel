import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const chatThreadsTable = pgTable(
  "chat_threads",
  {
    id: serial("id").primaryKey(),
    booking_type: text("booking_type").notNull(),
    booking_id: integer("booking_id").notNull(),
    penumpang_id: integer("penumpang_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mitra_id: integer("mitra_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    last_message_at: timestamp("last_message_at", { withTimezone: true }),
    last_message_preview: text("last_message_preview"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookingUniq: uniqueIndex("chat_threads_booking_uniq").on(t.booking_type, t.booking_id),
  }),
);

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  thread_id: integer("thread_id")
    .notNull()
    .references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  sender_id: integer("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatThread = typeof chatThreadsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
