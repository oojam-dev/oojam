import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

// Cached on globalThis so dev-server hot reloads don't open a new pool each time.
const globalForDb = globalThis as unknown as {
  __oojamDb?: { db: Database; sql: postgres.Sql };
};

/** True when a database is configured (DATABASE_URL is set). */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * The Drizzle client, created on first use from DATABASE_URL. Server-only: import it
 * from loaders, actions and other `.server.ts` modules, never from components.
 */
export function getDb(): Database {
  if (!globalForDb.__oojamDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = postgres(url, { max: 10, connect_timeout: 10, onnotice: () => {} });
    globalForDb.__oojamDb = { db: drizzle(sql, { schema }), sql };
  }
  return globalForDb.__oojamDb.db;
}
