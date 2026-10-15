// GET /_health — used by the deployer and CI to decide whether this release is up.
// Resource route (no default export). Protected: builds must not change this file.
import { sql } from "drizzle-orm";

import { getDb, hasDatabase } from "~/db/client.server";

const DB_TIMEOUT_MS = 3_000;

async function databaseOk(): Promise<boolean> {
  if (!hasDatabase()) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), DB_TIMEOUT_MS);
    });
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
    return true;
  } catch (error) {
    console.error("_health: database check failed:", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function loader() {
  const ok = await databaseOk();
  return Response.json(
    { ok, sha: process.env.GIT_SHA ?? "dev" },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
