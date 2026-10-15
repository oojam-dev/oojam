// GET /_oojam/callback?token=…&return=/path: build.oojam.dev sends signed-in visitors here.
// MANAGED BY OOJAM — builds may not change this file.
import { redirect } from "react-router";

import { safeReturnPath, verifyViewerToken, viewerCookie } from "~/lib/oojam-identity.server";
import type { Route } from "./+types/_oojam.callback";

export function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const returnTo = safeReturnPath(url.searchParams.get("return"));
  const viewer = verifyViewerToken(token);
  if (!viewer || !token) return redirect(returnTo);
  return redirect(returnTo, {
    headers: { "Set-Cookie": viewerCookie(token, viewer.exp), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}
