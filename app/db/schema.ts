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
import { bigint, bigserial, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/** Small key/value settings for the site itself. */
export const siteMeta = pgTable("site_meta", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

/** Graffiti wall: one drawn piece per row, placed on the wall's grid (positions in cells). */
export const graffitiPieces = pgTable("graffiti_pieces", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  githubId: bigint("github_id", { mode: "number" }).notNull(),
  login: text("login").notNull(),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  w: integer("w").notNull(),
  h: integer("h").notNull(),
  /** The drawing, a transparent PNG, base64-encoded. */
  imagePng: text("image_png").notNull(),
  linkUrl: text("link_url").notNull(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const graffitiReports = pgTable(
  "graffiti_reports",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    pieceId: bigint("piece_id", { mode: "number" })
      .notNull()
      .references(() => graffitiPieces.id),
    reporter: text("reporter").notNull(), // reporterKey(request), never the raw IP
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("graffiti_reports_piece_reporter_key").on(t.pieceId, t.reporter)],
);
