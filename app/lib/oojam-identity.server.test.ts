import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import { getViewer, safeReturnPath, signInUrl, verifyViewerToken } from "./oojam-identity.server";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const pub = publicKey.export({ type: "spki", format: "pem" }).toString();

function token(claims: Record<string, unknown>, key = privateKey) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(null, Buffer.from(payload), key).toString("base64url")}`;
}
const now = Date.parse("2026-10-15T12:00:00Z");
const good = { v: 1, aud: "oojam.dev", sub: 42, login: "octocat", iat: now / 1000 - 10, exp: now / 1000 + 3600 };

describe("oojam identity", () => {
  it("accepts a token signed by the platform", () => {
    expect(verifyViewerToken(token(good), now, pub)).toMatchObject({ githubId: 42, login: "octocat" });
  });

  it("rejects forged, expired, wrong-audience or malformed tokens", () => {
    const other = generateKeyPairSync("ed25519").privateKey;
    const forgedPayload = Buffer.from(JSON.stringify({ ...good, login: "admin" })).toString("base64url");
    const realSig = token(good).split(".")[1];
    for (const bad of [
      token(good, other),
      `${forgedPayload}.${realSig}`,
      token({ ...good, exp: now / 1000 - 1 }),
      token({ ...good, aud: "evil.example" }),
      token({ ...good, v: 2 }),
      token({ ...good, login: "bad login<script>" }),
      token({ ...good, sub: -1 }),
      "nonsense",
      `${token(good)}.extra`,
      "",
    ]) {
      expect(verifyViewerToken(bad, now, pub)).toBeNull();
    }
  });

  it("the committed public key rejects tokens from any other key", () => {
    expect(verifyViewerToken(token(good), now)).toBeNull();
    expect(getViewer(new Request("https://oojam.dev/", { headers: { cookie: `oojam_viewer=${token(good)}` } }))).toBeNull();
  });

  it("only returns to same-site paths", () => {
    expect(safeReturnPath("/photos?page=2")).toBe("/photos?page=2");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "", null]) expect(safeReturnPath(bad)).toBe("/");
    expect(signInUrl("/photos")).toBe("https://build.oojam.dev/connect?return=%2Fphotos");
  });
});
