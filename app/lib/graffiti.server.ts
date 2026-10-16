// Server-side checks for the graffiti wall: the drawn image and the link each piece points to.
import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_PNG_BYTES } from "./graffiti";
import { cleanText } from "./ugc.server";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URL_PREFIX = "data:image/png;base64,";

export type PngResult = { ok: true; png: Buffer } | { ok: false; error: string };

/**
 * Checks that a `canvas.toDataURL()` string is a PNG of exactly the drawing canvas's size,
 * no bigger than MAX_PNG_BYTES. Returns the decoded bytes.
 */
export function parsePngDataUrl(
  input: unknown,
  width = CANVAS_WIDTH,
  height = CANVAS_HEIGHT,
  maxBytes = MAX_PNG_BYTES,
): PngResult {
  const invalid = { ok: false, error: "That drawing couldn't be read. Please try again." } as const;
  if (typeof input !== "string" || !input.startsWith(DATA_URL_PREFIX)) return invalid;
  const base64 = input.slice(DATA_URL_PREFIX.length);
  if (base64.length > Math.ceil(maxBytes / 3) * 4) {
    return { ok: false, error: "That piece is too detailed to save. Try fewer layers of spray." };
  }
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return invalid;
  const png = Buffer.from(base64, "base64");
  if (png.length > maxBytes) {
    return { ok: false, error: "That piece is too detailed to save. Try fewer layers of spray." };
  }
  // Signature, then an IHDR chunk (length 13) holding the width and height, and IEND last.
  if (png.length < 8 + 25 + 12) return invalid;
  if (!PNG_SIGNATURE.every((byte, i) => png[i] === byte)) return invalid;
  if (png.readUInt32BE(8) !== 13 || png.toString("latin1", 12, 16) !== "IHDR") return invalid;
  if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) return invalid;
  if (png.toString("latin1", png.length - 8, png.length - 4) !== "IEND") return invalid;
  return { ok: true, png };
}

/** True for Postgres "could not serialize access" errors (two painters racing for a spot). */
export function isSerializationFailure(error: unknown): boolean {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 4; depth++) {
    if ((e as { code?: unknown }).code === "40001") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const MAX_LINK_LENGTH = 300;

export type LinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Cleans the website a piece links to. Only plain http(s) links to a real-looking host are
 * allowed, with no username or password in them. Blank means "link to my GitHub profile".
 */
export function parseLink(input: unknown, fallback: string): LinkResult {
  let text = cleanText(input, MAX_LINK_LENGTH + 1);
  if (!text) return { ok: true, url: fallback };
  if (text.length > MAX_LINK_LENGTH) return { ok: false, error: "That link is too long." };
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  const invalid = { ok: false, error: "Enter a website address like https://example.com." } as const;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return invalid;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return invalid;
  if (url.username || url.password) return invalid;
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) return invalid;
  if (url.href.length > MAX_LINK_LENGTH) return { ok: false, error: "That link is too long." };
  return { ok: true, url: url.href };
}
