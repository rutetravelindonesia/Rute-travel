import { Router, type IRouter } from "express";
import { eq, and, desc, asc, gt, inArray, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  sessionsTable,
  usersTable,
  schedulesTable,
  scheduleBookingsTable,
  carterSettingsTable,
  carterBookingsTable,
  chatThreadsTable,
  chatMessagesTable,
} from "@workspace/db";
import { sendPushToUser } from "../lib/push";

const router: IRouter = Router();

async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const now = new Date();
  const [session] = await db.select().from(sessionsTable).where(and(eq(sessionsTable.token, token)));
  if (!session || session.expires_at < now) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.user_id));
  return user ?? null;
}

const ACTIVE_STATUSES = new Set(["pending", "paid", "aktif"]);
const ARCHIVED_STATUSES = new Set(["selesai", "batal"]);

function maskBody(input: string): string {
  let out = input;
  out = out.replace(/(?:\+?62|\b0)[\s\-]?8\d[\d\s\-]{6,15}/g, "[nomor disembunyikan]");
  out = out.replace(/\b\d[\d\s\-]{8,}\b/g, (m) => {
    const digits = m.replace(/\D/g, "");
    return digits.length >= 9 ? "[nomor disembunyikan]" : m;
  });
  return out;
}

const CreateThreadBody = z.object({
  booking_type: z.enum(["schedule", "carter"]),
  booking_id: z.number().int().positive(),
});

const SendMessageBody = z.object({
  body: z.string().min(1).max(2000),
});

async function loadBookingParticipants(
  booking_type: "schedule" | "carter",
  booking_id: number,
): Promise<{ penumpang_id: number; mitra_id: number; status: string } | null> {
  if (booking_type === "schedule") {
    const [b] = await db
      .select({
        penumpang_id: scheduleBookingsTable.penumpang_id,
        mitra_id: schedulesTable.driver_id,
        status: scheduleBookingsTable.status,
      })
      .from(scheduleBookingsTable)
      .innerJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
      .where(eq(scheduleBookingsTable.id, booking_id));
    return b ?? null;
  }
  const [b] = await db
    .select({
      penumpang_id: carterBookingsTable.penumpang_id,
      mitra_id: carterSettingsTable.driver_id,
      status: carterBookingsTable.status,
    })
    .from(carterBookingsTable)
    .innerJoin(carterSettingsTable, eq(carterSettingsTable.id, carterBookingsTable.settings_id))
    .where(eq(carterBookingsTable.id, booking_id));
  return b ?? null;
}

router.post("/chat/threads", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const parsed = CreateThreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { booking_type, booking_id } = parsed.data;

  const participants = await loadBookingParticipants(booking_type, booking_id);
  if (!participants) {
    res.status(404).json({ error: "Booking tidak ditemukan." });
    return;
  }
  if (participants.penumpang_id !== user.id && participants.mitra_id !== user.id) {
    res.status(403).json({ error: "Tidak boleh mengakses chat ini." });
    return;
  }
  if (participants.penumpang_id === participants.mitra_id) {
    res.status(400).json({ error: "Penumpang dan mitra tidak boleh sama." });
    return;
  }

  const [existing] = await db
    .select({ id: chatThreadsTable.id })
    .from(chatThreadsTable)
    .where(
      and(
        eq(chatThreadsTable.booking_type, booking_type),
        eq(chatThreadsTable.booking_id, booking_id),
      ),
    );
  if (existing) {
    res.json({ id: existing.id });
    return;
  }

  const inserted = await db
    .insert(chatThreadsTable)
    .values({
      booking_type,
      booking_id,
      penumpang_id: participants.penumpang_id,
      mitra_id: participants.mitra_id,
    })
    .onConflictDoNothing({
      target: [chatThreadsTable.booking_type, chatThreadsTable.booking_id],
    })
    .returning({ id: chatThreadsTable.id });
  if (inserted[0]) {
    res.json({ id: inserted[0].id });
    return;
  }

  const [raced] = await db
    .select({ id: chatThreadsTable.id })
    .from(chatThreadsTable)
    .where(
      and(
        eq(chatThreadsTable.booking_type, booking_type),
        eq(chatThreadsTable.booking_id, booking_id),
      ),
    );
  if (!raced) {
    res.status(500).json({ error: "Gagal membuat thread chat." });
    return;
  }
  res.json({ id: raced.id });
});

router.get("/chat/threads/mine", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const filterRaw = String(req.query.status ?? "aktif");
  const filter = filterRaw === "riwayat" ? "riwayat" : "aktif";

  const threads = await db
    .select({
      id: chatThreadsTable.id,
      booking_type: chatThreadsTable.booking_type,
      booking_id: chatThreadsTable.booking_id,
      penumpang_id: chatThreadsTable.penumpang_id,
      mitra_id: chatThreadsTable.mitra_id,
      last_message_at: chatThreadsTable.last_message_at,
      last_message_preview: chatThreadsTable.last_message_preview,
    })
    .from(chatThreadsTable)
    .where(or(eq(chatThreadsTable.penumpang_id, user.id), eq(chatThreadsTable.mitra_id, user.id)))
    .orderBy(desc(chatThreadsTable.last_message_at), desc(chatThreadsTable.id));

  if (threads.length === 0) {
    res.json([]);
    return;
  }

  const scheduleIds = threads.filter((t) => t.booking_type === "schedule").map((t) => t.booking_id);
  const carterIds = threads.filter((t) => t.booking_type === "carter").map((t) => t.booking_id);

  const scheduleRows = scheduleIds.length
    ? await db
        .select({
          id: scheduleBookingsTable.id,
          status: scheduleBookingsTable.status,
          origin_city: schedulesTable.origin_city,
          destination_city: schedulesTable.destination_city,
          travel_date: schedulesTable.departure_date,
          travel_time: schedulesTable.departure_time,
        })
        .from(scheduleBookingsTable)
        .innerJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
        .where(inArray(scheduleBookingsTable.id, scheduleIds))
    : [];
  const carterRows = carterIds.length
    ? await db
        .select({
          id: carterBookingsTable.id,
          status: carterBookingsTable.status,
          origin_city: carterBookingsTable.origin_city,
          destination_city: carterBookingsTable.destination_city,
          travel_date: carterBookingsTable.travel_date,
          travel_time: carterBookingsTable.travel_time,
        })
        .from(carterBookingsTable)
        .where(inArray(carterBookingsTable.id, carterIds))
    : [];

  const counterpartIds = Array.from(
    new Set(threads.map((t) => (t.penumpang_id === user.id ? t.mitra_id : t.penumpang_id))),
  );
  const counterparts = counterpartIds.length
    ? await db
        .select({ id: usersTable.id, nama: usersTable.nama, role: usersTable.role, foto_profil: usersTable.foto_profil })
        .from(usersTable)
        .where(inArray(usersTable.id, counterpartIds))
    : [];
  const counterpartMap = new Map(counterparts.map((u) => [u.id, u]));
  const scheduleMap = new Map(scheduleRows.map((r) => [r.id, r]));
  const carterMap = new Map(carterRows.map((r) => [r.id, r]));

  const enriched = threads
    .map((t) => {
      const booking = t.booking_type === "schedule" ? scheduleMap.get(t.booking_id) : carterMap.get(t.booking_id);
      if (!booking) return null;
      const counterpart = counterpartMap.get(t.penumpang_id === user.id ? t.mitra_id : t.penumpang_id);
      return {
        id: t.id,
        booking_type: t.booking_type,
        booking_id: t.booking_id,
        booking_status: booking.status,
        origin_city: booking.origin_city,
        destination_city: booking.destination_city,
        travel_date: booking.travel_date,
        travel_time: booking.travel_time,
        last_message_at: t.last_message_at,
        last_message_preview: t.last_message_preview,
        counterpart: counterpart
          ? { id: counterpart.id, nama: counterpart.nama, role: counterpart.role, foto_profil: counterpart.foto_profil ?? null }
          : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .filter((x) =>
      filter === "aktif" ? ACTIVE_STATUSES.has(x.booking_status) : ARCHIVED_STATUSES.has(x.booking_status),
    );

  res.json(enriched);
});

router.get("/chat/threads/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }

  const [t] = await db
    .select({
      id: chatThreadsTable.id,
      booking_type: chatThreadsTable.booking_type,
      booking_id: chatThreadsTable.booking_id,
      penumpang_id: chatThreadsTable.penumpang_id,
      mitra_id: chatThreadsTable.mitra_id,
    })
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Thread tidak ditemukan." });
    return;
  }
  if (t.penumpang_id !== user.id && t.mitra_id !== user.id) {
    res.status(403).json({ error: "Tidak boleh mengakses chat ini." });
    return;
  }

  const participants = await loadBookingParticipants(
    t.booking_type as "schedule" | "carter",
    t.booking_id,
  );
  const counterpartId = t.penumpang_id === user.id ? t.mitra_id : t.penumpang_id;
  const [counterpart] = await db
    .select({ id: usersTable.id, nama: usersTable.nama, role: usersTable.role, foto_profil: usersTable.foto_profil })
    .from(usersTable)
    .where(eq(usersTable.id, counterpartId));

  let booking_meta: Record<string, unknown> | null = null;
  if (t.booking_type === "schedule") {
    const [b] = await db
      .select({
        id: scheduleBookingsTable.id,
        status: scheduleBookingsTable.status,
        origin_city: schedulesTable.origin_city,
        destination_city: schedulesTable.destination_city,
        travel_date: schedulesTable.departure_date,
        travel_time: schedulesTable.departure_time,
      })
      .from(scheduleBookingsTable)
      .innerJoin(schedulesTable, eq(schedulesTable.id, scheduleBookingsTable.schedule_id))
      .where(eq(scheduleBookingsTable.id, t.booking_id));
    booking_meta = b ?? null;
  } else {
    const [b] = await db
      .select({
        id: carterBookingsTable.id,
        status: carterBookingsTable.status,
        origin_city: carterBookingsTable.origin_city,
        destination_city: carterBookingsTable.destination_city,
        travel_date: carterBookingsTable.travel_date,
        travel_time: carterBookingsTable.travel_time,
      })
      .from(carterBookingsTable)
      .where(eq(carterBookingsTable.id, t.booking_id));
    booking_meta = b ?? null;
  }

  const sinceParam = req.query.since as string | undefined;
  const sinceId = sinceParam ? Number(sinceParam) : 0;
  const messages = await db
    .select({
      id: chatMessagesTable.id,
      thread_id: chatMessagesTable.thread_id,
      sender_id: chatMessagesTable.sender_id,
      body: chatMessagesTable.body,
      created_at: chatMessagesTable.created_at,
    })
    .from(chatMessagesTable)
    .where(
      Number.isInteger(sinceId) && sinceId > 0
        ? and(eq(chatMessagesTable.thread_id, id), gt(chatMessagesTable.id, sinceId))
        : eq(chatMessagesTable.thread_id, id),
    )
    .orderBy(asc(chatMessagesTable.id))
    .limit(200);

  res.json({
    id: t.id,
    booking_type: t.booking_type,
    booking_id: t.booking_id,
    booking_status: participants?.status ?? booking_meta?.status ?? null,
    booking: booking_meta,
    me_role: t.penumpang_id === user.id ? "penumpang" : "mitra",
    counterpart: counterpart ? { id: counterpart.id, nama: counterpart.nama, role: counterpart.role, foto_profil: counterpart.foto_profil ?? null } : null,
    messages: messages.map((m) => ({
      id: m.id,
      sender_id: m.sender_id,
      body: m.body,
      created_at: m.created_at,
      is_mine: m.sender_id === user.id,
    })),
  });
});

router.post("/chat/threads/:id/messages", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "ID tidak valid." });
    return;
  }
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [t] = await db
    .select({
      id: chatThreadsTable.id,
      booking_type: chatThreadsTable.booking_type,
      booking_id: chatThreadsTable.booking_id,
      penumpang_id: chatThreadsTable.penumpang_id,
      mitra_id: chatThreadsTable.mitra_id,
    })
    .from(chatThreadsTable)
    .where(eq(chatThreadsTable.id, id));
  if (!t) {
    res.status(404).json({ error: "Thread tidak ditemukan." });
    return;
  }
  if (t.penumpang_id !== user.id && t.mitra_id !== user.id) {
    res.status(403).json({ error: "Tidak boleh mengirim pesan di chat ini." });
    return;
  }

  const participants = await loadBookingParticipants(
    t.booking_type as "schedule" | "carter",
    t.booking_id,
  );
  if (participants && ARCHIVED_STATUSES.has(participants.status)) {
    res.status(403).json({ error: "Orderan sudah selesai/batal — chat hanya bisa dibaca." });
    return;
  }

  const sanitized = maskBody(parsed.data.body).trim();
  if (!sanitized) {
    res.status(400).json({ error: "Pesan kosong setelah filter." });
    return;
  }

  const [msg] = await db
    .insert(chatMessagesTable)
    .values({ thread_id: id, sender_id: user.id, body: sanitized })
    .returning({
      id: chatMessagesTable.id,
      sender_id: chatMessagesTable.sender_id,
      body: chatMessagesTable.body,
      created_at: chatMessagesTable.created_at,
    });

  await db
    .update(chatThreadsTable)
    .set({
      last_message_at: msg.created_at,
      last_message_preview: sanitized.slice(0, 120),
      updated_at: sql`now()`,
    })
    .where(eq(chatThreadsTable.id, id));

  const recipientId = t.penumpang_id === user.id ? t.mitra_id : t.penumpang_id;
  sendPushToUser(recipientId, {
    title: `Pesan dari ${user.nama}`,
    body: sanitized.length > 80 ? sanitized.slice(0, 80) + "…" : sanitized,
    tag: `chat-${id}`,
    url: `/chat/${id}`,
  }).catch(() => {});

  res.json({
    id: msg.id,
    sender_id: msg.sender_id,
    body: msg.body,
    created_at: msg.created_at,
    is_mine: true,
  });
});

export default router;
