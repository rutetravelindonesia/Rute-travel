import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { eq, and } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { uploadBufferToCloudinary } from "../lib/cloudStorage";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

/**
 * POST /storage/uploads
 *
 * Upload file langsung via multipart/form-data dengan field "file".
 * Mengembalikan { objectPath } berupa URL Cloudinary CDN.
 */
router.post("/storage/uploads", upload.single("file"), async (req: Request, res: Response) => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "File tidak ditemukan." });
    return;
  }

  try {
    const url = await uploadBufferToCloudinary(
      req.file.buffer,
      req.file.mimetype,
      "rute-travel"
    );
    res.json({ objectPath: url, uploadURL: url });
  } catch (error) {
    req.log.error({ err: error }, "Error uploading to Cloudinary");
    res.status(500).json({ error: "Gagal mengunggah file." });
  }
});

/**
 * GET /storage/objects/*path
 *
 * Legacy: objectPath sekarang berupa URL Cloudinary langsung.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  res.status(404).json({ error: "Gunakan URL Cloudinary langsung." });
});

/**
 * GET /storage/public-objects/*filePath
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  res.status(404).json({ error: "Gunakan URL Cloudinary langsung." });
});

export default router;
