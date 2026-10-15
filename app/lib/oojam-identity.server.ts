// "Sign in with oojam": who's visiting, vouched for by build.oojam.dev.
//
// MANAGED BY OOJAM — builds may not change this file (the guardrails block it).
//
// oojam.dev has no accounts and no secrets. Visitors sign in with GitHub on build.oojam.dev,
// which sends them back to /_oojam/callback with a token signed by its Ed25519 private key.
// This file verifies that token with the public key below and keeps it as the session
// cookie. Use getViewer() / requireViewer() / signInUrl() from your features; never read
// the cookie yourself, and never trust a login from anywhere else (forms, headers, URLs).
import { verify } from "node:crypto";

import { redirect } from "react-router";

/** build.oojam.dev's identity public key. The private half never leaves the platform. */
const OOJAM_IDENTITY_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABgcWKvxmhibP8kKgTXYU+GKcUwhwwtDhTeEO2FlO7mw=
-----END PUBLIC KEY-----`;

const PLATFORM_URL = "https://build.oojam.dev";
export const VIEWER_COOKIE = "oojam_viewer";

export interface Viewer {
  /** GitHub user id: stable, use it as the key when storing who did something. */
  githubId: number;
  /** GitHub login: show it as "@login" and link to https://github.com/<login>. */
  login: string;
}

interface Claims {
  v: number;
  aud: string;
  sub: number;
  login: string;
  iat: number;
  exp: number;
}

const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** Checks a token's signature, audience and expiry. Exported for tests. */
export function verifyViewerToken(token: string | undefined | null, now = Date.now(), publicKey = OOJAM_IDENTITY_PUBLIC_KEY): (Viewer & { exp: number }) | null {
  if (!token || token.length > 2048) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    if (!verify(null, Buffer.from(payload), publicKey, Buffer.from(signature, "base64url"))) return null;
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Claims;
    if (c.v !== 1 || c.aud !== "oojam.dev") return null;
    if (!Number.isSafeInteger(c.sub) || c.sub <= 0 || typeof c.login !== "string" || !LOGIN.test(c.login)) return null;
    if (!Number.isFinite(c.exp) || c.exp * 1000 <= now) return null;
    return { githubId: c.sub, login: c.login, exp: c.exp };
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** The signed-in visitor, or null. */
export function getViewer(request: Request): Viewer | null {
  const v = verifyViewerToken(readCookie(request, VIEWER_COOKIE));
  return v ? { githubId: v.githubId, login: v.login } : null;
}

/** Only same-site paths may be returned to. */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/";
  return raw.slice(0, 512);
}

/** Where a "Sign in with GitHub" link should go to come back to `returnTo` on this site. */
export function signInUrl(returnTo: string): string {
  return `${PLATFORM_URL}/connect?return=${encodeURIComponent(safeReturnPath(returnTo))}`;
}

/** The signed-in visitor, or a redirect to sign in and come back here. */
export function requireViewer(request: Request): Viewer {
  const viewer = getViewer(request);
  if (!viewer) {
    const url = new URL(request.url);
    throw redirect(signInUrl(url.pathname + url.search));
  }
  return viewer;
}

export function viewerCookie(token: string, exp: number, now = Date.now()): string {
  const maxAge = Math.max(0, Math.floor(exp - now / 1000));
  return `${VIEWER_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearViewerCookie = () => `${VIEWER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
