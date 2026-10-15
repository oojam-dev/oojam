// POST /_oojam/signout: forget who's visiting on this site. (GET works too, so a plain link
// can sign out; signing someone out is harmless.)
// MANAGED BY OOJAM — builds may not change this file.
import { redirect } from "react-router";

import { clearViewerCookie, safeReturnPath } from "~/lib/oojam-identity.server";
import type { Route } from "./+types/_oojam.signout";

function signOut(request: Request) {
  const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return"));
  return redirect(returnTo, { headers: { "Set-Cookie": clearViewerCookie() } });
}

export const loader = ({ request }: Route.LoaderArgs) => signOut(request);
export const action = ({ request }: Route.ActionArgs) => signOut(request);
