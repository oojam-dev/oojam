import { describe, expect, it } from "vitest";

import { cleanText, REPORT_HIDE_THRESHOLD, reporterKey, shouldHide } from "./ugc.server";

describe("cleanText", () => {
  it("trims and collapses whitespace to one line by default", () => {
    expect(cleanText("  hello \n\n  world\t! ", 100)).toBe("hello world !");
  });

  it("returns an empty string for non-strings and blank input", () => {
    expect(cleanText(undefined, 10)).toBe("");
    expect(cleanText(42, 10)).toBe("");
    expect(cleanText(new Blob(["x"]), 10)).toBe("");
    expect(cleanText(" \u200B\n\t ", 10)).toBe("");
  });

  it("strips control characters", () => {
    expect(cleanText("a\u0000b\u0007c\u001Bd\u007Fe\u0085f", 100)).toBe("abcdef");
  });

  it("strips invisible and bidi-override characters but keeps emoji joiners", () => {
    expect(cleanText("pay\u202Elapyap\u202C", 100)).toBe("paylapyap");
    expect(cleanText("\uFEFFzero\u200Bwidth", 100)).toBe("zerowidth");
    const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
    expect(cleanText(family, 100)).toBe(family);
  });

  it("normalizes to NFC", () => {
    expect(cleanText("cafe\u0301", 100)).toBe("caf\u00E9");
  });

  it("enforces maxLen in code points without splitting surrogate pairs", () => {
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText("\u{1F600}\u{1F600}\u{1F600}", 2)).toBe("\u{1F600}\u{1F600}");
    expect(cleanText("abc   def", 4)).toBe("abc");
  });

  it("keeps line breaks in multiline mode, at most one blank line", () => {
    expect(cleanText("line one  \r\nline   two\r\n\r\n\r\n\r\nend", 100, { multiline: true })).toBe(
      "line one\nline two\n\nend",
    );
  });

  it("leaves HTML as text (React escapes it when rendering)", () => {
    expect(cleanText("<script>alert(1)</script>", 100)).toBe("<script>alert(1)</script>");
  });

  it("rejects a bad maxLen", () => {
    expect(() => cleanText("x", 0)).toThrow();
    expect(() => cleanText("x", 1.5)).toThrow();
  });
});

describe("report-to-hide", () => {
  it("hides at three reports", () => {
    expect(REPORT_HIDE_THRESHOLD).toBe(3);
    expect(shouldHide(2)).toBe(false);
    expect(shouldHide(3)).toBe(true);
    expect(shouldHide(10)).toBe(true);
  });

  it("derives a stable reporter key per IP without exposing it", () => {
    const a = new Request("http://localhost/", { headers: { "x-forwarded-for": "203.0.113.7" } });
    const b = new Request("http://localhost/", { headers: { "x-forwarded-for": "198.51.100.4" } });
    expect(reporterKey(a)).toBe(reporterKey(a.clone()));
    expect(reporterKey(a)).not.toBe(reporterKey(b));
    expect(reporterKey(a)).toMatch(/^[0-9a-f]{32}$/);
    expect(reporterKey(a)).not.toContain("203.0.113.7");
  });
});
