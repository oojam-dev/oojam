/**
 * The changelog: one entry per idea the community voted for and Claude built.
 *
 * content/builds.json is written by the oojam platform when a build merges. Never edit
 * it by hand or from a build. It's bundled at build time, so a malformed file fails
 * `npm run build` and the tests rather than the live site.
 */
import raw from "../../content/builds.json";

export type BuildEntry = {
  /** UTC day of the build, `YYYY-MM-DD`. */
  day: string;
  /** The idea's id on build.oojam.dev. */
  /** The idea that was built, or null on a housekeeping day (no idea on the board). */
  ideaId: number | null;
  title: string;
  /** GitHub login of the idea's author. */
  author: string;
  prUrl: string;
  /** One line describing what was built. */
  summary: string;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// GitHub logins: 1–39 alphanumerics or single hyphens, not starting or ending with one.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

function fail(index: number, message: string): never {
  throw new Error(`content/builds.json entry ${index}: ${message}`);
}

function requireString(entry: Record<string, unknown>, key: string, index: number): string {
  const value = entry[key];
  if (typeof value !== "string" || value.trim() === "") fail(index, `"${key}" must be a non-empty string`);
  return value;
}

/** Validates the raw JSON and returns the entries newest first. Throws on bad data. */
export function parseBuilds(data: unknown): BuildEntry[] {
  if (!Array.isArray(data)) throw new Error("content/builds.json must be a JSON array");
  const entries = data.map((item: unknown, index): BuildEntry => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) fail(index, "must be an object");
    const entry = item as Record<string, unknown>;

    const day = requireString(entry, "day", index);
    if (!DAY.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) fail(index, `"day" must be YYYY-MM-DD`);

    const ideaId = entry.ideaId;
    if (ideaId !== null && (typeof ideaId !== "number" || !Number.isSafeInteger(ideaId) || ideaId < 1)) {
      fail(index, `"ideaId" must be a positive integer, or null for housekeeping`);
    }

    const author = requireString(entry, "author", index);
    if (!GITHUB_LOGIN.test(author)) fail(index, `"author" must be a GitHub login`);

    const prUrl = requireString(entry, "prUrl", index);
    let url: URL;
    try {
      url = new URL(prUrl);
    } catch {
      fail(index, `"prUrl" must be a URL`);
    }
    if (url.protocol !== "https:" || url.hostname !== "github.com") fail(index, `"prUrl" must be an https://github.com/ URL`);

    return {
      day,
      ideaId,
      title: requireString(entry, "title", index),
      author,
      prUrl,
      summary: requireString(entry, "summary", index),
    };
  });

  return entries.sort((a, b) => (a.day === b.day ? (b.ideaId ?? 0) - (a.ideaId ?? 0) : a.day < b.day ? 1 : -1));
}

/** All builds, newest first. */
export function loadBuilds(): BuildEntry[] {
  return parseBuilds(raw);
}
