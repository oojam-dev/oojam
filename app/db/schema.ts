/**
 * Drizzle schema for the site's Postgres database (DATABASE_URL).
 *
 * Changing the schema:
 *   1. Add tables or columns here. Additive changes only: never remove, rename or retype
 *      an existing table or column (see CLAUDE.md, "Database").
 *   2. Run `npm run db:generate` to write a new migration to drizzle/.
 *   3. Commit the generated .sql file and the drizzle/meta changes. Never edit or delete
 *      an existing migration.
 *
 * Example:
 *
 *   export const guestbookEntries = pgTable("guestbook_entries", {
 *     id: bigserial("id", { mode: "number" }).primaryKey(),
 *     body: text("body").notNull(),
 *     reportCount: integer("report_count").notNull().default(0),
 *     hiddenAt: timestamp("hidden_at", { withTimezone: true }),
 *     createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 *   });
 *
 * New columns on existing tables must be nullable or have a default.
 */
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Small key/value settings for the site itself. */
export const siteMeta = pgTable("site_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
