import { pool } from "@workspace/db";
import { sendPushToUser } from "./push";

export async function createNotification(
  userId: number,
  type: string,
  title: string,
  body?: string,
  refType?: string,
  refId?: number,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, title, body ?? null, refType ?? null, refId ?? null],
    );
  } catch {
    // silent — don't disrupt main flow
  }

  // juga kirim push notification ke device pengguna
  sendPushToUser(userId, { title, body: body ?? "", tag: type }).catch(() => {});
}
