import app from "./app";
import { logger } from "./lib/logger";
import { startReminderCron } from "./lib/reminders";
import { runMigrations, seedAdmin, seedKota } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function boot(): Promise<void> {
  await runMigrations();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startReminderCron();
    seedAdmin();
    seedKota();
  });
}

boot().catch((err) => {
  logger.error({ err }, "Boot failed");
  process.exit(1);
});
