/**
 * Building blocks for user-generated content (UGC): anything a visitor submits that other
 * visitors can see. Every UGC feature must:
 *
 *   1. clean and length-limit input with `cleanText` before storing it;
 *   2. rate-limit submissions per IP (`enforceRateLimit` in ./rate-limit.server);
 *   3. render it as plain text through React (`{entry.body}`), which escapes it. Never
 *      `dangerouslySetInnerHTML`, never raw HTML or Markdown-to-HTML;
 *   4. have a report button that hides an item once it has REPORT_HIDE_THRESHOLD (3)
 *      reports from different visitors. The pattern is below.
 *
 * ── Report-to-hide pattern ──────────────────────────────────────────────────────────────
 *
 * Schema (app/db/schema.ts), for a feature called "notes":
 *
 *   export const notes = pgTable("notes", {
 *     id: bigserial("id", { mode: "number" }).primaryKey(),
 *     body: text("body").notNull(),
 *     hiddenAt: timestamp("hidden_at", { withTimezone: true }),
 *     createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 *   });
 *
 *   export const noteReports = pgTable(
 *     "note_reports",
 *     {
 *       id: bigserial("id", { mode: "number" }).primaryKey(),
 *       noteId: bigint("note_id", { mode: "number" }).notNull().references(() => notes.id),
 *       reporter: text("reporter").notNull(), // reporterKey(request), never the raw IP
 *       createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
 *     },
 *     (t) => [unique("note_reports_note_reporter_key").on(t.noteId, t.reporter)],
 *   );
 *
 * Report action:
 *
 *   const reportLimiter = createRateLimiter({ capacity: 10, refillPerMinute: 2 });
 *
 *   export async function action({ request }: Route.ActionArgs) {
 *     enforceRateLimit(request, reportLimiter, "notes-report");
 *     const form = await request.formData();
 *     const id = Number(form.get("id"));
 *     if (!Number.isSafeInteger(id) || id < 1) throw new Response("Bad request", { status: 400 });
 *     await getDb().transaction(async (tx) => {
 *       const added = await tx
 *         .insert(noteReports)
 *         .values({ noteId: id, reporter: reporterKey(request) })
 *         .onConflictDoNothing()
 *         .returning({ id: noteReports.id });
 *       if (added.length === 0) return; // this visitor already reported it
 *       const [row] = await tx
 *         .select({ count: sql<number>`count(*)::int` })
 *         .from(noteReports)
 *         .where(eq(noteReports.noteId, id));
 *       if (shouldHide(row?.count ?? 0)) {
 *         await tx.update(notes).set({ hiddenAt: new Date() })
 *           .where(and(eq(notes.id, id), isNull(notes.hiddenAt)));
 *       }
 *     });
 *     return { reported: true };
 *   }
 *
 * Every query that shows notes to visitors filters `isNull(notes.hiddenAt)`. Hidden items
 * are kept, not deleted. The report button is a small `<Form method="post">` with a hidden
 * `id` input and an accessible label such as "Report this note".
 */
import { createHash } from "node:crypto";

import { clientIp } from "./rate-limit.server";

/** Reports from different visitors needed to hide an item. */
export const REPORT_HIDE_THRESHOLD = 3;

/** True once an item has enough reports to be hidden. */
export function shouldHide(reportCount: number): boolean {
  return reportCount >= REPORT_HIDE_THRESHOLD;
}

/**
 * A stable, non-reversible-at-a-glance key for the visitor making a request, for
 * de-duplicating reports or votes. Store this, never the raw IP address.
 */
export function reporterKey(request: Request): string {
  return createHash("sha256").update(`oojam-reporter|${clientIp(request)}`).digest("hex").slice(0, 32);
}

export type CleanTextOptions = {
  /** Keep line breaks (collapsed to at most one blank line). Default false: one line. */
  multiline?: boolean;
};

// C0 and C1 control characters except tab (\t) and line feed (\n).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Invisible characters used for spoofing: zero-width space, word joiner, BOM, soft hyphen,
// and bidirectional overrides/isolates ("Trojan Source"). ZWJ/ZWNJ are kept for emoji and scripts.
const INVISIBLE = /[\u00AD\u200B\u2060-\u2064\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Cleans visitor-submitted text before it's stored: coerces non-strings to "", normalizes
 * Unicode (NFC) and line endings, strips control and invisible characters, collapses
 * whitespace, trims, and cuts to at most `maxLen` characters (Unicode code points).
 *
 * Returns "" when nothing is left; check for that and reject empty submissions.
 */
export function cleanText(input: unknown, maxLen: number, options: CleanTextOptions = {}): string {
  if (!Number.isSafeInteger(maxLen) || maxLen < 1) throw new Error("cleanText: maxLen must be a positive integer");
  if (typeof input !== "string") return "";

  let text = input.normalize("NFC").replace(/\r\n?|[\u2028\u2029]/g, "\n");
  text = text.replace(CONTROL, "").replace(INVISIBLE, "");

  if (options.multiline) {
    text = text
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/g, " ").trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    text = text.replace(/\s+/g, " ");
  }

  text = text.trim();
  const chars = Array.from(text);
  if (chars.length > maxLen) text = chars.slice(0, maxLen).join("").trimEnd();
  return text;
}
