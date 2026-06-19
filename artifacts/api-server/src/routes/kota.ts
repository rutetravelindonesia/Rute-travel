import { Router } from "express";
import { db, kotaListTable } from "@workspace/db";

const router = Router();

router.get("/kota", async (_req, res) => {
  const rows = await db.select().from(kotaListTable).orderBy(kotaListTable.nama_kota);
  res.json(rows);
});

export default router;
