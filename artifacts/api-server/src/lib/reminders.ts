import cron from "node-cron";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, schedulesTable, scheduleBookingsTable } from "@workspace/db";
import { sendPushToUser } from "./push";

function currentWITAMinutes(): number {
  const witaMs = Date.now() + 8 * 60 * 60 * 1000;
  const d = new Date(witaMs);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function currentWITADate(): string {
  const witaMs = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(witaMs).toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

async function sendReminders(minutesBefore: number): Promise<void> {
  const nowMin = currentWITAMinutes();
  const today = currentWITADate();

  const targetMin = nowMin + minutesBefore;
  if (targetMin >= 24 * 60) return;

  const targetH = Math.floor(targetMin / 60);
  const targetM = targetMin % 60;
  const targetTime = `${String(targetH).padStart(2, "0")}:${String(targetM).padStart(2, "0")}`;

  const schedules = await db
    .select({
      id: schedulesTable.id,
      driver_id: schedulesTable.driver_id,
      origin_city: schedulesTable.origin_city,
      destination_city: schedulesTable.destination_city,
      departure_time: schedulesTable.departure_time,
    })
    .from(schedulesTable)
    .where(
      and(
        eq(schedulesTable.departure_date, today),
        eq(schedulesTable.status, "active"),
        inArray(schedulesTable.trip_progress, ["belum_jemput"]),
        sql`LEFT(${schedulesTable.departure_time}, 5) = ${targetTime}`,
      ),
    );

  for (const s of schedules) {
    const label = minutesBefore === 60 ? "1 jam" : "15 menit";
    const body = `Jadwal ${s.origin_city} → ${s.destination_city} pukul ${s.departure_time.slice(0, 5)} berangkat dalam ${label}.`;

    sendPushToUser(s.driver_id, {
      title: `Pengingat Keberangkatan (${label} lagi)`,
      body,
      tag: `departure-reminder-${s.id}-${minutesBefore}`,
      url: "/jadwal",
    }).catch(() => {});

    const passengers = await db
      .select({ penumpang_id: scheduleBookingsTable.penumpang_id })
      .from(scheduleBookingsTable)
      .where(
        and(
          eq(scheduleBookingsTable.schedule_id, s.id),
          sql`${scheduleBookingsTable.status} <> 'batal'`,
        ),
      );

    for (const p of passengers) {
      sendPushToUser(p.penumpang_id, {
        title: `Perjalanan Segera Berangkat (${label} lagi)`,
        body,
        tag: `departure-reminder-${s.id}-${minutesBefore}`,
        url: "/pesanan",
      }).catch(() => {});
    }
  }
}

export function startReminderCron(): void {
  cron.schedule("* * * * *", async () => {
    try {
      await sendReminders(60);
      await sendReminders(15);
    } catch (err) {
      console.error("[reminders] cron error:", err);
    }
  });
}
