// v38
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/.well-known/assetlinks.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "id.ruteindonesia.travel",
sha256_cert_fingerprints: [
  "63:25:6F:7A:2B:A7:B2:2C:8E:A6:28:96:F8:56:A5:41:8C:92:64:70:55:A4:D4:9A:38:1C:33:B0:22:74:51:CC"
]
    }
  }]);
});

app.use("/api", router);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../../artifacts/rute-travel/dist/public");
if (process.env.NODE_ENV === "production" && process.env.SERVE_FRONTEND !== "false") {
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend static files");
  } else {
    logger.warn({ frontendDist }, "Frontend dist not found — did nixpacks build the frontend?");
  }
}

app.use((err: any, _req: any, res: any, _next: any) => {
  logger.error({ err }, "Unhandled server error");
  const status = typeof err?.status === "number" ? err.status : typeof err?.statusCode === "number" ? err.statusCode : 500;
  res.status(status).json({ error: err?.message ?? "Terjadi kesalahan server." });
});

export default app;
