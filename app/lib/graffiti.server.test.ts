import { describe, expect, it } from "vitest";

import { isSerializationFailure, parseLink, parsePngDataUrl } from "./graffiti.server";

/** A minimal PNG-shaped buffer: signature, IHDR with the given size, and IEND. */
function fakePng(width: number, height: number, padding = 0): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write("IHDR", 4, "latin1");
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  return Buffer.concat([signature, ihdr, Buffer.alloc(padding), iend]);
}

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

describe("parsePngDataUrl", () => {
  it("accepts a PNG of the canvas size", () => {
    const png = fakePng(480, 300);
    const result = parsePngDataUrl(dataUrl(png), 480, 300);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.png.equals(png)).toBe(true);
  });

  it("rejects the wrong dimensions", () => {
    expect(parsePngDataUrl(dataUrl(fakePng(481, 300)), 480, 300).ok).toBe(false);
    expect(parsePngDataUrl(dataUrl(fakePng(480, 3000)), 480, 300).ok).toBe(false);
  });

  it("rejects other types and malformed data", () => {
    expect(parsePngDataUrl(undefined, 480, 300).ok).toBe(false);
    expect(parsePngDataUrl("data:image/svg+xml;base64,PHN2Zz4=", 480, 300).ok).toBe(false);
    expect(parsePngDataUrl("data:image/png;base64,not base64!", 480, 300).ok).toBe(false);
    expect(parsePngDataUrl(`data:image/png;base64,${Buffer.from("<html>hello</html>").toString("base64")}`, 480, 300).ok).toBe(false);
    const truncated = fakePng(480, 300).subarray(0, 40);
    expect(parsePngDataUrl(dataUrl(truncated), 480, 300).ok).toBe(false);
  });

  it("rejects images over the byte limit", () => {
    const result = parsePngDataUrl(dataUrl(fakePng(480, 300, 2000)), 480, 300, 1000);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("too detailed") });
  });
});

describe("parseLink", () => {
  const fallback = "https://github.com/someone";

  it("falls back when blank", () => {
    expect(parseLink("", fallback)).toEqual({ ok: true, url: fallback });
    expect(parseLink("   ", fallback)).toEqual({ ok: true, url: fallback });
    expect(parseLink(null, fallback)).toEqual({ ok: true, url: fallback });
  });

  it("accepts http(s) links and adds https:// when missing", () => {
    expect(parseLink("https://example.com/page?a=1", fallback)).toEqual({ ok: true, url: "https://example.com/page?a=1" });
    expect(parseLink("example.com", fallback)).toEqual({ ok: true, url: "https://example.com/" });
    expect(parseLink("http://example.org", fallback)).toEqual({ ok: true, url: "http://example.org/" });
  });

  it("rejects dangerous or odd schemes", () => {
    expect(parseLink("javascript:alert(1)", fallback).ok).toBe(false);
    expect(parseLink("data:text/html,hi", fallback).ok).toBe(false);
    expect(parseLink("ftp://example.com", fallback).ok).toBe(false);
  });

  it("rejects credentials, bare hosts and overlong links", () => {
    expect(parseLink("https://user:pass@example.com", fallback).ok).toBe(false);
    expect(parseLink("https://localhost", fallback).ok).toBe(false);
    expect(parseLink(`https://example.com/${"a".repeat(400)}`, fallback).ok).toBe(false);
  });
});

describe("isSerializationFailure", () => {
  it("finds the Postgres code directly or on a wrapped cause", () => {
    expect(isSerializationFailure({ code: "40001" })).toBe(true);
    expect(isSerializationFailure(new Error("wrapped", { cause: { code: "40001" } }))).toBe(true);
    expect(isSerializationFailure({ code: "23505" })).toBe(false);
    expect(isSerializationFailure(null)).toBe(false);
  });
});
