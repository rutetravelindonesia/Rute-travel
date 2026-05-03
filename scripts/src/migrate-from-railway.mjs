import pg from "/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js";

const { Pool } = pg;

const RAILWAY_URL =
  "postgresql://postgres:nPfXMJVgTpsBShiNQHlRegjmpYmIInpt@yamabiko.proxy.rlwy.net:47329/railway";
const REPLIT_URL = process.env.DATABASE_URL;

if (!REPLIT_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const railway = new Pool({ connectionString: RAILWAY_URL, ssl: false });
const replit = new Pool({ connectionString: REPLIT_URL });

const TABLES = [
  "users",
  "sessions",
  "kota_list",
  "schedules",
  "waypoints",
  "schedule_bookings",
  "kendaraan",
  "carter_settings",
  "carter_bookings",
  "tebengan_pulang",
  "tebengan_bookings",
  "chat_threads",
  "chat_messages",
  "push_subscriptions",
  "otp_codes",
  "ratings",
  "notifications",
  "announcements",
  "route_prices",
  "admin_logs",
];

async function tableExists(client, table) {
  const res = await client.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
    [table]
  );
  return res.rows[0].exists;
}

async function migrateTable(tableName) {
  const exists = await tableExists(railway, tableName);
  if (!exists) {
    console.log(`  [skip] ${tableName} — tidak ada di Railway`);
    return;
  }

  const countRes = await railway.query(`SELECT COUNT(*) FROM "${tableName}"`);
  const count = parseInt(countRes.rows[0].count);
  if (count === 0) {
    console.log(`  [skip] ${tableName} — kosong`);
    return;
  }

  console.log(`  [migrate] ${tableName} — ${count} baris...`);

  const dataRes = await railway.query(`SELECT * FROM "${tableName}"`);
  if (dataRes.rows.length === 0) return;

  const columns = Object.keys(dataRes.rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const colList = columns.map((c) => `"${c}"`).join(", ");

  const insertSQL = `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

  let inserted = 0;
  for (const row of dataRes.rows) {
    try {
      await replit.query(insertSQL, columns.map((c) => row[c]));
      inserted++;
    } catch (err) {
      console.warn(`    [warn] row gagal: ${err.message}`);
    }
  }
  console.log(`  [done] ${tableName} — ${inserted}/${count} berhasil`);
}

async function main() {
  console.log("Memulai migrasi data dari Railway ke Replit...\n");

  try {
    await railway.query("SELECT 1");
    console.log("Terhubung ke Railway ✓");
  } catch (err) {
    console.error("Gagal konek ke Railway:", err.message);
    process.exit(1);
  }

  try {
    await replit.query("SELECT 1");
    console.log("Terhubung ke Replit DB ✓\n");
  } catch (err) {
    console.error("Gagal konek ke Replit DB:", err.message);
    process.exit(1);
  }

  // Disable foreign key checks sementara
  await replit.query("SET session_replication_role = replica");

  for (const table of TABLES) {
    await migrateTable(table);
  }

  // Re-enable foreign key checks
  await replit.query("SET session_replication_role = DEFAULT");

  // Reset sequences agar ID auto-increment tidak bentrok
  console.log("\nMereset sequences...");
  const seqRes = await replit.query(`
    SELECT sequence_name FROM information_schema.sequences 
    WHERE sequence_schema = 'public'
  `);
  for (const { sequence_name } of seqRes.rows) {
    const tableName = sequence_name.replace(/_id_seq$/, "").replace(/_seq$/, "");
    try {
      await replit.query(
        `SELECT setval('${sequence_name}', COALESCE((SELECT MAX(id) FROM "${tableName}"), 1))`
      );
    } catch (_) {}
  }

  console.log("\nMigrasi selesai!");
  await railway.end();
  await replit.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
