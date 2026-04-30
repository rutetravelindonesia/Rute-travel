import { Router, type IRouter } from "express";
import { db, sessionsTable, usersTable, pool } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const router: IRouter = Router();

async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const now = new Date();
  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.token, token)));
  if (!session || session.expires_at < now) return null;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.user_id));
  return user ?? null;
}

router.get("/notifications", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  const result = await pool.query(
    `SELECT id, type, title, body, ref_type, ref_id, is_read, created_at
     FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`,
    [user.id],
  );
  res.json(result.rows);
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  const result = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE`,
    [user.id],
  );
  res.json({ count: parseInt(result.rows[0].count, 10) });
});

router.patch("/notifications/read-all", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  await pool.query(`UPDATE notifications SET is_read=TRUE WHERE user_id=$1`, [user.id]);
  res.json({ ok: true });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid." }); return; }

  await pool.query(
    `UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2`,
    [id, user.id],
  );
  res.json({ ok: true });
});

export default router;
