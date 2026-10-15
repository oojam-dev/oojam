// Applies the Drizzle migrations in ./drizzle to DATABASE_URL.
// Used by `npm run db:migrate`, locally and by the deployer before each release.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = join(root, "drizzle");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("db:migrate: DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, connect_timeout: 30, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("db:migrate: migrations applied.");
} catch (error) {
  console.error("db:migrate: failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
